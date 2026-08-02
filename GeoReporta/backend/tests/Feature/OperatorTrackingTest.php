<?php

declare(strict_types=1);

use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Redis;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(RolePermissionSeeder::class);

    // Fetch role IDs by name to avoid hardcoding
    $this->adminSistemaRoleId = Role::where('name', 'admin_sistema')->first()->id;
    $this->adminOrganizacionRoleId = Role::where('name', 'admin_organizacion')->first()->id;
    $this->operadorOrganizacionRoleId = Role::where('name', 'operador_organizacion')->first()->id;

    // Create a base location
    $this->location = Location::create([
        'name' => 'Main City',
        'level' => 'city',
    ]);

    // Create organizations
    $this->orgA = Organization::create([
        'name' => 'Org A',
        'location_id' => $this->location->id,
        'max_active_claims' => 5,
    ]);

    $this->orgB = Organization::create([
        'name' => 'Org B',
        'location_id' => $this->location->id,
        'max_active_claims' => 5,
    ]);

    // Create Operators
    $this->operatorA1 = User::factory()->create([
        'role_id' => $this->operadorOrganizacionRoleId,
        'organization_id' => $this->orgA->id,
        'first_name' => 'Operator',
        'last_name' => 'A1',
    ]);

    $this->operatorA2 = User::factory()->create([
        'role_id' => $this->operadorOrganizacionRoleId,
        'organization_id' => $this->orgA->id,
        'first_name' => 'Operator',
        'last_name' => 'A2',
    ]);

    $this->operatorB1 = User::factory()->create([
        'role_id' => $this->operadorOrganizacionRoleId,
        'organization_id' => $this->orgB->id,
        'first_name' => 'Operator',
        'last_name' => 'B1',
    ]);

    // AdminOrganizacion for Org A
    $this->adminA = User::factory()->create([
        'role_id' => $this->adminOrganizacionRoleId,
        'organization_id' => $this->orgA->id,
    ]);

    // SystemAdmin
    $this->systemAdmin = User::factory()->create([
        'role_id' => $this->adminSistemaRoleId,
        'organization_id' => null,
    ]);
});

it('unauthenticated users cannot ping or retrieve operator locations', function (): void {
    $this->postJson('/api/operator/location', ['lat' => -0.180653, 'lng' => -78.467834])
        ->assertStatus(401);

    $this->getJson('/api/operator/locations')
        ->assertStatus(401);
});

it('allows operator to ping location and stores in Redis', function (): void {
    Redis::shouldReceive('geoadd')
        ->once()
        ->with('operators:locations', -78.467834, -0.180653, (string) $this->operatorA1->id)
        ->andReturn(1);

    Redis::shouldReceive('zadd')
        ->once()
        ->with('operators:active', Mockery::type('float'), (string) $this->operatorA1->id)
        ->andReturn(1);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->operatorA1)
        ->postJson('/api/operator/location', [
            'lat' => -0.180653,
            'lng' => -78.467834,
        ]);

    $response->assertOk()
        ->assertJson(['status' => 'success']);
});

it('validates operator location payload fields', function (): void {
    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->operatorA1)
        ->postJson('/api/operator/location', [
            'lat' => 'invalid-lat',
        ]);

    $response->assertStatus(422)
        ->assertJsonValidationErrors(['lat', 'lng']);
});

