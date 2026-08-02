<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Enums\IncidentPriority;
use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

uses(RefreshDatabase::class);

it('exposes values() on the incident enums', function () {
    expect(IncidentStatus::values())
        ->toBe(['pending', 'in_progress', 'resolved', 'closed'])
        ->and(IncidentPriority::values())
        ->toBe(['low', 'medium', 'high']);
});

it('returns the stats payload with zero-filled known enum values', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $response = $this->actingAs($admin)->getJson('/api/incidents/stats');

    $response->assertOk()
        ->assertJsonStructure([
            'total',
            'by_status' => ['pending', 'in_progress', 'resolved'],
            'by_priority' => ['low', 'medium', 'high'],
            'recent_count',
            'locations_count',
            'average_resolution_time',
        ]);
});

it('returns null for average_resolution_time when there are no resolved incidents', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $response = $this->actingAs($admin)->getJson('/api/incidents/stats');

    $response->assertOk()
        ->assertJsonPath('average_resolution_time', null);
});

it('calculates average_resolution_time correctly for resolved incidents', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $createdAt = now()->subDays(5);
    $resolutionDate = $createdAt->copy()->addDays(2)->addHours(4);

    $location = Location::create(['name' => 'HQ', 'level' => 'city']);
    $org = Organization::create([
        'name' => 'Test Org',
        'location_id' => $location->id,
    ]);
    $category = IncidentCategory::create([
        'name' => 'General',
        'organization_id' => $org->id,
    ]);

    // Create incident 1: resolved in 2d 4h (52h = 187200s)
    $inc1 = Incident::create([
        'title' => 'Incident 1',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Resolved,
        'priority' => 'medium',
        'resolution_date' => $resolutionDate,
    ]);
    $inc1->created_at = $createdAt;
    $inc1->save(['timestamps' => false]);

    // Create incident 2: resolved in 0d 8h (8h = 28800s)
    // Total resolved = 2, average = (52 + 8) / 2 = 30 hours (1 day, 6 hours)
    $createdAt2 = now()->subDays(3);
    $resolutionDate2 = $createdAt2->copy()->addHours(8);
    $inc2 = Incident::create([
        'title' => 'Incident 2',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Resolved,
        'priority' => 'medium',
        'resolution_date' => $resolutionDate2,
    ]);
    $inc2->created_at = $createdAt2;
    $inc2->save(['timestamps' => false]);

    // Create incident 3: not resolved (should not be included in resolution time average)
    Incident::create([
        'title' => 'Incident 3',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::InProgress,
        'priority' => 'medium',
        'created_at' => now(),
    ]);

    $response = $this->actingAs($admin)->getJson('/api/incidents/stats');

    $response->assertOk()
        ->assertJsonStructure([
            'total',
            'by_status',
            'by_priority',
            'recent_count',
            'locations_count',
            'average_resolution_time' => [
                'formatted',
                'days',
                'hours',
                'seconds',
            ],
        ])
        ->assertJsonPath('average_resolution_time.days', 1)
        ->assertJsonPath('average_resolution_time.hours', 6)
        ->assertJsonPath('average_resolution_time.formatted', '1d 6h');
});

it('excludes soft-deleted incidents from total, by_status, and average_resolution_time', function () {
    // DB::table('incidents') (query builder) never applies Eloquent's
    // SoftDeletingScope — without an explicit whereNull('deleted_at') in
    // IncidentStatsController, a soft-deleted row still counts toward
    // total/by_status/by_priority and skews average_resolution_time.
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $location = Location::create(['name' => 'HQ', 'level' => 'city']);
    $org = Organization::create([
        'name' => 'Test Org',
        'location_id' => $location->id,
    ]);
    $category = IncidentCategory::create([
        'name' => 'General',
        'organization_id' => $org->id,
    ]);

    $visible = Incident::create([
        'title' => 'Visible incident',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'medium',
    ]);

    // Resolved in 100 hours — wildly different from any visible resolved
    // incident, so if this leaks into the average the test fails loudly
    // rather than passing by coincidence.
    $deleted = Incident::create([
        'title' => 'Soft-deleted incident',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Resolved,
        'priority' => 'medium',
        'resolution_date' => now(),
    ]);
    $deleted->created_at = now()->subHours(100);
    $deleted->save(['timestamps' => false]);
    $deleted->delete();

    $response = $this->actingAs($admin)->getJson('/api/incidents/stats');

    $response->assertOk()
        ->assertJsonPath('total', 1)
        ->assertJsonPath('by_status.pending', 1)
        ->assertJsonPath('by_status.resolved', 0)
        ->assertJsonPath('average_resolution_time', null);
});

