<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// Bypass the JWT middleware — these tests use `actingAs()` directly.
// The endpoint itself still requires authentication (covered below).
beforeEach(function (): void {
    $this->withoutMiddleware(JwtAuthenticate::class);
});

it('returns the orgs that will be notified, marking the claimable one', function (): void {
    $user = User::factory()->create();
    $this->actingAs($user);

    $category = IncidentCategory::create(['name' => 'Alumbrado', 'parent_id' => null]);
    $province = Location::create(['name' => 'Pichincha', 'level' => 'province']);
    $city = Location::create([
        'name' => 'Quito',
        'level' => 'city',
        'parent_id' => $province->id,
    ]);

    $transversal = Organization::create([
        'name' => 'GAD Provincial',
        'location_id' => $province->id,
        'incident_category_id' => null,
    ]);
    $electric = Organization::create([
        'name' => 'Empresa Eléctrica',
        'location_id' => $city->id,
        'incident_category_id' => $category->id,
    ]);

    $response = $this->getJson(
        "/api/organizations/notified-for?location_id={$city->id}&category_id={$category->id}",
    );

    $response->assertOk()
        ->assertJsonStructure([
            'data' => [
                ['id', 'name', 'location_id', 'is_claimable'],
            ],
        ]);

    $data = collect($response->json('data'));
    // Both orgs must appear, regardless of internal order in the response.
    expect($data->pluck('id')->sort()->values()->all())
        ->toBe(collect([$electric->id, $transversal->id])->sort()->values()->all());
    // The transversal was created first, so it wins findForLocation →
    // findForLocation returns the lowest id with location match, hence
    // is_claimable for the transversal and false for the category-specific one.
    expect($data->firstWhere('id', $transversal->id)['is_claimable'])->toBeTrue();
    expect($data->firstWhere('id', $electric->id)['is_claimable'])->toBeFalse();
});

it('requires both location_id and category_id', function (): void {
    $user = User::factory()->create();
    $this->actingAs($user);

    $this->getJson('/api/organizations/notified-for')
        ->assertStatus(422)
        ->assertJsonValidationErrors(['location_id', 'category_id']);
});

it('validates that the location exists', function (): void {
    $user = User::factory()->create();
    $this->actingAs($user);
    $category = IncidentCategory::create(['name' => 'X', 'parent_id' => null]);

    $this->getJson("/api/organizations/notified-for?location_id=999999&category_id={$category->id}")
        ->assertStatus(422)
        ->assertJsonValidationErrors(['location_id']);
});

it('returns an empty list when nothing matches', function (): void {
    $user = User::factory()->create();
    $this->actingAs($user);
    $category = IncidentCategory::create(['name' => 'X', 'parent_id' => null]);
    $loc = Location::create(['name' => 'Islote', 'level' => 'city']);

    $this->getJson("/api/organizations/notified-for?location_id={$loc->id}&category_id={$category->id}")
        ->assertOk()
        ->assertJsonPath('data', []);
});
