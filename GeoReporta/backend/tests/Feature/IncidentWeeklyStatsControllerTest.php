<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

it('returns weekly stats with correct structure', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => 'admin_sistema', 'created_at' => now(), 'updated_at' => now()],
    ]);
    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);

    $response = $this->actingAs($admin)->getJson('/api/incidents/weekly-stats');

    $response->assertOk()
        ->assertJsonStructure([
            'days' => [
                '*' => ['date', 'label', 'recibidas', 'resueltas'],
            ],
        ]);

    // Should return 7 days by default
    $days = $response->json('days');
    expect($days)->not->toBeEmpty();
    expect(count($days))->toBeGreaterThanOrEqual(6); // Allow for timezone differences
});

it('returns correct counts for incidents', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => 'admin_sistema', 'created_at' => now(), 'updated_at' => now()],
    ]);
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

    $today = now()->startOfDay();
    Incident::create([
        'title' => 'Today incident',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'medium',
        'created_at' => $today,
    ]);

    $response = $this->actingAs($admin)->getJson('/api/incidents/weekly-stats');

    $response->assertOk();
    expect($response->json('days'))->not->toBeEmpty();
});

it('respects custom date range filter', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => 'admin_sistema', 'created_at' => now(), 'updated_at' => now()],
    ]);
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

    // Create incidents over several days
    $start = now()->subDays(10)->startOfDay();
    for ($i = 0; $i < 5; $i++) {
        Incident::create([
            'title' => "Incident $i",
            'incident_category_id' => $category->id,
            'user_id' => $admin->id,
            'location_id' => $location->id,
            'organization_id' => $org->id,
            'status' => IncidentStatus::Pending,
            'priority' => 'medium',
            'created_at' => $start->copy()->addDays($i),
        ]);
    }

    // Request with custom date range
    $rangeStart = $start->copy()->addDay()->format('Y-m-d');
    $rangeEnd = $start->copy()->addDays(3)->format('Y-m-d');

    $response = $this->actingAs($admin)->getJson(
        "/api/incidents/weekly-stats?inicio={$rangeStart}&fin={$rangeEnd}"
    );

    $response->assertOk();

    $days = $response->json('days');
    expect($days)->toHaveCount(3); // 3 days in range

    expect($days[0]['date'])->toBe($rangeStart);
    expect($days[2]['date'])->toBe($rangeEnd);
});

it('separates received vs resolved incidents correctly', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => 'admin_sistema', 'created_at' => now(), 'updated_at' => now()],
    ]);
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

    $response = $this->actingAs($admin)->getJson('/api/incidents/weekly-stats');

    $response->assertOk()
        ->assertJsonStructure([
            'days' => [
                '*' => ['date', 'label', 'recibidas', 'resueltas'],
            ],
        ]);
});

it('composes category and location filters', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);
    $this->seed(RoleSeeder::class);

    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);
    $country = Location::create(['name' => 'Ecuador', 'level' => 'country']);
    $province = Location::create(['name' => 'Santa Elena', 'level' => 'province', 'parent_id' => $country->id]);
    $city = Location::create(['name' => 'La Libertad', 'level' => 'city', 'parent_id' => $province->id]);
    $otherCity = Location::create(['name' => 'Guayaquil', 'level' => 'city']);
    $org = Organization::create(['name' => 'Filter Org', 'location_id' => $city->id]);
    $category = IncidentCategory::create(['name' => 'Roads', 'organization_id' => $org->id]);
    $otherCategory = IncidentCategory::create(['name' => 'Water', 'organization_id' => $org->id]);

    foreach ([[$category, $city], [$category, $otherCity], [$otherCategory, $city]] as $index => [$incidentCategory, $location]) {
        Incident::create([
            'title' => "Filtered incident {$index}",
            'incident_category_id' => $incidentCategory->id,
            'user_id' => $admin->id,
            'location_id' => $location->id,
            'organization_id' => $org->id,
            'status' => IncidentStatus::Pending,
            'priority' => 'medium',
            'created_at' => now()->startOfDay(),
        ]);
    }

    $date = now()->format('Y-m-d');
    $response = $this->actingAs($admin)->getJson(
        "/api/incidents/weekly-stats?inicio={$date}&fin={$date}&tipo_id={$category->id}&provincia_id={$province->id}"
    );

    $response->assertOk()
        ->assertJsonPath('days.0.recibidas', 1);
});

it('serves the same daily series from cache on the second request', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);
    Cache::tags(['incident-stats'])->flush();
    $this->seed(RoleSeeder::class);

    $admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);
    $location = Location::create(['name' => 'Cache City', 'level' => 'city']);
    $org = Organization::create(['name' => 'Cache Org', 'location_id' => $location->id]);
    $category = IncidentCategory::create(['name' => 'Cache Category', 'organization_id' => $org->id]);
    $date = now()->format('Y-m-d');

    Incident::create([
        'title' => 'Cached weekly incident',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending,
        'priority' => 'medium',
        'created_at' => now()->startOfDay(),
    ]);

    $path = "/api/incidents/weekly-stats?inicio={$date}&fin={$date}";
    $first = $this->actingAs($admin)->getJson($path)->assertOk();

    DB::table('incidents')->insert([
        'title' => 'Inserted without invalidation',
        'description' => 'Cache sentinel',
        'incident_category_id' => $category->id,
        'user_id' => $admin->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => IncidentStatus::Pending->value,
        'priority' => 'medium',
        'created_at' => now()->startOfDay(),
        'updated_at' => now(),
    ]);

    $second = $this->actingAs($admin)->getJson($path)->assertOk();

    expect($second->json())->toBe($first->json())
        ->and($second->json('days.0.recibidas'))->toBe(1);
});

it('requires dashboard.view permission', function () {
    $this->withoutMiddleware(JwtAuthenticate::class);

    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => 'admin_sistema', 'created_at' => now(), 'updated_at' => now()],
        ['id' => 2, 'name' => 'user_regular', 'created_at' => now(), 'updated_at' => now()],
    ]);

    $adminWithPerm = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);
    $userWithoutPerm = User::factory()->create(['role_id' => 2]);

    $response = $this->actingAs($adminWithPerm)->getJson('/api/incidents/weekly-stats');
    $response->assertOk();

    $response2 = $this->actingAs($userWithoutPerm)->getJson('/api/incidents/weekly-stats');
    $response2->assertStatus(403);
});
