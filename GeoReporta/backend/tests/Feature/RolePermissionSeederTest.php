<?php

declare(strict_types=1);

use App\Domains\Permissions\Models\Permission;
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
});

it('admin_sistema bypasses all gates', function (): void {
    $user = User::factory()->create([
        'role_id' => 1, // admin_sistema
    ]);

    expect(Gate::forUser($user)->allows('incidents.view'))->toBeTrue();
    expect(Gate::forUser($user)->allows('users.create'))->toBeTrue();
    expect(Gate::forUser($user)->allows('random.permission'))->toBeTrue();
});

it('admin_organizacion has correct permission configuration', function (): void {
    $user = User::factory()->create([
        'role_id' => 3, // admin_organizacion
    ]);

    // Has users management
    expect(Gate::forUser($user)->allows('users.view'))->toBeTrue();
    expect(Gate::forUser($user)->allows('users.create'))->toBeTrue();
    expect(Gate::forUser($user)->allows('users.update'))->toBeTrue();
    expect(Gate::forUser($user)->allows('users.delete'))->toBeTrue();

    // Has organization edit (update)
    expect(Gate::forUser($user)->allows('organizations.view'))->toBeTrue();
    expect(Gate::forUser($user)->allows('organizations.update'))->toBeTrue();
    expect(Gate::forUser($user)->allows('organizations.create'))->toBeFalse();
    expect(Gate::forUser($user)->allows('organizations.delete'))->toBeFalse();

    // Has incidents list/edit (view/update)
    expect(Gate::forUser($user)->allows('incidents.view'))->toBeTrue();
    expect(Gate::forUser($user)->allows('incidents.update'))->toBeTrue();
});

it('operador_organizacion has dashboard, incident, notification, and comment permissions', function (): void {
    $user = User::factory()->create([
        'role_id' => 4, // operador_organizacion
    ]);

    expect(Gate::forUser($user)->allows('dashboard.view'))->toBeTrue();

    // Has incident view
    expect(Gate::forUser($user)->allows('incidents.view'))->toBeTrue();
    expect(Gate::forUser($user)->allows('incidents.update'))->toBeTrue();

    // Has notification update
    expect(Gate::forUser($user)->allows('notifications.update'))->toBeTrue();

    // Has comment creation and update
    expect(Gate::forUser($user)->allows('comments.create'))->toBeTrue();
    expect(Gate::forUser($user)->allows('comments.update'))->toBeTrue();

    // Does NOT have users management or incident create/delete
    expect(Gate::forUser($user)->allows('users.create'))->toBeFalse();
    expect(Gate::forUser($user)->allows('incidents.create'))->toBeFalse();
    expect(Gate::forUser($user)->allows('incidents.delete'))->toBeFalse();
});

it('usuario has incident creation, comment creation, and comment view permissions', function (): void {
    $user = User::factory()->create([
        'role_id' => 5, // usuario
    ]);

    expect(Gate::forUser($user)->allows('incidents.create'))->toBeTrue();
    expect(Gate::forUser($user)->allows('comments.create'))->toBeTrue();
    // comments.view es necesario para que el ciudadano pueda ver los
    // comentarios en el detalle de incidencia desde el feed (carga vía
    // GET /api/incidents/{id}/comments). Sin este permiso, la sección
    // de comentarios falla con 403 en la vista ciudadana.
    expect(Gate::forUser($user)->allows('comments.view'))->toBeTrue();

    // Does NOT have other permissions
    expect(Gate::forUser($user)->allows('incidents.update'))->toBeFalse();
    expect(Gate::forUser($user)->allows('incidents.delete'))->toBeFalse();
    expect(Gate::forUser($user)->allows('users.create'))->toBeFalse();
});

// ─── Menu server-driven: new permission grants ────────────────────────

