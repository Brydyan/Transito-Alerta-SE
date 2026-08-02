<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Permissions\Models\Permission;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Redis;

uses(RefreshDatabase::class);

// The anonymous "Visitante" role was retired — /api/incidents/feed now
// requires auth for everyone (docs/Requisitos/SRS.md RF-SW-008). FeedController
// branches by role: `usuario` (citizen) still gets this Redis-backed path,
// which is what these tests exercise, so every request here authenticates
// as a `usuario`-role user instead of hitting the endpoint anonymously.
beforeEach(function (): void {
    if (! class_exists('Redis')) {
        $this->markTestSkipped('Redis extension is required for this test.');
    }

    DB::table('roles')->insertOrIgnore(['id' => 5, 'name' => 'usuario']);
    $this->citizen = User::factory()->create(['role_id' => 5]);

    // Seed the permissions catalog so policy lookups work, then grant
    // feed.view to usuario (role 5) — needed by the FeedController
    // citizen-path check.
    $this->seed(PermissionSeeder::class);
    $permId = Permission::where('resource', 'feed')
        ->where('action', 'view')->value('permission_id');
    DB::table('role_permission')->insertOrIgnore([
        'role_id' => 5,
        'permission_id' => $permId,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    // Re-register dynamic gates after seeding (AppServiceProvider ran on
    // empty DB at boot, so feed.view gate doesn't exist yet).
    foreach (Permission::all() as $p) {
        Gate::define(
            "{$p->resource}.{$p->action}",
            fn (User $user) => $user->hasPermission("{$p->resource}.{$p->action}"),
        );
    }

    // Skip JWT middleware — actingAs() bypasses the Auth guard but not
    // the custom JwtAuthenticate middleware, which still rejects the
    // request with 401 before the controller runs. Same seam used by
    // CommentControllerTest and ClaimFlowTest.
    $this->withoutMiddleware(JwtAuthenticate::class);
});

it('returns feed from Redis with correct JSON structure', function (): void {
    Redis::shouldReceive('zrevrange')
        ->with('feed:v2:index', 0, 499)
        ->andReturn(['1']);

    Redis::shouldReceive('hgetall')
        ->with('feed:v2:items')
        ->andReturn([
            '1' => json_encode([
                'id' => '1',
                'incident_category_id' => '10',
                'organization_id' => '5',
                'user_id' => '3',
                'location_id' => '100',
                'status' => 'pending',
                'priority' => 'high',
                'resolution_date' => null,
                'created_at' => '2026-06-26T10:00:00+00:00',
                'updated_at' => '2026-06-26T10:00:00+00:00',
                'geom' => '{"type":"Point","coordinates":[-78.5,-1.2]}',
                'category_name' => 'Accidente',
                'organization_name' => 'Defensa Civil',
                'location_name' => 'Quito',
                'location_path_ids' => '[1,10,100]',
                'user_first_name' => 'Juan',
                'user_last_name' => 'Pérez',
                'user_avatar' => null,
            ]),
        ]);

    $response = $this->actingAs($this->citizen)->getJson('/api/incidents/feed');

    $response->assertOk();
    $response->assertJsonStructure([
        'data' => [
            '*' => [
                'id',
                'status',
                'priority',
                'category' => ['id', 'name'],
                'user' => ['id', 'first_name', 'last_name', 'avatar'],
                'location' => ['id', 'name'],
                'geom',
            ],
        ],
        'meta' => ['current_page', 'per_page', 'total', 'last_page', 'from', 'to'],
    ]);
    $response->assertJsonPath('data.0.id', 1);
    $response->assertJsonPath('data.0.status', 'pending');
    $response->assertJsonPath('data.0.category.name', 'Accidente');
    $response->assertJsonPath('data.0.user.first_name', 'Juan');
    $response->assertJsonPath('meta.total', 1);
});

it('returns empty feed when Redis throws an exception', function (): void {
    Redis::shouldReceive('zrevrange')
        ->with('feed:v2:index', 0, 499)
        ->andThrow(new RuntimeException('Redis connection refused'));

    // FeedService catches Redis exceptions and returns an empty response
    $response = $this->actingAs($this->citizen)->getJson('/api/incidents/feed');

    $response->assertOk();
    $response->assertJsonPath('data', []);
    $response->assertJsonPath('meta.total', 0);
});

it('applies status filter when reading from Redis', function (): void {
    Redis::shouldReceive('zrevrange')
        ->with('feed:v2:index', 0, 499)
        ->andReturn(['1', '2']);

    $baseData = [
        'id' => '0',
        'incident_category_id' => '10',
        'organization_id' => '5',
        'user_id' => '3',
        'location_id' => '100',
        'status' => 'pending',
        'priority' => 'high',
        'created_at' => '2026-06-26T10:00:00+00:00',
        'updated_at' => '2026-06-26T10:00:00+00:00',
        'category_name' => 'Cat',
        'organization_name' => 'Org',
        'location_name' => 'Loc',
        'location_path_ids' => '[]',
        'user_first_name' => 'A',
        'user_last_name' => 'B',
        'user_avatar' => null,
    ];

    Redis::shouldReceive('hgetall')
        ->with('feed:v2:items')
        ->andReturn([
            '1' => json_encode(array_merge($baseData, ['id' => '1', 'status' => 'pending'])),
            '2' => json_encode(array_merge($baseData, ['id' => '2', 'status' => 'resolved'])),
        ]);

    $response = $this->actingAs($this->citizen)->getJson('/api/incidents/feed?status=pending');

    $response->assertOk();
    $response->assertJsonPath('meta.total', 1);
    $response->assertJsonPath('data.0.id', 1);
});

// ============================================================================
// Staff path tests — FeedController branches to Postgres (via
// IncidentRepository) for non-citizen roles. These tests create real
// incidents in the database and verify the staff feed response shape.
// ============================================================================

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(RolePermissionSeeder::class);

    foreach (Permission::all() as $p) {
        Gate::define(
            "{$p->resource}.{$p->action}",
            fn (User $user) => $user->hasPermission("{$p->resource}.{$p->action}"),
        );
    }
})->group('staff-feed');

