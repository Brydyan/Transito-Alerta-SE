<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http\Rules;

use App\Domains\Locations\Models\Location;
use App\Domains\Locations\Repositories\LocationRepository;
use Closure;
use Illuminate\Contracts\Validation\DataAwareRule;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use MatanYadaev\EloquentSpatial\Objects\Point;

/**
 * Cross-checks the submitted `location_id` against the map `geom` point,
 * when both are present. `locations.geom` (administrative boundaries) is
 * only populated once real polygon data is imported — until then (or for
 * any location whose polygon is still missing), this rule stays silent
 * rather than rejecting: it only fails when it can actually prove the
 * point falls outside the selected location's boundary.
 *
 * `locations.geom` is a PostgreSQL-only column (see
 * `2026_06_15_000002_create_locations_table.php`) — it doesn't exist on
 * sqlite, the default test/CI driver, so the spatial lookup is skipped
 * entirely on any non-pgsql connection.
 */
class LocationGeomConsistentRule implements DataAwareRule, ValidationRule
{
    /**
     * Spanish validation messages — hardcoded on purpose.
     *
     * Pinned by `LocationGeomConsistentRuleTest` so a future i18n sweep
     * doesn't drift these strings without an explicit decision. The rest
     * of the app's validation messages stay in English (`APP_LOCALE=en`);
     * these two are the only ones an end user sees when picking a
     * province + cantón on a map of Ecuador.
     */
    private const MSG_PIN_OUT_OF_COVERAGE = 'El punto seleccionado está fuera de cualquier zona conocida. Verifica que la ubicación y el pin correspondan.';

    private const MSG_LOCATION_PIN_MISMATCH = 'La ubicación seleccionada no contiene el punto marcado en el mapa.';

    /** @var array<string, mixed> */
    protected array $data = [];

    public function __construct(protected LocationRepository $locations) {}

    public function setData(array $data): static
    {
        $this->data = $data;

        return $this;
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        // No location selected — nothing to cross-check.
        if ($value === null) {
            return;
        }

        // `locations.geom` only exists on pgsql (see the migration referenced
        // above); querying it on any other driver would throw.
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        // The boundary-data seeder (`LocationGeomSeeder`, see #89) only loads
        // polygons for `province` and `city` levels — `neighborhood`
        // (parroquia) and any future level intentionally stay without geom (the
        // upstream `pabl-o-ce/Ecuador-geoJSON` MIT dataset only has province +
        // cantón boundaries; parroquias would require a separate curated
        // source).
        //
        // We can't reliably assert "the pin is inside the user's parroquia"
        // because we don't have the parroquia's own polygon. Even if the
        // pin's deepest polygon-owning ancestor is the cantón that
        // contains the parroquia, claiming the pin is in the *specific*
        // parroquia would be inference, not assertion — and it
        // produced false 422s for legitimate submissions in the wild (repro
        // confirmed 2026-07-20).
        //
        // The maximum this rule can validate is at cantón level (and
        // above). For parroquia (and any future level without a polygon),
        // the rule stays silent — the boundary-feedback overlay
        // from #91 carries the visual boundary at cantón level instead.
        if (! Location::query()
            ->whereKey((int) $value)
            ->whereNotNull('geom')
            ->exists()) {
            return;
        }

        // No map point submitted (or an empty one) — nothing to compare against.
        $geomRaw = $this->data['geom'] ?? null;
        if ($geomRaw === null || $geomRaw === '') {
            return;
        }

        // Normalize the sibling value because JSON, multipart, and already-cast
        // callers can supply array, string, or object shapes.
        $geom = match (true) {
            is_array($geomRaw) => $geomRaw,
            is_string($geomRaw) => json_decode($geomRaw, true),
            is_object($geomRaw) => json_decode((string) json_encode($geomRaw), true),
            default => null,
        };
        if (! is_array($geom)) {
            return;
        }

        $coordinates = $geom['coordinates'] ?? null;
        if (! is_array($coordinates) || count($coordinates) !== 2) {
            return;
        }

        try {
            [$longitude, $latitude] = $coordinates;
            // SRID must match `locations.geom` (4326) explicitly — ST_CONTAINS
            // throws "Operation on mixed SRID geometries" against a Point left
            // at its default SRID, it does not implicitly coerce.
            $point = new Point((float) $latitude, (float) $longitude, 4326);

            $matched = $this->locations->findByPoint($point);
        } catch (\Throwable $e) {
            // This check is a soft, progressive validation — a broken/corrupt
            // polygon or a spatial-query error must never take down incident
            // create/update, the app's core feature. Skip like "no match".
            Log::warning('LocationGeomConsistentRule: spatial lookup failed', [
                'location_id' => $value,
                'error' => $e->getMessage(),
            ]);

            return;
        }

        // Strict at save (product decision, PR #97): when the submitted
        // location has its own polygon, an out-of-coverage pin is treated
        // as a hard error rather than a silent pass. The parroquia-silent
        // case is handled by the earlier `whereNotNull('geom')`
        // early-return — we only reach here when the submitted location
        // has a polygon to reconcile against.
        //
        // Known limitation: if `locations.geom` is missing/truncated for
        // the submitted area (seeder gap), this branch can falsely fail
        // pins that ARE inside the location's true boundary. That's the
        // "boundary-data gap" tradeoff behind choosing strict over silent
        // — owned by the geom seeder team, not this rule.
        if ($matched === null) {
            $fail(self::MSG_PIN_OUT_OF_COVERAGE);

            return;
        }

        // Ids come back as numeric strings over pgsql/PDO (Eloquent's
        // pluck() does not cast them) — normalize both sides before the
        // strict comparison, otherwise a valid exact match never matches.
        $validIds = $matched->ancestorsAndSelf()
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        if (! in_array((int) $value, $validIds, true)) {
            $fail(self::MSG_LOCATION_PIN_MISMATCH);
        }
    }
}
