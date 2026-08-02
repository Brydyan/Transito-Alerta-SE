<?php

declare(strict_types=1);

use App\Domains\Locations\Models\Location;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// NOTE: each citizen test bypasses the JWT middleware explicitly because
// `actingAs()` does not authenticate through the HTTP middleware stack.
// The authentication test at the bottom deliberately does NOT bypass it.
function bypassJwt(): void
{
    test()->withoutMiddleware(JwtAuthenticate::class);
}

it('lets a plain citizen list provinces without the locations.view permission', function (): void {
    bypassJwt();
    $citizen = User::factory()->create();
    $this->actingAs($citizen);

    Location::create(['name' => 'Pichincha', 'code' => '17', 'level' => 'province']);
    Location::create(['name' => 'Guayas', 'code' => '09', 'level' => 'province']);

    $response = $this->getJson('/api/locations/catalog?level=province');

    $response->assertOk()
        ->assertJsonCount(2, 'data');
    expect($response->json('data.*.name'))
        ->toContain('Pichincha')
        ->toContain('Guayas');
});

it('lets a citizen fetch children of a province (canton cascade)', function (): void {
    bypassJwt();
    $citizen = User::factory()->create();
    $this->actingAs($citizen);

    $province = Location::create(['name' => 'Pichincha', 'code' => '17', 'level' => 'province']);
    Location::create(['name' => 'Quito', 'code' => '1701', 'level' => 'city', 'parent_id' => $province->id]);
    Location::create(['name' => 'Cayambe', 'code' => '1702', 'level' => 'city', 'parent_id' => $province->id]);

    $response = $this->getJson("/api/locations/catalog?parent_id={$province->id}");

    $response->assertOk()
        ->assertJsonCount(2, 'data');
    expect($response->json('data.*.name'))
        ->toContain('Quito')
        ->toContain('Cayambe');
});

it('still requires authentication for the catalog endpoint', function (): void {
    // Intentionally NOT bypassing JwtAuthenticate here.
    Location::create(['name' => 'Pichincha', 'code' => '17', 'level' => 'province']);

    $response = $this->getJson('/api/locations/catalog?level=province');

    $response->assertUnauthorized();
});

it('validates the level filter against the location level domain', function (): void {
    bypassJwt();
    $citizen = User::factory()->create();
    $this->actingAs($citizen);

    $this->getJson('/api/locations/catalog?level=continent')
        ->assertStatus(422);
});