it('allows Org Admin to query active operators in their organization', function (): void {
    $now = time();

    Redis::shouldReceive('zrangebyscore')
        ->once()
        ->with('operators:active', '-inf', Mockery::any())
        ->andReturn([]);

    Redis::shouldReceive('zrange')
        ->once()
        ->with('operators:active', 0, -1)
        ->andReturn([
            (string) $this->operatorA1->id,
            (string) $this->operatorA2->id,
            (string) $this->operatorB1->id,
        ]);

    Redis::shouldReceive('pipeline')
        ->once()
        ->andReturnSelf();

    Redis::shouldReceive('zscore')
        ->with('operators:active', (string) $this->operatorA1->id)
        ->andReturnSelf();
    Redis::shouldReceive('geopos')
        ->with('operators:locations', (string) $this->operatorA1->id)
        ->andReturnSelf();

    Redis::shouldReceive('zscore')
        ->with('operators:active', (string) $this->operatorA2->id)
        ->andReturnSelf();
    Redis::shouldReceive('geopos')
        ->with('operators:locations', (string) $this->operatorA2->id)
        ->andReturnSelf();

    Redis::shouldReceive('exec')
        ->once()
        ->andReturn([
            $now,
            [[-78.467834, -0.180653]],
            $now,
            [[-78.467000, -0.180000]],
        ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->adminA)
        ->getJson('/api/operator/locations');

    $response->assertOk()
        ->assertJsonCount(2);

    $data = $response->json();
    $ids = collect($data)->pluck('id')->toArray();

    expect($ids)->toContain($this->operatorA1->id);
    expect($ids)->toContain($this->operatorA2->id);
    expect($ids)->not->toContain($this->operatorB1->id);

    $op1 = collect($data)->firstWhere('id', $this->operatorA1->id);
    expect($op1['first_name'])->toBe('Operator');
    expect($op1['last_name'])->toBe('A1');
    expect($op1['organization_id'])->toBe($this->orgA->id);
    expect($op1['lat'])->toBe(-0.180653);
    expect($op1['lng'])->toBe(-78.467834);
    expect($op1['last_ping'])->toBe($now);
});

it('allows Operator to query other active operators in their organization', function (): void {
    $now = time();

    Redis::shouldReceive('zrangebyscore')
        ->once()
        ->with('operators:active', '-inf', Mockery::any())
        ->andReturn([]);

    Redis::shouldReceive('zrange')
        ->once()
        ->with('operators:active', 0, -1)
        ->andReturn([
            (string) $this->operatorA1->id,
            (string) $this->operatorA2->id,
            (string) $this->operatorB1->id,
        ]);

    Redis::shouldReceive('pipeline')
        ->once()
        ->andReturnSelf();

    Redis::shouldReceive('zscore')
        ->with('operators:active', (string) $this->operatorA1->id)
        ->andReturnSelf();
    Redis::shouldReceive('geopos')
        ->with('operators:locations', (string) $this->operatorA1->id)
        ->andReturnSelf();

    Redis::shouldReceive('zscore')
        ->with('operators:active', (string) $this->operatorA2->id)
        ->andReturnSelf();
    Redis::shouldReceive('geopos')
        ->with('operators:locations', (string) $this->operatorA2->id)
        ->andReturnSelf();

    Redis::shouldReceive('exec')
        ->once()
        ->andReturn([
            $now,
            [[-78.467834, -0.180653]],
            $now,
            [[-78.467000, -0.180000]],
        ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->operatorA1)
        ->getJson('/api/operator/locations');

    $response->assertOk()
        ->assertJsonCount(2);
});

it('allows System Admin to query active operators across all organizations', function (): void {
    $now = time();

    Redis::shouldReceive('zrangebyscore')
        ->once()
        ->with('operators:active', '-inf', Mockery::any())
        ->andReturn([]);

    Redis::shouldReceive('zrange')
        ->once()
        ->with('operators:active', 0, -1)
        ->andReturn([
            (string) $this->operatorA1->id,
            (string) $this->operatorB1->id,
        ]);

    Redis::shouldReceive('pipeline')
        ->once()
        ->andReturnSelf();

    Redis::shouldReceive('zscore')
        ->with('operators:active', (string) $this->operatorA1->id)
        ->andReturnSelf();
    Redis::shouldReceive('geopos')
        ->with('operators:locations', (string) $this->operatorA1->id)
        ->andReturnSelf();

    Redis::shouldReceive('zscore')
        ->with('operators:active', (string) $this->operatorB1->id)
        ->andReturnSelf();
    Redis::shouldReceive('geopos')
        ->with('operators:locations', (string) $this->operatorB1->id)
        ->andReturnSelf();

    Redis::shouldReceive('exec')
        ->once()
        ->andReturn([
            $now,
            [[-78.467834, -0.180653]],
            $now,
            [[-79.000000, -1.000000]],
        ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->systemAdmin)
        ->getJson('/api/operator/locations');

    $response->assertOk()
        ->assertJsonCount(2);

    $ids = collect($response->json())->pluck('id')->toArray();
    expect($ids)->toContain($this->operatorA1->id);
    expect($ids)->toContain($this->operatorB1->id);
});

it('cleans up stale operators older than 300 seconds on query', function (): void {
    $now = time();
    $staleLimit = $now - 300;

    Redis::shouldReceive('zrangebyscore')
        ->once()
        ->with('operators:active', '-inf', Mockery::any())
        ->andReturn([(string) $this->operatorA1->id]);

    Redis::shouldReceive('zrem')
        ->once()
        ->with('operators:locations', (string) $this->operatorA1->id)
        ->andReturn(1);

    Redis::shouldReceive('zremrangebyscore')
        ->once()
        ->with('operators:active', '-inf', Mockery::any())
        ->andReturn(1);

    Redis::shouldReceive('zrange')
        ->once()
        ->with('operators:active', 0, -1)
        ->andReturn([(string) $this->operatorA2->id]);

    Redis::shouldReceive('pipeline')
        ->once()
        ->andReturnSelf();

    Redis::shouldReceive('zscore')
        ->with('operators:active', (string) $this->operatorA2->id)
        ->andReturnSelf();
    Redis::shouldReceive('geopos')
        ->with('operators:locations', (string) $this->operatorA2->id)
        ->andReturnSelf();

    Redis::shouldReceive('exec')
        ->once()
        ->andReturn([
            $now - 100,
            [[-78.467000, -0.180000]],
        ]);

    $response = $this->withoutMiddleware([JwtAuthenticate::class])
        ->actingAs($this->adminA)
        ->getJson('/api/operator/locations');

    $response->assertOk()
        ->assertJsonCount(1);

    $data = $response->json();
    expect($data[0]['id'])->toBe($this->operatorA2->id);
});