it('includes trends in stats response', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $location = Location::create(['name' => 'HQ', 'level' => 'city']);
    $org = Organization::create([
        'name' => 'Test Org',
        'location_id' => $location->id,
    ]);
    $category = IncidentCategory::create([
        'name' => 'General',
        'organization_id' => $org->id,
    ]);

    $now = now()->startOfDay();
    Incident::create([
        'title' => 'Resolved Incident',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Resolved,
        'priority' => 'medium',
        'created_at' => $now,
        'resolution_date' => $now->copy()->addHour(),
    ]);

    $response = $this->actingAs($admin)->getJson('/api/incidents/stats');

    $response->assertOk()
        ->assertJsonStructure([
            'trends' => ['total_pct', 'pendientes_pct', 'resolution_rate_pct'],
        ]);

    // Trends: total_pct and pendientes_pct are null when previous period has no data
    // resolution_rate_pct should be an int (100% since all incidents are resolved)
    expect($response->json('trends.resolution_rate_pct'))->toBeInt();
});

// ═══════════════════════════════════════════════════════════════════════════════
// DATE RANGE VALIDATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

it('rejects date range when fin < inicio', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $response = $this->actingAs($admin)->getJson(
        '/api/incidents/stats?inicio=2026-07-26&fin=2026-07-20'
    );

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['fin']);
});

it('accepts valid date range inicio <= fin', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $response = $this->actingAs($admin)->getJson(
        '/api/incidents/stats?inicio=2026-07-20&fin=2026-07-26'
    );

    $response->assertOk()
        ->assertJsonStructure(['total', 'by_status', 'by_priority', 'trends']);
});

it('accepts same date for inicio and fin', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $response = $this->actingAs($admin)->getJson(
        '/api/incidents/stats?inicio=2026-07-26&fin=2026-07-26'
    );

    $response->assertOk();
});

it('rejects invalid date format', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $response = $this->actingAs($admin)->getJson(
        '/api/incidents/stats?inicio=26-07-2026&fin=2026-07-26'
    );

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['inicio']);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE/CATEGORY FILTERING TESTS
// ═══════════════════════════════════════════════════════════════════════════════

it('filters incidents by tipo_id (category)', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $location = Location::create(['name' => 'HQ', 'level' => 'city']);
    $org = Organization::create(['name' => 'Test Org', 'location_id' => $location->id]);

    $cat1 = IncidentCategory::create(['name' => 'Water', 'organization_id' => $org->id]);
    $cat2 = IncidentCategory::create(['name' => 'Roads', 'organization_id' => $org->id]);

    Incident::create([
        'title' => 'Water Leak',
        'incident_category_id' => $cat1->id,
        'user_id' => $admin->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'high',
    ]);

    Incident::create([
        'title' => 'Pothole',
        'incident_category_id' => $cat2->id,
        'user_id' => $admin->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'medium',
    ]);

    $response = $this->actingAs($admin)->getJson(
        "/api/incidents/stats?tipo_id={$cat1->id}"
    );

    $response->assertOk()
        ->assertJsonPath('total', 1)
        ->assertJsonPath('by_status.pending', 1);
});

