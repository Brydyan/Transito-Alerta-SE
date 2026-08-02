<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Database\Seeders\EcuadorLocationSeeder;
use Database\Seeders\LocationGeomSeeder;
use Illuminate\Auth\Middleware\Authorize;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

/**
 * `LocationGeomSeeder` loads real province + cantón boundary polygons
 * (source: github.com/pabl-o-ce/Ecuador-geoJSON, MIT) into `locations.geom`
 * so `LocationGeomConsistentRule` has real data to validate against instead
 * of permanently no-opping.
 *
 * `locations.geom` is pgsql-only (`2026_06_15_000002_create_locations_table.php`)
 * — every scenario here needs a real Postgres+PostGIS connection.
 */
uses(RefreshDatabase::class);

function locationGeomSeederPostgisAvailable(): bool
{
    return DB::connection()->getDriverName() === 'pgsql';
}

it('pgsql: loads real geometry for every seeded province and cantón (100% match)', function (): void {
    if (! locationGeomSeederPostgisAvailable()) {
        $this->markTestSkipped('Requires PostgreSQL+PostGIS.');
    }

    (new EcuadorLocationSeeder)->run();
    (new LocationGeomSeeder)->run();

    $provinces = Location::where('level', 'province')->get();
    $cities = Location::where('level', 'city')->get();

    expect($provinces)->toHaveCount(24);
    expect($cities)->toHaveCount(221);
    expect($provinces->whereNull('geom'))->toHaveCount(0);
    expect($cities->whereNull('geom'))->toHaveCount(0);
});

it('pgsql: reproduces and closes the manually-reported bug — Santa Elena/La Libertad location_id with a Quito map pin is now rejected', function (): void {
    if (! locationGeomSeederPostgisAvailable()) {
        $this->markTestSkipped('Requires PostgreSQL+PostGIS.');
    }

    $this->withoutMiddleware([JwtAuthenticate::class, Authorize::class]);
    Role::firstOrCreate(['name' => 'admin_sistema']);
    $user = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id, 'organization_id' => null]);

    (new EcuadorLocationSeeder)->run();
    (new LocationGeomSeeder)->run();

    $laLibertad = Location::where('code', 'EC-24-02')->firstOrFail();
    $orgLocation = Location::where('code', 'EC-24-01')->firstOrFail();
    $organization = Organization::create(['name' => 'GAD Santa Elena', 'location_id' => $orgLocation->id]);
    $category = IncidentCategory::create(['name' => 'General', 'organization_id' => $organization->id]);

    $this->actingAs($user);

    // Exact manual repro: location_id = Santa Elena > La Libertad > La
    // Libertad, geom pin dropped in Quito. Before real boundary data was
    // loaded, this silently succeeded (findByPoint always returned null).
    $response = $this->postJson('/api/incidents', [
        'title' => 'Bache en la vía',
        'priority' => 'medium',
        'incident_category_id' => $category->id,
        'organization_id' => $organization->id,
        'location_id' => $laLibertad->id,
        'geom' => json_encode(['type' => 'Point', 'coordinates' => [-78.4678, -0.1807]]), // Quito
    ]);

    $response->assertStatus(422);
    $response->assertJsonValidationErrors(['location_id']);
});

it('pgsql: a pin actually inside La Libertad (SantaElenaIncidentSeeder\'s own coordinate) is accepted', function (): void {
    if (! locationGeomSeederPostgisAvailable()) {
        $this->markTestSkipped('Requires PostgreSQL+PostGIS.');
    }

    $this->withoutMiddleware([JwtAuthenticate::class, Authorize::class]);
    Role::firstOrCreate(['name' => 'admin_sistema']);
    $user = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id, 'organization_id' => null]);

    (new EcuadorLocationSeeder)->run();
    (new LocationGeomSeeder)->run();

    $laLibertad = Location::where('code', 'EC-24-02')->firstOrFail();
    $organization = Organization::create(['name' => 'GAD Santa Elena', 'location_id' => $laLibertad->id]);
    $category = IncidentCategory::create(['name' => 'General', 'organization_id' => $organization->id]);

    $this->actingAs($user);

    // Same coordinate SantaElenaIncidentSeeder uses for La Libertad's
    // cabecera (lat, lng): [-2.2304, -80.9037].
    $response = $this->postJson('/api/incidents', [
        'title' => 'Punto negro de accidentes',
        'priority' => 'high',
        'incident_category_id' => $category->id,
        'organization_id' => $organization->id,
        'location_id' => $laLibertad->id,
        'geom' => json_encode(['type' => 'Point', 'coordinates' => [-80.9037, -2.2304]]),
    ]);

    $response->assertCreated();
});

it('pgsql: rejects Santa Elena/La Libertad + Quito pin via HTTP when geom is sent as an array (NOT a JSON string)', function (): void {
    if (! locationGeomSeederPostgisAvailable()) {
        $this->markTestSkipped('Requires PostgreSQL+PostGIS.');
    }

    // Companion to the string-path test above: the axios-based frontend
    // sends `geom` as an already-decoded JSON object, NOT a json_encode()ed
    // string. Before the array-path fix, Laravel promoted "Array to string
    // conversion" → ErrorException → 500 on every submit. After the fix,
    // this case must STILL reject with 422 like the string variant — the
    // bug was a 500, not a missing validation, so the rule's semantic
    // hasn't changed.
    $this->withoutMiddleware([JwtAuthenticate::class, Authorize::class]);
    Role::firstOrCreate(['name' => 'admin_sistema']);
    $user = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id, 'organization_id' => null]);

    (new EcuadorLocationSeeder)->run();
    (new LocationGeomSeeder)->run();

    $laLibertad = Location::where('code', 'EC-24-02')->firstOrFail();
    $orgLocation = Location::where('code', 'EC-24-01')->firstOrFail();
    $organization = Organization::create(['name' => 'GAD Santa Elena', 'location_id' => $orgLocation->id]);
    $category = IncidentCategory::create(['name' => 'General', 'organization_id' => $organization->id]);

    $this->actingAs($user);

    $response = $this->postJson('/api/incidents', [
        'title' => 'Bache en la vía',
        'priority' => 'medium',
        'incident_category_id' => $category->id,
        'organization_id' => $organization->id,
        'location_id' => $laLibertad->id,
        // Same coordinates as the string-path test, but as a real PHP array
        // — exactly what axios actually posts, and what used to 500.
        'geom' => ['type' => 'Point', 'coordinates' => [-78.4678, -0.1807]], // Quito
    ]);

    $response->assertStatus(422);
    $response->assertJsonValidationErrors(['location_id']);
});
