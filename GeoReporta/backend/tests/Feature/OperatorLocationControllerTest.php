<?php

declare(strict_types=1);

use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Enums\UserRole;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(RolePermissionSeeder::class);

    $lookupRoleId = fn (UserRole $role): int => (int) DB::table('roles')->where('name', $role->value)->value('id');

    $this->location = Location::create(['name' => 'Main City', 'level' => 'city']);
    $this->org = Organization::create([
        'name' => 'Org A',
        'location_id' => $this->location->id,
        'max_active_claims' => 5,
    ]);

    // One user per role — covers all tiers. Operators and admin-org get an
    // org; non-operators can have null orgs because the index endpoint uses
    // organization_id for scoping only when the requester has one.
    $this->operadorSistema = User::factory()->create([
        'role_id' => $lookupRoleId(UserRole::OperadorSistema),
        'organization_id' => null,
    ]);
    $this->adminOrganizacion = User::factory()->create([
        'role_id' => $lookupRoleId(UserRole::AdminOrganizacion),
        'organization_id' => $this->org->id,
    ]);
    $this->operadorOrganizacion = User::factory()->create([
        'role_id' => $lookupRoleId(UserRole::OperadorOrganizacion),
        'organization_id' => $this->org->id,
    ]);
    $this->usuario = User::factory()->create([
        'role_id' => $lookupRoleId(UserRole::Usuario),
        'organization_id' => null,
    ]);

});

// SCEN-3.1 — the controller must allow all three operator-tier enum roles
// to call GET /api/operator/locations. SystemAdmin coverage lives in
// OperatorTrackingTest; this file focuses on the enum-driven path.

it('SCEN-3.1: OperadorSistema is allowed to query /api/operator/locations', function (): void {
    Redis::shouldReceive('zrangebyscore')->once()->andReturn([]);
    Redis::shouldReceive('zrange')->once()->andReturn([]);

    $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->operadorSistema)
        ->getJson('/api/operator/locations')
        ->assertOk();
});

it('SCEN-3.1: AdminOrganizacion is allowed to query /api/operator/locations', function (): void {
    Redis::shouldReceive('zrangebyscore')->once()->andReturn([]);
    Redis::shouldReceive('zrange')->once()->andReturn([]);

    $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->adminOrganizacion)
        ->getJson('/api/operator/locations')
        ->assertOk();
});

it('SCEN-3.1: OperadorOrganizacion is allowed to query /api/operator/locations', function (): void {
    Redis::shouldReceive('zrangebyscore')->once()->andReturn([]);
    Redis::shouldReceive('zrange')->once()->andReturn([]);

    $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->operadorOrganizacion)
        ->getJson('/api/operator/locations')
        ->assertOk();
});

// SCEN-3.2 — non-operator tiers are rejected with 403.

it('SCEN-3.2: Usuario is rejected with 403 on /api/operator/locations', function (): void {
    $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->usuario)
        ->getJson('/api/operator/locations')
        ->assertStatus(403);
});

// SCEN-3.1 (companion) — the active-operators payload is filtered to
// OperadorOrganizacion by the enum-driven whereHas clause, not by role_id.

it('SCEN-3.1 (companion): index response only contains OperadorOrganizacion users, even when other tier IDs are in Redis', function (): void {
    $now = time();
    $operadorOrgId = $this->operadorOrganizacion->id;
    $operadorSisId = $this->operadorSistema->id;

    Redis::shouldReceive('zrangebyscore')->once()->andReturn([]);
    Redis::shouldReceive('zrange')->once()->andReturn([
        (string) $operadorOrgId,
        (string) $operadorSisId,
    ]);

    // Pipeline mock for the active-operators hydrate loop. The OperadorSistema
    // is filtered out by the whereHas('role', name=OperadorOrganizacion)
    // clause BEFORE the pipeline runs, so only one zscore+geopos pair is queued.
    Redis::shouldReceive('pipeline')->once()->andReturnSelf();
    Redis::shouldReceive('zscore')
        ->with('operators:active', (string) $operadorOrgId)
        ->andReturnSelf();
    Redis::shouldReceive('geopos')
        ->with('operators:locations', (string) $operadorOrgId)
        ->andReturnSelf();
    Redis::shouldReceive('exec')->once()->andReturn([
        $now,
        [[-78.467834, -0.180653]],
    ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->adminOrganizacion)
        ->getJson('/api/operator/locations');

    $response->assertOk();

    $ids = collect($response->json())->pluck('id')->all();
    expect($ids)->toContain($operadorOrgId);
    expect($ids)->not->toContain($operadorSisId);
});

// PING endpoint coverage — same enum-driven gate, focused on the update path.

it('SCEN-3.1: OperadorSistema is allowed to PING /api/operator/location', function (): void {
    Redis::shouldReceive('geoadd')->once()->andReturn(1);
    Redis::shouldReceive('zadd')->once()->andReturn(1);

    $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->operadorSistema)
        ->postJson('/api/operator/location', [
            'lat' => -0.180653,
            'lng' => -78.467834,
        ])
        ->assertOk()
        ->assertJson(['status' => 'success']);
});

it('SCEN-3.2: Usuario is rejected with 403 on PING /api/operator/location', function (): void {
    $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->usuario)
        ->postJson('/api/operator/location', [
            'lat' => -0.180653,
            'lng' => -78.467834,
        ])
        ->assertStatus(403);
});