it('returns empty totals when tipo_id matches no incidents', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $location = Location::create(['name' => 'HQ', 'level' => 'city']);
    $org = Organization::create(['name' => 'Test Org', 'location_id' => $location->id]);
    $cat = IncidentCategory::create(['name' => 'Water', 'organization_id' => $org->id]);

    $response = $this->actingAs($admin)->getJson(
        "/api/incidents/stats?tipo_id={$cat->id}"
    );

    $response->assertOk()
        ->assertJsonPath('total', 0)
        ->assertJsonPath('by_status.pending', 0)
        ->assertJsonPath('by_priority.high', 0);
});

it('rejects non-existent tipo_id', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $response = $this->actingAs($admin)->getJson('/api/incidents/stats?tipo_id=9999');

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['tipo_id']);
});

// ═══════════════════════════════════════════════════════════════════════════════
// LOCATION CASCADE FILTERING TESTS (País → Provincia → Ciudad)
// ═══════════════════════════════════════════════════════════════════════════════

it('filters by ciudad_id (leaf location)', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    // Location hierarchy: Ecuador (country) → Pichincha (province) → Quito (city)
    $country = Location::create(['name' => 'Ecuador', 'level' => 'country']);
    $province = Location::create(['name' => 'Pichincha', 'level' => 'province', 'parent_id' => $country->id]);
    $city1 = Location::create(['name' => 'Quito', 'level' => 'city', 'parent_id' => $province->id]);
    $city2 = Location::create(['name' => 'Latacunga', 'level' => 'city', 'parent_id' => $province->id]);

    $org = Organization::create(['name' => 'Test Org', 'location_id' => $city1->id]);
    $category = IncidentCategory::create(['name' => 'General', 'organization_id' => $org->id]);

    Incident::create([
        'title' => 'Quito Incident',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $city1->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'high',
    ]);

    Incident::create([
        'title' => 'Latacunga Incident',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $city2->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'medium',
    ]);

    // Filter by city 1 only
    $response = $this->actingAs($admin)->getJson(
        "/api/incidents/stats?ciudad_id={$city1->id}"
    );

    $response->assertOk()
        ->assertJsonPath('total', 1)
        ->assertJsonPath('by_priority.high', 1);
});

it('cascades provincia_id to include all descendant cities', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $country = Location::create(['name' => 'Ecuador', 'level' => 'country']);
    $province = Location::create(['name' => 'Pichincha', 'level' => 'province', 'parent_id' => $country->id]);
    $city1 = Location::create(['name' => 'Quito', 'level' => 'city', 'parent_id' => $province->id]);
    $city2 = Location::create(['name' => 'Latacunga', 'level' => 'city', 'parent_id' => $province->id]);

    $org = Organization::create(['name' => 'Test Org', 'location_id' => $city1->id]);
    $category = IncidentCategory::create(['name' => 'General', 'organization_id' => $org->id]);

    Incident::create([
        'title' => 'Quito Incident',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $city1->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'high',
    ]);

    Incident::create([
        'title' => 'Latacunga Incident',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $city2->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'medium',
    ]);

    // Filter by province should include both cities
    $response = $this->actingAs($admin)->getJson(
        "/api/incidents/stats?provincia_id={$province->id}"
    );

    $response->assertOk()
        ->assertJsonPath('total', 2)
        ->assertJsonPath('by_priority.high', 1)
        ->assertJsonPath('by_priority.medium', 1);
});

