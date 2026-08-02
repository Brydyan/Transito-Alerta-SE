<?php

declare(strict_types=1);

use App\Domains\Incidents\Http\Rules\LocationGeomConsistentRule;
use App\Domains\Locations\Models\Location;
use App\Domains\Locations\Repositories\LocationRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use MatanYadaev\EloquentSpatial\Objects\LineString;
use MatanYadaev\EloquentSpatial\Objects\MultiPolygon;
use MatanYadaev\EloquentSpatial\Objects\Point;
use MatanYadaev\EloquentSpatial\Objects\Polygon;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

/**
 * Direct unit tests for `LocationGeomConsistentRule::validate()`, bypassing
 * HTTP/persistence entirely (no Incident is ever created here) so the
 * driver-guard can be exercised on sqlite without hitting the pgsql-only
 * `incidents.geom` column gap (see the sibling Feature test for that
 * context). This is what actually proves the sqlite short-circuit works,
 * rather than just asserting on it.
 */
function makeRule(): LocationGeomConsistentRule
{
    return new LocationGeomConsistentRule(app(LocationRepository::class));
}

function postgisAvailableForRule(): bool
{
    return DB::connection()->getDriverName() === 'pgsql';
}

function machalaSquareGeom(): MultiPolygon
{
    return new MultiPolygon([
        new Polygon([
            new LineString([
                new Point(-1.0, -80.8),
                new Point(-1.0, -80.6),
                new Point(-0.8, -80.6),
                new Point(-0.8, -80.8),
                new Point(-1.0, -80.8),
            ]),
        ]),
    ]);
}

/**
 * Square geom ~400km north of machalaSquareGeom (`lng [-79.0,-78.8]` x `lat [-0.4,-0.2]`).
 * Para tests que necesitan un cantón "lejano" (sin match con el pin de
 * machala). Tras el fix de parroquia-no-geom (ver scope del PR), los tests
 * que asumen el escenario "submit sin geom" fueron actualizados para usar
 * este helper con el fin de mantener la semántica de "submit con
 * polygon propio que NO contiene el pin".
 */
function quitoSquareGeom(): MultiPolygon
{
    return new MultiPolygon([
        new Polygon([
            new LineString([
                new Point(-0.4, -79.0),
                new Point(-0.4, -78.8),
                new Point(-0.2, -78.8),
                new Point(-0.2, -79.0),
                new Point(-0.4, -79.0),
            ]),
        ]),
    ]);
}

it('skips when location_id is null', function (): void {
    $rule = makeRule();
    $rule->setData(['geom' => json_encode(['type' => 'Point', 'coordinates' => [-80.7, -0.9]])]);

    $failed = false;
    $rule->validate('location_id', null, function () use (&$failed) {
        $failed = true;
    });

    expect($failed)->toBeFalse();
});

it('skips when geom is absent from sibling data', function (): void {
    if (! postgisAvailableForRule()) {
        $this->markTestSkipped('Requires PostgreSQL — on sqlite this is already covered by the driver-guard test above.');
    }

    $location = Location::create(['name' => 'Quito', 'level' => 'city']);
    $rule = makeRule();
    $rule->setData([]); // no 'geom' key at all

    $failed = false;
    $rule->validate('location_id', $location->id, function () use (&$failed) {
        $failed = true;
    });

    expect($failed)->toBeFalse();
});

it('skips when geom coordinates are malformed', function (): void {
    if (! postgisAvailableForRule()) {
        $this->markTestSkipped('Requires PostgreSQL — on sqlite this is already covered by the driver-guard test above.');
    }

    $location = Location::create(['name' => 'Quito', 'level' => 'city']);
    $rule = makeRule();
    $rule->setData(['geom' => json_encode(['type' => 'Point', 'coordinates' => [-80.7]])]); // only 1 coordinate

    $failed = false;
    $rule->validate('location_id', $location->id, function () use (&$failed) {
        $failed = true;
    });

    expect($failed)->toBeFalse();
});

it('pgsql: skips when the point matches no polygon (no boundary data loaded)', function (): void {
    if (! postgisAvailableForRule()) {
        $this->markTestSkipped('Requires PostgreSQL+PostGIS.');
    }

    $location = Location::create(['name' => 'Machala', 'level' => 'city']); // no geom
    $rule = makeRule();
    $rule->setData(['geom' => json_encode(['type' => 'Point', 'coordinates' => [-80.7, -0.9]])]);

    $failed = false;
    $rule->validate('location_id', $location->id, function () use (&$failed) {
        $failed = true;
    });

    expect($failed)->toBeFalse();
});