it('staff feed returns incidents from Postgres with correct structure', function (): void {
    $category = IncidentCategory::create(['name' => 'Accidente']);
    $location = Location::create(['name' => 'Quito', 'level' => 'city']);
    $org = Organization::create([
        'name' => 'Defensa Civil',
        'location_id' => $location->id,
    ]);
    $incident = Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $org->id,
        'user_id' => $this->citizen->id,
        'location_id' => $location->id,
        'title' => 'Incendio forestal',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_HIGH,
    ]);

    // operador_sistema (role 2) is not a regular user → hits staff path
    $staff = User::factory()->create(['role_id' => 2]);

    $response = $this->actingAs($staff)->getJson('/api/incidents/feed');

    $response->assertOk();
    $response->assertJsonStructure([
        'data' => [
            '*' => [
                'id', 'incident_category_id', 'organization_id', 'user_id', 'location_id',
                'title', 'status', 'priority', 'resolution_date',
                'created_at', 'updated_at', 'geom',
                'category' => ['id', 'name'],
                'organization' => ['id', 'name'],
                'user' => ['id', 'first_name', 'last_name', 'avatar'],
                'location' => ['id', 'name'],
            ],
        ],
        'meta' => ['current_page', 'per_page', 'total', 'last_page', 'from', 'to'],
    ]);
    $response->assertJsonPath('data.0.id', $incident->id);
    $response->assertJsonPath('data.0.title', 'Incendio forestal');
    $response->assertJsonPath('meta.total', 1);
})->group('staff-feed');

it('staff feed respects per_page and paginates', function (): void {
    $cat = IncidentCategory::create(['name' => 'Cat']);
    $loc = Location::create(['name' => 'Loc', 'level' => 'city']);
    $org = Organization::create(['name' => 'Org', 'location_id' => $loc->id]);

    foreach (range(1, 25) as $i) {
        Incident::create([
            'incident_category_id' => $cat->id,
            'organization_id' => $org->id,
            'user_id' => $this->citizen->id,
            'location_id' => $loc->id,
            'title' => "Incident {$i}",
            'status' => Incident::STATUS_PENDING,
            'priority' => Incident::PRIORITY_MEDIUM,
        ]);
    }

    $staff = User::factory()->create(['role_id' => 2]);

    $response = $this->actingAs($staff)->getJson('/api/incidents/feed?per_page=10');

    $response->assertOk();
    $response->assertJsonCount(10, 'data');
    $response->assertJsonPath('meta.per_page', 10);
    $response->assertJsonPath('meta.total', 25);
    $response->assertJsonPath('meta.current_page', 1);
    $response->assertJsonPath('meta.last_page', 3);
})->group('staff-feed');

it('staff feed requires incidents.view permission', function (): void {
    // Create a throwaway role with NO permissions at all.
    $noPermRole = Role::firstOrCreate(['name' => 'sin_permisos']);
    $user = User::factory()->create(['role_id' => $noPermRole->id]);

    $response = $this->actingAs($user)->getJson('/api/incidents/feed');

    $response->assertStatus(403);
    $response->assertSee('No tienes permiso para ver el feed de incidencias');
})->group('staff-feed');

it('rejects unauthenticated request to feed', function (): void {
    $response = $this->getJson('/api/incidents/feed');

    $response->assertStatus(401);
});