it('cascades pais_id to include all provinces and cities', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    // Create two provinces in Ecuador
    $country = Location::create(['name' => 'Ecuador', 'level' => 'country']);
    $prov1 = Location::create(['name' => 'Pichincha', 'level' => 'province', 'parent_id' => $country->id]);
    $prov2 = Location::create(['name' => 'Azuay', 'level' => 'province', 'parent_id' => $country->id]);
    $city1 = Location::create(['name' => 'Quito', 'level' => 'city', 'parent_id' => $prov1->id]);
    $city2 = Location::create(['name' => 'Cuenca', 'level' => 'city', 'parent_id' => $prov2->id]);

    $org = Organization::create(['name' => 'Test Org', 'location_id' => $city1->id]);
    $category = IncidentCategory::create(['name' => 'General', 'organization_id' => $org->id]);

    Incident::create([
        'title' => 'Quito Incident',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $city1->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'high',
    ]);

    Incident::create([
        'title' => 'Cuenca Incident',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $city2->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'medium',
    ]);

    // Filter by country should include both provinces and cities
    $response = $this->actingAs($admin)->getJson(
        "/api/incidents/stats?pais_id={$country->id}"
    );

    $response->assertOk()
        ->assertJsonPath('total', 2);
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMBINED FILTER TESTS
// ═══════════════════════════════════════════════════════════════════════════════

it('combines tipo_id + ciudad_id filters', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $country = Location::create(['name' => 'Ecuador', 'level' => 'country']);
    $province = Location::create(['name' => 'Pichincha', 'level' => 'province', 'parent_id' => $country->id]);
    $city1 = Location::create(['name' => 'Quito', 'level' => 'city', 'parent_id' => $province->id]);
    $city2 = Location::create(['name' => 'Latacunga', 'level' => 'city', 'parent_id' => $province->id]);

    $org = Organization::create(['name' => 'Test Org', 'location_id' => $city1->id]);
    $cat1 = IncidentCategory::create(['name' => 'Water', 'organization_id' => $org->id]);
    $cat2 = IncidentCategory::create(['name' => 'Roads', 'organization_id' => $org->id]);

    // Quito Water
    Incident::create([
        'title' => 'Water in Quito',
        'incident_category_id' => $cat1->id,
        'user_id' => $admin->id,
        'location_id' => $city1->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'high',
    ]);

    // Quito Roads
    Incident::create([
        'title' => 'Roads in Quito',
        'incident_category_id' => $cat2->id,
        'user_id' => $admin->id,
        'location_id' => $city1->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'medium',
    ]);

    // Latacunga Water
    Incident::create([
        'title' => 'Water in Latacunga',
        'incident_category_id' => $cat1->id,
        'user_id' => $admin->id,
        'location_id' => $city2->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'low',
    ]);

    // Filter: Quito + Water only (1 incident)
    $response = $this->actingAs($admin)->getJson(
        "/api/incidents/stats?ciudad_id={$city1->id}&tipo_id={$cat1->id}"
    );

    $response->assertOk()
        ->assertJsonPath('total', 1)
        ->assertJsonPath('by_priority.high', 1);
});

it('combines tipo_id + provincia_id filters', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $country = Location::create(['name' => 'Ecuador', 'level' => 'country']);
    $prov1 = Location::create(['name' => 'Pichincha', 'level' => 'province', 'parent_id' => $country->id]);
    $prov2 = Location::create(['name' => 'Azuay', 'level' => 'province', 'parent_id' => $country->id]);
    $city1 = Location::create(['name' => 'Quito', 'level' => 'city', 'parent_id' => $prov1->id]);
    $city2 = Location::create(['name' => 'Cuenca', 'level' => 'city', 'parent_id' => $prov2->id]);

    $org = Organization::create(['name' => 'Test Org', 'location_id' => $city1->id]);
    $cat1 = IncidentCategory::create(['name' => 'Water', 'organization_id' => $org->id]);

    // Quito Water
    Incident::create([
        'title' => 'Water in Quito',
        'incident_category_id' => $cat1->id,
        'user_id' => $admin->id,
        'location_id' => $city1->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'high',
    ]);

    // Cuenca Water (different province)
    Incident::create([
        'title' => 'Water in Cuenca',
        'incident_category_id' => $cat1->id,
        'user_id' => $admin->id,
        'location_id' => $city2->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'medium',
    ]);

    // Filter: Pichincha + Water (1 incident: Quito Water)
    $response = $this->actingAs($admin)->getJson(
        "/api/incidents/stats?provincia_id={$prov1->id}&tipo_id={$cat1->id}"
    );

    $response->assertOk()
        ->assertJsonPath('total', 1)
        ->assertJsonPath('by_priority.high', 1);
});