it('usuario has feed.view for citizen sidebar (Inicio + Reportar)', function (): void {
    $user = User::factory()->create([
        'role_id' => 5, // usuario
    ]);

    expect(Gate::forUser($user)->allows('feed.view'))->toBeTrue();
    // Per spec override (design Decision 1): admin_organizacion also receives feed.view.
    // For usuario, profile.view is also expected (universal profile access).
    expect(Gate::forUser($user)->allows('profile.view'))->toBeTrue();
    // usuario still has incidents.create for the citizen /feed/crear route.
    expect(Gate::forUser($user)->allows('incidents.create'))->toBeTrue();
    // usuario does NOT have incidents.manage (back-office gate).
    expect(Gate::forUser($user)->allows('incidents.manage'))->toBeFalse();
});

it('admin_organizacion has feed.view per design Decision 1 spec override', function (): void {
    $user = User::factory()->create([
        'role_id' => 3, // admin_organizacion
    ]);

    // Spec override (design Decision 1): admin_organizacion receives feed.view
    // in addition to usuario, so org admins can verify the citizen experience.
    // This overrides the spec rule "No other role SHALL receive feed.view in this change".
    expect(Gate::forUser($user)->allows('feed.view'))->toBeTrue();
    expect(Gate::forUser($user)->allows('profile.view'))->toBeTrue();
    expect(Gate::forUser($user)->allows('incidents.manage'))->toBeTrue();
    // admin_organizacion does NOT have incidents.create.
    expect(Gate::forUser($user)->allows('incidents.create'))->toBeFalse();
});

it('operador_sistema has incidents.manage for back-office Nueva Incidencia', function (): void {
    $user = User::factory()->create([
        'role_id' => 2, // operador_sistema
    ]);

    expect(Gate::forUser($user)->allows('incidents.manage'))->toBeTrue();
    expect(Gate::forUser($user)->allows('profile.view'))->toBeTrue();
    // operador_sistema does NOT have feed.view (not an org admin).
    expect(Gate::forUser($user)->allows('feed.view'))->toBeFalse();
});

it('operador_organizacion has notifications.view so the menu item appears', function (): void {
    $user = User::factory()->create([
        'role_id' => 4, // operador_organizacion
    ]);

    // Previously: this role only had notifications.update, so the menu
    // (gated by notifications.view) was hidden despite the role being able
    // to act on notifications. The fix adds notifications.view.
    expect(Gate::forUser($user)->allows('notifications.view'))->toBeTrue();
    expect(Gate::forUser($user)->allows('notifications.update'))->toBeTrue();
    expect(Gate::forUser($user)->allows('profile.view'))->toBeTrue();
    // operador_organizacion does NOT have incidents.manage (Nueva Incidencia).
    expect(Gate::forUser($user)->allows('incidents.manage'))->toBeFalse();
    // Does not have feed.view either.
    expect(Gate::forUser($user)->allows('feed.view'))->toBeFalse();
});

it('admin_sistema sees everything via the MenuService bypass branch', function (): void {
    $user = User::factory()->create([
        'role_id' => 1, // admin_sistema
    ]);

    // The bypass means admin_sistema receives all permissions via Gate.
    expect(Gate::forUser($user)->allows('incidents.manage'))->toBeTrue();
    expect(Gate::forUser($user)->allows('feed.view'))->toBeTrue();
    expect(Gate::forUser($user)->allows('profile.view'))->toBeTrue();
});

it('warns and continues when a permission is missing from the catalog', function (): void {
    // Drop one of the new permissions from the catalog and re-seed.
    $userModel = User::factory()->create(['role_id' => 5]);
    Permission::where('resource', 'feed')->where('action', 'view')->delete();

    // Re-run RolePermissionSeeder — feed.view grant should warn but not throw.
    $this->seed(RolePermissionSeeder::class);

    // usuario still has incidents.create (existing grant untouched).
    expect(Gate::forUser($userModel)->allows('incidents.create'))->toBeTrue();
    // usuario does NOT have feed.view because the catalog row is missing.
    expect(Gate::forUser($userModel)->allows('feed.view'))->toBeFalse();
});