it('pgsql: passes when the point is inside the matched location\'s polygon', function (): void {
    if (! postgisAvailableForRule()) {
        $this->markTestSkipped('Requires PostgreSQL+PostGIS.');
    }

    $location = Location::create([
        'name' => 'Machala',
        'level' => 'city',
        'geom' => machalaSquareGeom(),
    ]);
    $rule = makeRule();
    $rule->setData(['geom' => json_encode(['type' => 'Point', 'coordinates' => [-80.7, -0.9]])]);

    $failed = false;
    $rule->validate('location_id', $location->id, function () use (&$failed) {
        $failed = true;
    });

    expect($failed)->toBeFalse();
});

it('pgsql: fails when the point is inside the polygon but location_id is unrelated', function (): void {
    if (! postgisAvailableForRule()) {
        $this->markTestSkipped('Requires PostgreSQL+PostGIS.');
    }

    Location::create([
        'name' => 'Machala',
        'level' => 'city',
        'geom' => machalaSquareGeom(),
    ]);
    // Quito con geom en una zona totalmente separada (~400km al norte).
    // Pre-fix este test creaba Quito sin geom y esperaba fail; con la nueva
    // sem�ntica (submit sin geom = silent, ver scope del PR), un submit
    // sin geom ya no es el escenario v�lido. Quito con geom lejano reproduce
    // la sem�ntica original: findByPoint match = Machala (deepest polygon),
    // Quito no est� en ancestros del match → fail.
    $quito = Location::create([
        'name' => 'Quito',
        'level' => 'city',
        'geom' => quitoSquareGeom(),
    ]);
    $rule = makeRule();
    $rule->setData(['geom' => json_encode(['type' => 'Point', 'coordinates' => [-80.7, -0.9]])]);

    $failMessage = null;
    $rule->validate('location_id', $quito->id, function (string $message) use (&$failMessage) {
        $failMessage = $message;
    });

    expect($failMessage)->not->toBeNull();
});

it('pgsql: passes when location_id is an ancestor of the matched location', function (): void {
    if (! postgisAvailableForRule()) {
        $this->markTestSkipped('Requires PostgreSQL+PostGIS.');
    }

    $province = Location::create(['name' => 'El Oro', 'level' => 'province']);
    Location::create([
        'name' => 'Machala',
        'level' => 'city',
        'parent_id' => $province->id,
        'geom' => machalaSquareGeom(),
    ]);
    $rule = makeRule();
    $rule->setData(['geom' => json_encode(['type' => 'Point', 'coordinates' => [-80.7, -0.9]])]);

    $failed = false;
    $rule->validate('location_id', $province->id, function () use (&$failed) {
        $failed = true;
    });

    expect($failed)->toBeFalse();
});

it('pgsql: submitting the cantón itself still passes when its parent province also has geom set', function (): void {
    if (! postgisAvailableForRule()) {
        $this->markTestSkipped('Requires PostgreSQL+PostGIS.');
    }

    // Regression: once both levels have geom (LocationGeomSeeder loads
    // province + cantón), a point inside the cantón is also inside its
    // parent province polygon. findByPoint() must prefer the cantón (the
    // deepest match) — if it arbitrarily returned the province instead,
    // the submitted cantón id would be a *descendant* of the match, not an
    // ancestor-or-self, and this would wrongly fail.
    $province = Location::create([
        'name' => 'El Oro',
        'level' => 'province',
        'geom' => machalaSquareGeom(),
    ]);
    $city = Location::create([
        'name' => 'Machala',
        'level' => 'city',
        'parent_id' => $province->id,
        'geom' => machalaSquareGeom(),
    ]);
    $rule = makeRule();
    $rule->setData(['geom' => json_encode(['type' => 'Point', 'coordinates' => [-80.7, -0.9]])]);

    $failed = false;
    $rule->validate('location_id', $city->id, function () use (&$failed) {
        $failed = true;
    });

    expect($failed)->toBeFalse();
});