// ═══════════════════════════════════════════════════════════════════════════════
// PERMISSION CHECKS (ORG-SCOPED USERS)
// ═══════════════════════════════════════════════════════════════════════════════

it('org-scoped operator sees only their organization incidents', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);
    DB::table('roles')->updateOrInsert(['id' => 3], ['name' => 'admin_organizacion', 'updated_at' => now()]);

    DB::table('permissions')->updateOrInsert(
        ['resource' => 'dashboard', 'action' => 'view'],
        ['name' => 'dashboard.view', 'description' => 'Ver estadísticas del dashboard', 'updated_at' => now()]
    );
    $permId = DB::table('permissions')
        ->where('resource', 'dashboard')->where('action', 'view')
        ->value('permission_id');

    // Gates get compiled once at app boot from the permissions that exist
    // at that time (see AppServiceProvider::boot()). Since this test seeds
    // dashboard.view after boot, the ability must be (re)defined here too.
    Gate::define('dashboard.view', fn (User $user) => $user->hasPermission('dashboard.view'));

    DB::table('role_permission')->updateOrInsert(
        ['role_id' => 3, 'permission_id' => $permId]
    );

    $location1 = Location::create(['name' => 'City1', 'level' => 'city']);
    $location2 = Location::create(['name' => 'City2', 'level' => 'city']);

    $org1 = Organization::create(['name' => 'Org1', 'location_id' => $location1->id]);
    $org2 = Organization::create(['name' => 'Org2', 'location_id' => $location2->id]);

    $operator1 = User::factory()->create(['role_id' => 3, 'organization_id' => $org1->id]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $cat1 = IncidentCategory::create(['name' => 'General', 'organization_id' => $org1->id]);
    $cat2 = IncidentCategory::create(['name' => 'General', 'organization_id' => $org2->id]);

    Incident::create([
        'title' => 'Org1 Incident',
        'incident_category_id' => $cat1->id,
        'user_id' => $admin->id,
        'location_id' => $location1->id,
        'organization_id' => $org1->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'high',
    ]);

    Incident::create([
        'title' => 'Org2 Incident',
        'incident_category_id' => $cat2->id,
        'user_id' => $admin->id,
        'location_id' => $location2->id,
        'organization_id' => $org2->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'high',
    ]);

    // Operator1 should only see Org1 incidents (total = 1)
    $response = $this->actingAs($operator1)->getJson('/api/incidents/stats');

    $response->assertOk()
        ->assertJsonPath('total', 1);
});

it('system admin sees all organizations incidents', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);

    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $location1 = Location::create(['name' => 'City1', 'level' => 'city']);
    $location2 = Location::create(['name' => 'City2', 'level' => 'city']);

    $org1 = Organization::create(['name' => 'Org1', 'location_id' => $location1->id]);
    $org2 = Organization::create(['name' => 'Org2', 'location_id' => $location2->id]);

    $cat1 = IncidentCategory::create(['name' => 'General', 'organization_id' => $org1->id]);
    $cat2 = IncidentCategory::create(['name' => 'General', 'organization_id' => $org2->id]);

    Incident::create([
        'title' => 'Org1 Incident',
        'incident_category_id' => $cat1->id,
        'user_id' => $admin->id,
        'location_id' => $location1->id,
        'organization_id' => $org1->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'high',
    ]);

    Incident::create([
        'title' => 'Org2 Incident',
        'incident_category_id' => $cat2->id,
        'user_id' => $admin->id,
        'location_id' => $location2->id,
        'organization_id' => $org2->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'high',
    ]);

    $response = $this->actingAs($admin)->getJson('/api/incidents/stats');

    $response->assertOk()
        ->assertJsonPath('total', 2);
});

// ═══════════════════════════════════════════════════════════════════════════════
// EDGE CASE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

