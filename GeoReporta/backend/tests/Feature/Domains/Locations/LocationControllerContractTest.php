<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

/**
 * Contract tests for the LocationController progressive-loading endpoints.
 *
 * Spec: Requirement — Progressive Initial Load
 * Spec: Requirement — Parent-Scoped Lazy Loading
 * Spec: Requirement — Complete Pagination Without Truncation
 */
uses(RefreshDatabase::class);

beforeEach(function (): void {
    // Disable JWT middleware for testing
    $this->withoutMiddleware(JwtAuthenticate::class);

    // Ensure admin role exists
    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => 'admin_sistema', 'created_at' => now(), 'updated_at' => now()],
    ]);
    $this->admin = User::factory()->create(['role_id' => Role::where('name', 'admin_sistema')->first()->id]);
});

// -----------------------------------------------------------------
// Task 2.1 GREEN: GET /locations?level=X returns paginated meta
// -----------------------------------------------------------------

/**
 * Verifies that GET /locations returns complete pagination meta including
 * next_page_url. Clients MUST be able to follow next_page_url to consume
 * all pages and avoid silent truncation at the hard cap.
 *
 * Spec: Requirement — Complete Pagination Without Truncation
 */
it('returns complete pagination meta with next_page_url when results exceed per_page', function (): void {
    // Create 15 provinces (per_page=5 should produce 3 pages)
    $country = Location::create(['name' => 'Ecuador', 'level' => 'country']);
    for ($i = 1; $i <= 15; $i++) {
        Location::create(['name' => "Province {$i}", 'level' => 'province', 'parent_id' => $country->id]);
    }

    $response = $this->actingAs($this->admin)->getJson('/api/locations?level=province&per_page=5');

    $response->assertOk();

    $data = $response->json();

    // Verify meta structure exists and has correct values
    expect($data)->toHaveKey('meta');
    expect($data['meta']['current_page'])->toBe(1);
    expect($data['meta']['per_page'])->toBe(5);
    expect($data['meta']['total'])->toBe(15);
    expect($data['meta']['last_page'])->toBe(3);
    // next_page_url is present and points to page 2 (Laravel preserves only page param by default)
    expect($data['meta'])->toHaveKey('next_page_url');
    expect($data['meta']['next_page_url'])->toContain('/api/locations?page=2');
});

/**
 * Verifies that next_page_url is null when on the last page.
 */
it('returns null next_page_url when on the last page', function (): void {
    $country = Location::create(['name' => 'Ecuador', 'level' => 'country']);
    Location::create(['name' => 'Pichincha', 'level' => 'province', 'parent_id' => $country->id]);
    Location::create(['name' => 'Guayas', 'level' => 'province', 'parent_id' => $country->id]);

    // With 2 provinces and per_page=2, there's only 1 page
    $response = $this->actingAs($this->admin)->getJson('/api/locations?level=province&per_page=2');

    $response->assertOk();

    $data = $response->json();

    expect($data['meta']['per_page'])->toBe(2);
    expect($data['meta']['total'])->toBe(2);
    // With 2 results and per_page=2, we get exactly 1 page
    expect($data['meta']['last_page'])->toBe(1);
    expect($data['meta'])->toHaveKey('next_page_url');
    // No second page exists
    expect($data['meta']['next_page_url'])->toBeNull();
});

// -----------------------------------------------------------------
// Task 2.3 GREEN: GET /organizations/{id} includes location_path
// -----------------------------------------------------------------

/**
 * Verifies that GET /organizations/{id} returns location_path array
 * ordered root-to-leaf for preselection cascade.
 *
 * Spec: Requirement — Organization Detail Location Hierarchy
 */
it('returns location_path ordered root-to-leaf in organization detail', function (): void {
    // Build location hierarchy
    $country = Location::create(['name' => 'Ecuador', 'level' => 'country']);
    $province = Location::create(['name' => 'Pichincha', 'level' => 'province', 'parent_id' => $country->id]);
    $city = Location::create(['name' => 'Quito', 'level' => 'city', 'parent_id' => $province->id]);

    // Create organization at city level
    $organization = Organization::create([
        'name' => 'Test Org',
        'location_id' => $city->id,
        'max_active_claims' => 5,
    ]);

    $response = $this->actingAs($this->admin)->getJson("/api/organizations/{$organization->id}");

    $response->assertOk();

    $json = $response->json();
    $data = $json['data'] ?? $json;

    // location_path must be present and ordered root-to-leaf
    expect($data)->toHaveKey('location_path');
    expect($data['location_path'])->toHaveCount(3);
    expect($data['location_path'][0]['name'])->toBe('Ecuador');
    expect($data['location_path'][1]['name'])->toBe('Pichincha');
    expect($data['location_path'][2]['name'])->toBe('Quito');

    // Each node in location_path must have id, name, level
    foreach ($data['location_path'] as $node) {
        expect($node)->toHaveKeys(['id', 'name', 'level']);
    }
});

// -----------------------------------------------------------------
// Task 2.5 GREEN: GET /incidents/{id} includes location_path and geom
// -----------------------------------------------------------------

/**
 * Verifies that GET /incidents/{id} returns location_path ordered root-to-leaf
 * and includes geom on the location for map initialization.
 *
 * Spec: Requirement — Incident Detail Location Hierarchy
 * Spec: Requirement — Geometry Preservation in Detail Responses
 */
it('returns location_path and geom in incident detail', function (): void {
    // Build location hierarchy
    $country = Location::create(['name' => 'Ecuador', 'level' => 'country']);
    $province = Location::create(['name' => 'Pichincha', 'level' => 'province', 'parent_id' => $country->id]);
    $city = Location::create(['name' => 'Quito', 'level' => 'city', 'parent_id' => $province->id]);

    // Create supporting entities
    $category = IncidentCategory::create(['name' => 'Test Category']);
    $org = Organization::create(['name' => 'Test Org', 'location_id' => $city->id, 'max_active_claims' => 5]);

    // Create incident at city level
    $incident = Incident::create([
        'title' => 'Test Incident',
        'description' => 'Test description',
        'incident_category_id' => $category->id,
        'organization_id' => $org->id,
        'location_id' => $city->id,
        'user_id' => $this->admin->id,
        'status' => 'pending',
        'priority' => 'medium',
    ]);

    $response = $this->actingAs($this->admin)->getJson("/api/incidents/{$incident->id}");

    $response->assertOk();

    $json = $response->json();
    $data = $json['data'] ?? $json;

    // location_path must be present and ordered root-to-leaf
    expect($data)->toHaveKey('location_path');
    expect($data['location_path'])->toHaveCount(3);
    expect($data['location_path'][0]['name'])->toBe('Ecuador');
    expect($data['location_path'][1]['name'])->toBe('Pichincha');
    expect($data['location_path'][2]['name'])->toBe('Quito');

    // The location object within incident must include geom key (even if null)
    expect($data)->toHaveKey('location');
    expect($data['location'])->toHaveKey('geom');
});