it('pgsql: stays silent (no rejection) when the submitted location has no polygon of its own (parroquia)', function (): void {
    if (! postgisAvailableForRule()) {
        $this->markTestSkipped('Requires PostgreSQL+PostGIS.');
    }

    // Regression for false-422s on parroquia submissions (repro 2026-07-20):
    //
    // The user reports selecting the parroquia "La Libertad" inside the
    // cantón "La Libertad" (Santa Elena province) and dropping a pin
    // clearly inside the cantón's polygon, and getting a 422 with
    // "La ubicación seleccionada no contiene el punto marcado en el mapa".
    //
    // The cause: `LocationGeomSeeder` only loads polygons for `province` and
    // `city` (not for `neighborhood`/parroquia). `findByPoint` returns the
    // deepest polygon owning ancestor (the cantón); the submitted
    // parroquia is a *descendant* of that match, NOT an ancestor —
    // so the old ancestry-only check rejected the submission.
    //
    // The fix (per user decision): the rule can only validate when the
    // submitted location has its own polygon (i.e., province or cantón).
    // For parroquia (and any future level without geom), the rule stays
    // silent — the boundary-feedback overlay from PR #91 carries
    // the visual feedback at cantón level instead. This is honest: we
    // can't know the pin is inside the *specific* parroquia without
    // parroquia polygons, and the cantón's polygon is the strongest
    // signal we have.
    $province = Location::create([
        'name' => 'Santa Elena',
        'level' => 'province',
        'geom' => machalaSquareGeom(),
    ]);
    $city = Location::create([
        'name' => 'La Libertad',
        'level' => 'city',
        'parent_id' => $province->id,
        'geom' => machalaSquareGeom(),
    ]);
    $parish = Location::create([
        'name' => 'La Libertad',
        'level' => 'neighborhood',
        'parent_id' => $city->id,
        'geom' => null, // parroquia sin geom por diseño del seeder
    ]);
    $rule = makeRule();
    // Pin (lon, lat) anywhere inside the cantón's small bbox (mismo
    // fixture que los demás tests del rule: ~-80.7/-80.6 lon, -1.0/-0.8 lat).
    $rule->setData(['geom' => json_encode(['type' => 'Point', 'coordinates' => [-80.7, -0.9]])]);

    $failed = false;
    $failMessage = null;
    $rule->validate('location_id', $parish->id, function () use (&$failed, &$failMessage) {
        $failed = true;
        $failMessage = func_get_args()[0] ?? null;
    });

    // Critical assertion: stay silent (no $fail callback).
    expect($failed)->toBeFalse();
    expect($failMessage)->toBeNull();
});

it('pgsql: fails strict with the "fuera de cualquier zona conocida" message when the submitted location has its own polygon but the pin is outside ALL known polygons', function (): void {
    if (! postgisAvailableForRule()) {
        $this->markTestSkipped('Requires PostgreSQL+PostGIS.');
    }

    // "Strict at save" — the end-user-confirmed behavior after PR #95:
    // when the submitted location has its own polygon (province or cantón),
    // dropping the pin somewhere no polygon covers (ocean, ungazetted
    // area) is a hard error. We have no positive match to reconcile
    // against, so the safest default is to reject rather than to silently
    // persist a location/pin pair we can't verify.
    //
    // Distinct from the silent-parroquia path covered by the sibling test
    // below: parroquia has no own polygon, so the rule stays silent. This
    // scenario only applies when the submitted location has geom != null.
    //
    // Defensive isolation: `RefreshDatabase` already empties `locations`
    // between tests, but if a future change adds a global seeder (or any
    // per-test seeding of `locations`), `findByPoint` could return an
    // unrelated polygon instead of null and the strict branch under test
    // would never fire. Explicit clear pins the assumption to code.
    Location::query()->delete();
    $canton = Location::create([
        'name' => 'Quito',
        'level' => 'city',
        'geom' => quitoSquareGeom(),
    ]);

    $rule = makeRule();
    // Pacific Ocean point, well west of any seeder polygon (Santa Elena
    // province sits around lat -2.2° / lng -80.5°). This guarantees that
    // `findByPoint` returns null — the strict branch under test.
    $rule->setData(['geom' => json_encode(['type' => 'Point', 'coordinates' => [-81.7, -2.5]])]);

    $failed = false;
    $failMessage = null;
    $rule->validate('location_id', $canton->id, function (string $message) use (&$failed, &$failMessage) {
        $failed = true;
        $failMessage = $message;
    });

    expect($failed)->toBeTrue();
    expect($failMessage)
        ->toBe('El punto seleccionado está fuera de cualquier zona conocida. Verifica que la ubicación y el pin correspondan.');
});