it('returns zero-filled response when filters match no incidents', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $location = Location::create(['name' => 'HQ', 'level' => 'city']);
    $org = Organization::create(['name' => 'Test Org', 'location_id' => $location->id]);
    $category = IncidentCategory::create(['name' => 'General', 'organization_id' => $org->id]);

    Incident::create([
        'title' => 'High Priority',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'high',
    ]);

    // Query for date range with no incidents
    $response = $this->actingAs($admin)->getJson(
        '/api/incidents/stats?inicio=2020-01-01&fin=2020-01-31'
    );

    $response->assertOk()
        ->assertJsonPath('total', 0)
        ->assertJsonPath('by_priority.high', 0)
        ->assertJsonPath('by_priority.medium', 0)
        ->assertJsonPath('by_priority.low', 0);
});

it('returns 403 without dashboard.view permission', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);
    $this->seed(RoleSeeder::class);
    $this->seed(PermissionSeeder::class);
    $this->seed(RolePermissionSeeder::class);

    $user = User::factory()->create(['role_id' => 5]);

    $this->actingAs($user)
        ->getJson('/api/incidents/stats')
        ->assertForbidden();
});

it('serves the same stats payload from cache on the second request', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);
    Cache::tags(['incident-stats'])->flush();
    $this->seed(RoleSeeder::class);

    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);
    $location = Location::create(['name' => 'Cache City', 'level' => 'city']);
    $org = Organization::create(['name' => 'Cache Org', 'location_id' => $location->id]);
    $category = IncidentCategory::create(['name' => 'Cache Category', 'organization_id' => $org->id]);

    Incident::create([
        'title' => 'Cached incident',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => IncidentPriority::Medium,
    ]);

    $first = $this->actingAs($admin)->getJson('/api/incidents/stats')->assertOk();

    DB::table('incidents')->insert([
        'title' => 'Inserted without invalidation',
        'description' => 'Cache sentinel',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending->value,
        'priority' => IncidentPriority::Medium->value,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $second = $this->actingAs($admin)->getJson('/api/incidents/stats')->assertOk();

    expect($second->json())->toBe($first->json())
        ->and($second->json('total'))->toBe(1);
});

it('applies both date range and location cascade together', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->updateOrInsert(['id' => 1], ['name' => 'admin_sistema', 'updated_at' => now()]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $country = Location::create(['name' => 'Ecuador', 'level' => 'country']);
    $provincePichincha = Location::create(['name' => 'Pichincha', 'level' => 'province', 'parent_id' => $country->id]);
    $provinceCotopaxi = Location::create(['name' => 'Cotopaxi', 'level' => 'province', 'parent_id' => $country->id]);
    $city1 = Location::create(['name' => 'Quito', 'level' => 'city', 'parent_id' => $provincePichincha->id]);
    $city2 = Location::create(['name' => 'Latacunga', 'level' => 'city', 'parent_id' => $provinceCotopaxi->id]);

    $org = Organization::create(['name' => 'Test Org', 'location_id' => $city1->id]);
    $category = IncidentCategory::create(['name' => 'General', 'organization_id' => $org->id]);

    $oldDate = now()->subDays(10)->startOfDay();
    $recentDate = now()->startOfDay();

    // Old incident in Quito
    Incident::create([
        'title' => 'Old Quito Incident',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $city1->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'high',
        'created_at' => $oldDate,
    ]);

    // Recent incident in Quito
    Incident::create([
        'title' => 'Recent Quito Incident',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $city1->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'medium',
        'created_at' => $recentDate,
    ]);

    // Recent incident in Latacunga
    Incident::create([
        'title' => 'Recent Latacunga Incident',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $city2->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'low',
        'created_at' => $recentDate,
    ]);

    // Filter: Pichincha province + recent dates only (2 incidents)
    $rangeStart = $recentDate->format('Y-m-d');
    $rangeEnd = now()->format('Y-m-d');

    $response = $this->actingAs($admin)->getJson(
        "/api/incidents/stats?provincia_id={$provincePichincha->id}&inicio={$rangeStart}&fin={$rangeEnd}"
    );

    $response->assertOk()
        ->assertJsonPath('total', 2);
});
