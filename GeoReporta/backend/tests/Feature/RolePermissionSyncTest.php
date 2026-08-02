<?php

declare(strict_types=1);

use App\Domains\Permissions\Models\Permission;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Http\Middleware\JwtAuthenticate;
use App\Domains\Users\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(RolePermissionSeeder::class);

    // Fetch role IDs by name
    $this->adminSistemaRoleId = Role::where('name', 'admin_sistema')->first()->id;
    $this->operadorOrganizacionRoleId = Role::where('name', 'operador_organizacion')->first()->id;
    $this->adminOrganizacionRoleId = Role::where('name', 'admin_organizacion')->first()->id;

    // Register dynamic gates from permissions table
    foreach (Permission::all() as $permission) {
        $slug = "{$permission->resource}.{$permission->action}";
        Gate::define($slug, fn (User $user) => $user->hasPermission($slug));
    }

    // Skip JWT middleware — we'll use actingAs() directly
    $this->withoutMiddleware(JwtAuthenticate::class);
});

function makeTestRole(string $name = 'rol_test'): Role
{
    return Role::firstOrCreate(['name' => $name]);
}

it('admin_sistema can sync permissions to a role', function (): void {
    $admin = User::factory()->create(['role_id' => $this->adminSistemaRoleId]);
    $this->actingAs($admin);

    $targetRole = makeTestRole();
    $permissionIds = Permission::limit(3)->pluck('permission_id')->toArray();

    $response = $this->putJson("/api/roles/{$targetRole->id}/permissions", [
        'permissions' => $permissionIds,
    ]);

    $response->assertOk();
    expect($targetRole->fresh()->permissions()->count())->toBe(3);
});

it('sync replaces previous permissions (full sync, not append)', function (): void {
    $admin = User::factory()->create(['role_id' => $this->adminSistemaRoleId]);
    $this->actingAs($admin);

    $targetRole = makeTestRole();
    $initialIds = Permission::limit(5)->pluck('permission_id')->toArray();
    $targetRole->permissions()->sync($initialIds);
    expect($targetRole->fresh()->permissions()->count())->toBe(5);

    $newIds = Permission::limit(2)->pluck('permission_id')->toArray();
    $response = $this->putJson("/api/roles/{$targetRole->id}/permissions", [
        'permissions' => $newIds,
    ]);

    $response->assertOk();
    expect($targetRole->fresh()->permissions()->count())->toBe(2);
});

it('non-admin cannot sync permissions', function (): void {
    $operador = User::factory()->create(['role_id' => $this->operadorOrganizacionRoleId]);
    $this->actingAs($operador);

    $targetRole = makeTestRole();

    $response = $this->putJson("/api/roles/{$targetRole->id}/permissions", [
        'permissions' => [1, 2],
    ]);

    $response->assertForbidden();
});

it('validates permission IDs must exist', function (): void {
    $admin = User::factory()->create(['role_id' => $this->adminSistemaRoleId]);
    $this->actingAs($admin);

    $targetRole = makeTestRole();

    $response = $this->putJson("/api/roles/{$targetRole->id}/permissions", [
        'permissions' => [999999],
    ]);

    $response->assertStatus(422);
    $response->assertJsonValidationErrors(['permissions.0']);
});

it('returns 404 when role does not exist', function (): void {
    $admin = User::factory()->create(['role_id' => $this->adminSistemaRoleId]);
    $this->actingAs($admin);

    // A real, existing permission id — must pass the `exists:permissions`
    // validation rule before the controller ever reaches the "role not
    // found" check. Postgres SERIAL sequences are not rolled back
    // between tests (see RoleSeederTest), so a hardcoded literal like
    // `1` is not guaranteed to still be a valid permission_id here.
    $validPermissionId = Permission::query()->value('permission_id');

    $response = $this->putJson('/api/roles/999999/permissions', [
        'permissions' => [$validPermissionId],
    ]);

    $response->assertNotFound();
});

// R-14: GET /api/permissions requires roles.view permission.
// Closes an information-disclosure gap where any authenticated user
// could enumerate the system's full permission catalog.

it('denies availablePermissions for user without roles.view permission', function (): void {
    // operador_organizacion is NOT an admin and does NOT have
    // roles.view per RolePermissionSeeder, so the dynamic gate 'roles.view'
    // returns false and the authorize() call throws AuthorizationException.
    // (admin_sistema would bypass via Gate::before in AppServiceProvider,
    // which is why we cannot use admin_sistema role_id here even though it lacks
    // roles.view in pivot.)
    $operador = User::factory()->create(['role_id' => $this->operadorOrganizacionRoleId]);
    $this->actingAs($operador);

    $response = $this->getJson('/api/permissions');

    $response->assertForbidden();
});

it('allows availablePermissions for user with roles.view permission', function (): void {
    $orgAdmin = User::factory()->create(['role_id' => $this->adminOrganizacionRoleId]);
    $rolesView = Permission::query()
        ->where('resource', 'roles')
        ->where('action', 'view')
        ->firstOrFail();
    $orgAdmin->role->permissions()->syncWithoutDetaching([$rolesView->permission_id]);
    $this->actingAs($orgAdmin);

    $response = $this->getJson('/api/permissions');

    $response->assertOk();
    $response->assertJsonStructure([
        'data' => [
            '*' => ['resource', 'permissions'],
        ],
    ]);
});