it('pgsql: stays silent for parroquia even when the pin is outside ALL known polygons', function (): void {
    if (! postgisAvailableForRule()) {
        $this->markTestSkipped('Requires PostgreSQL+PostGIS.');
    }

    // Regression for the silent-parroquia guarantee from PR #95: even on
    // the new strict-pin path, a parroquia submission (geom = null by
    // seeder design) MUST stay silent — we have no parroquia polygon to
    // compare against, and rejecting would be the same class of false-422
    // bug #95 fixed for the inside-polygon case. The strict message
    // applies only when the submitted location has its own polygon.
    //
    // Defensive isolation: see the sibling test above — same rationale.
    Location::query()->delete();
    $parish = Location::create([
        'name' => 'La Libertad',
        'level' => 'neighborhood',
        'geom' => null, // parroquia sin geom por diseño del seeder
    ]);

    $rule = makeRule();
    // Same ocean point as the strict-pin test above.
    $rule->setData(['geom' => json_encode(['type' => 'Point', 'coordinates' => [-81.7, -2.5]])]);

    $failed = false;
    $failMessage = null;
    $rule->validate('location_id', $parish->id, function (string $message) use (&$failed, &$failMessage) {
        $failed = true;
        $failMessage = $message;
    });

    expect($failed)->toBeFalse();
    expect($failMessage)->toBeNull();
});

it('pgsql: tolerates geom arriving as an already-decoded array (real HTTP traffic path)', function (): void {
    if (! postgisAvailableForRule()) {
        $this->markTestSkipped('Requires PostgreSQL+PostGIS.');
    }

    // Regression for the production 500:
    // axios / fetch send `geom` as a JSON object — by the time the rule sees
    // `$this->data['geom']`, it's already-decoded into an array, NOT a JSON
    // string. The previous `(string) $geomRaw` cast produced "Array to string
    // conversion" and Laravel promoted the notice to ErrorException → 500 on
    // every POST /api/incidents. All existing tests covered the string path,
    // so the regression escaped CI.
    $province = Location::create([
        'name' => 'El Oro',
        'level' => 'province',
        'geom' => machalaSquareGeom(),
    ]);
    $city = Location::create([
        'name' => 'Machala',
        'level' => 'city',
        'parent_id' => $province->id,
        'geom' => machalaSquareGeom(),
    ]);

    $rule = makeRule();
    // Same shape the frontend actually posts — array, NOT json_encode()ed.
    $rule->setData(['geom' => ['type' => 'Point', 'coordinates' => [-80.7, -0.9]]]);

    // Cantón submitted, point inside cantón polygon → must not call $fail().
    $failed = false;
    $rule->validate('location_id', $city->id, function () use (&$failed) {
        $failed = true;
    });

    expect($failed)->toBeFalse();
});

it('pgsql: tolerates geom arriving as a stdClass object (defensive)', function (): void {
    if (! postgisAvailableForRule()) {
        $this->markTestSkipped('Requires PostgreSQL+PostGIS.');
    }

    // Defensive: a future middleware or a model cast could leak a stdClass
    // down here instead of an array. The previous `(string) $geomRaw` cast
    // would have crashed on that too — the new `match (true)` block must
    // decode it via json_encode→json_decode and keep going.
    $province = Location::create([
        'name' => 'El Oro',
        'level' => 'province',
        'geom' => machalaSquareGeom(),
    ]);
    $city = Location::create([
        'name' => 'Machala',
        'level' => 'city',
        'parent_id' => $province->id,
        'geom' => machalaSquareGeom(),
    ]);

    $rule = makeRule();
    $rule->setData(['geom' => (object) ['type' => 'Point', 'coordinates' => [-80.7, -0.9]]]);

    $failed = false;
    $rule->validate('location_id', $city->id, function () use (&$failed) {
        $failed = true;
    });

    expect($failed)->toBeFalse();
});

it('exposes its rejection message in Spanish (end-user readability, pinned)', function (): void {
    if (! postgisAvailableForRule()) {
        $this->markTestSkipped('Requires PostgreSQL+PostGIS.');
    }

    // The rest of the app's validation messages stay in English
    // (`APP_LOCALE=en`), but this is the only error an end user sees when
    // they pick a province + cantón on a map of Ecuador and drop a pin
    // outside the boundary. It's worth pinning so a future i18n sweep
    // doesn't drift this string without an explicit decision.
    $machala = Location::create([
        'name' => 'Machala',
        'level' => 'city',
        'geom' => machalaSquareGeom(),
    ]);
    // Quito con geom lejano para que el rule efectivamente dispare el
    // mensaje en español (ver scope del PR: parroquia/level-sin-geom
    // es silent, así que necesitamos un cantón con geom para
    // que el fail() se ejecute).
    $quito = Location::create([
        'name' => 'Quito',
        'level' => 'city',
        'geom' => quitoSquareGeom(),
    ]);

    $rule = makeRule();
    $rule->setData(['geom' => json_encode(['type' => 'Point', 'coordinates' => [-80.7, -0.9]])]);

    $captured = null;
    $rule->validate('location_id', $quito->id, function (string $message) use (&$captured) {
        $captured = $message;
    });

    expect($captured)->toBe('La ubicación seleccionada no contiene el punto marcado en el mapa.');
});
