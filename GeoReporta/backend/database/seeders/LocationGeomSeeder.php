<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domains\Locations\Models\Location;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use MatanYadaev\EloquentSpatial\Objects\MultiPolygon;

/**
 * Populates `locations.geom` (province + cantón boundary polygons) for the
 * rows `EcuadorLocationSeeder` already created, so `LocationGeomConsistentRule`
 * has real polygon data to validate against instead of always no-opping.
 *
 * Source data: province and cantón boundaries from
 * https://github.com/pabl-o-ce/Ecuador-geoJSON (MIT license), fetched
 * 2026-07-19 and matched by name to our `locations.code` values into the
 * compact `database/data/ecuador-locations-geom.json` file checked into
 * this repo (only the matched geometries are kept — the upstream files are
 * ~6MB of mostly-unused precision/features).
 *
 * Parroquia (neighborhood-level) boundaries are NOT included — that source
 * has no parish-level data. The frontend never submits a province-only
 * `location_id` (cantón is the practical minimum it sends), so
 * province+cantón coverage already validates 100% of what's actually
 * submitted today; parroquia-level geometry is a known future gap.
 *
 * `locations.geom` only exists on pgsql (see
 * `2026_06_15_000002_create_locations_table.php`) — this seeder no-ops on
 * any other driver instead of erroring.
 */
class LocationGeomSeeder extends Seeder
{
    public function run(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        $path = database_path('data/ecuador-locations-geom.json');
        if (! file_exists($path)) {
            Log::warning('LocationGeomSeeder: data file missing, skipping', ['path' => $path]);

            return;
        }

        $geometries = json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);

        $codes = array_keys($geometries);
        $locations = Location::whereIn('code', $codes)->get()->keyBy('code');

        $updated = 0;
        $missing = [];

        foreach ($geometries as $code => $geoJson) {
            $location = $locations->get($code);
            if ($location === null) {
                $missing[] = $code;

                continue;
            }

            $location->geom = MultiPolygon::fromJson(json_encode($geoJson, JSON_THROW_ON_ERROR), 4326);
            $location->save();
            $updated++;
        }

        $seededWithoutGeom = Location::whereIn('level', ['province', 'city'])
            ->whereNotIn('code', $codes)
            ->pluck('code', 'name');

        $this->command?->info("LocationGeomSeeder: {$updated} locations updated with real boundary geometry.");

        if ($missing !== []) {
            Log::warning('LocationGeomSeeder: codes in geometry data with no matching location row', ['codes' => $missing]);
        }

        if ($seededWithoutGeom->isNotEmpty()) {
            Log::warning('LocationGeomSeeder: seeded province/cantón rows with no boundary geometry available', [
                'count' => $seededWithoutGeom->count(),
                'codes' => $seededWithoutGeom->values()->all(),
            ]);
        }
    }
}
