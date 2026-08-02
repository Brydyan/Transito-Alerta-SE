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

    foreach (Permission::all() as $permission) {
        $slug = "{$permission->resource}.{$permission->action}";
        Gate::define($slug, fn (User $user) => $user->hasPermission($slug));
    }

    $this->withoutMiddleware(JwtAuthenticate::class);
});

describe('CRUD — admin_sistema bypass', function (): void {

    it('index — lists all roles', function (): void {
        $admin = User::factory()->create(['role_id' => 1]);

        $response = $this->actingAs($admin)->getJson('/api/roles');

        $response->assertOk();
        $response->assertJsonStructure(['data' => ['*' => ['id', 'name']]]);
        expect(count($response->json('data')))->toBeGreaterThanOrEqual(5);
    });

    it('store — creates a role', function (): void {
        $admin = User::factory()->create(['role_id' => 1]);

        $response = $this->actingAs($admin)->postJson('/api/roles', [
            'name' => 'supervisor',
        ]);

        $response->assertStatus(201);
        $response->assertJsonPath('data.name', 'supervisor');
        $this->assertDatabaseHas('roles', ['name' => 'supervisor']);
    });

    it('show — returns a single role with permissions', function (): void {
        $admin = User::factory()->create(['role_id' => 1]);
        $role = Role::find(3);

        $response = $this->actingAs($admin)->getJson("/api/roles/{$role->id}");

        $response->assertOk();
        $response->assertJsonPath('data.name', $role->name);
        $response->assertJsonStructure([
            'data' => ['id', 'name', 'permissions', 'available_permissions'],
        ]);
    });

    it('show — returns 404 for non-existent role', function (): void {
        $admin = User::factory()->create(['role_id' => 1]);

        $response = $this->actingAs($admin)->getJson('/api/roles/999');

        $response->assertStatus(404);
        $response->assertSee('Rol no encontrado');
    });

    it('update — modifies a role name', function (): void {
        $admin = User::factory()->create(['role_id' => 1]);
        $role = Role::firstOrCreate(['name' => 'old_name']);

        $response = $this->actingAs($admin)->putJson("/api/roles/{$role->id}", [
            'name' => 'new_name',
        ]);

        $response->assertOk();
        expect($role->fresh()->name)->toBe('new_name');
    });

    it('destroy — soft-deletes a role', function (): void {
        $admin = User::factory()->create(['role_id' => 1]);
        $role = Role::firstOrCreate(['name' => 'temporal']);

        $response = $this->actingAs($admin)->deleteJson("/api/roles/{$role->id}");

        $response->assertStatus(204);
        $this->assertSoftDeleted('roles', ['id' => $role->id]);
    });

});

describe('syncPermissions', function (): void {

    it('syncs permissions to a role', function (): void {
        $admin = User::factory()->create(['role_id' => 1]);
        $role = Role::firstOrCreate(['name' => 'rol_con_permisos']);
        $permIds = Permission::where('resource', 'users')
            ->pluck('permission_id')
            ->values()
            ->toArray();

        $response = $this->actingAs($admin)->putJson("/api/roles/{$role->id}/permissions", [
            'permissions' => $permIds,
        ]);

        $response->assertOk();
        $response->assertJsonCount(count($permIds), 'data.permissions');
    });

    it('forbids non-admin from syncing permissions', function (): void {
        $operator = User::factory()->create(['role_id' => 2]);
        $role = Role::firstOrCreate(['name' => 'rol_protegido']);

        $response = $this->actingAs($operator)->putJson("/api/roles/{$role->id}/permissions", [
            'permissions' => [],
        ]);

        $response->assertStatus(403);
        $response->assertSee('Solo admin_sistema');
    });

    it('validates permissions array with existing permission ids', function (): void {
        $admin = User::factory()->create(['role_id' => 1]);
        $role = Role::firstOrCreate(['name' => 'rol_validacion']);

        $response = $this->actingAs($admin)->putJson("/api/roles/{$role->id}/permissions", [
            'permissions' => [99999],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['permissions.0']);
    });

});

describe('availablePermissions', function (): void {

    it('returns permissions grouped by resource', function (): void {
        $admin = User::factory()->create(['role_id' => 1]);

        $response = $this->actingAs($admin)->getJson('/api/permissions');

        $response->assertOk();
        $response->assertJsonStructure([
            'data' => [
                '*' => [
                    'resource',
                    'permissions' => ['*' => ['id', 'action', 'name', 'description']],
                ],
            ],
        ]);
        expect(count($response->json('data')))->toBeGreaterThanOrEqual(8);
    });

});

describe('myPermissions', function (): void {

    it('returns permission slugs for the current user', function (): void {
        $usuario = User::factory()->create(['role_id' => 5]);

        $response = $this->actingAs($usuario)->getJson('/api/permissions/my');

        $response->assertOk();
        $response->assertJsonStructure(['data']);
        $slugs = $response->json('data');
        expect($slugs)->toContain('feed.view');
        expect($slugs)->not->toContain('users.view');
    });

    it('returns 401 for unauthenticated request', function (): void {
        $response = $this->getJson('/api/permissions/my');

        $response->assertStatus(401);
    });

});

describe('authorization — denied without correct permission', function (): void {

    it('denies index without roles.view', function (): void {
        $role = Role::firstOrCreate(['name' => 'sin_permisos']);
        $user = User::factory()->create(['role_id' => $role->id]);

        $response = $this->actingAs($user)->getJson('/api/roles');

        $response->assertForbidden();
    });

    it('denies store without roles.create', function (): void {
        $role = Role::firstOrCreate(['name' => 'sin_permisos_v2']);
        $user = User::factory()->create(['role_id' => $role->id]);

        $response = $this->actingAs($user)->postJson('/api/roles', [
            'name' => 'should_fail',
        ]);

        $response->assertForbidden();
    });

    it('denies show without roles.view', function (): void {
        $role = Role::firstOrCreate(['name' => 'sin_permisos_v3']);
        $user = User::factory()->create(['role_id' => $role->id]);

        $response = $this->actingAs($user)->getJson('/api/roles/3');

        $response->assertForbidden();
    });

    it('denies update without roles.update', function (): void {
        $role = Role::firstOrCreate(['name' => 'sin_permisos_v4']);
        $user = User::factory()->create(['role_id' => $role->id]);

        $response = $this->actingAs($user)->putJson('/api/roles/3', [
            'name' => 'hack',
        ]);

        $response->assertForbidden();
    });

    it('denies destroy without roles.delete', function (): void {
        $role = Role::firstOrCreate(['name' => 'sin_permisos_v5']);
        $user = User::factory()->create(['role_id' => $role->id]);

        $response = $this->actingAs($user)->deleteJson('/api/roles/3');

        $response->assertForbidden();
    });

});

describe('validation', function (): void {

    it('rejects duplicate role name on store', function (): void {
        $admin = User::factory()->create(['role_id' => 1]);

        $response = $this->actingAs($admin)->postJson('/api/roles', [
            'name' => 'usuario',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['name']);
    });

    it('rejects duplicate role name on update', function (): void {
        $admin = User::factory()->create(['role_id' => 1]);
        $role = Role::firstOrCreate(['name' => 'nuevo_rol']);

        $response = $this->actingAs($admin)->putJson("/api/roles/{$role->id}", [
            'name' => 'usuario',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['name']);
    });

    it('rejects empty name on store', function (): void {
        $admin = User::factory()->create(['role_id' => 1]);

        $response = $this->actingAs($admin)->postJson('/api/roles', [
            'name' => '',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['name']);
    });

});
