<?php

declare(strict_types=1);

use App\Domains\Incidents\Http\Policies\AssignmentPolicy;
use App\Domains\Incidents\Models\Assignment;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Permissions\Models\Permission;
use App\Domains\Roles\Enums\UserRole;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

/**
 * Unit-style tests for AssignmentPolicy.
 *
 * The policy sits on top of PermissionPolicy and inherits the
 * `parent::create|view|delete` checks (`assignments.{create|view|delete}`)
 * — these tests pin the contract at three layers:
 *
 *   1. create(): a user with `assignments.create` may create
 *   2. delete(): a user with `assignments.delete` may delete
 *   3. viewAny(): a user with `incidents.view` may list (delegated —
 *       tasks.md ships an explicit override on this; tests preserve the
 *       override so any regression back to the parent default fails).
 *
 * The org-scope guard for AdminOrganizacion is enforced in the
 * controller via `authorizeIncidentOrgScope()` (mirroring
 * CommentController) and is exercised in AssignmentControllerTest —
 * not here, because the policy has no model instance at create-time.
 */
beforeEach(function (): void {
    // PermissionSeeder lands only the three new permissions so this file
    // is hermetic — no dependency on the full seed catalogue.
    Permission::create(['resource' => 'assignments', 'action' => 'view', 'name' => 'Ver Asignaciones', 'description' => 'Listar asignaciones']);
    Permission::create(['resource' => 'assignments', 'action' => 'create', 'name' => 'Crear Asignaciones', 'description' => 'Asignar operadores']);
    Permission::create(['resource' => 'assignments', 'action' => 'delete', 'name' => 'Eliminar Asignaciones', 'description' => 'Quitar asignaciones']);
    Permission::create(['resource' => 'incidents', 'action' => 'view', 'name' => 'Ver Incidencias', 'description' => 'Ver incidencias']);

    // Direct DB::insert for roles because Role's $fillable = ['name']
    // excludes `id`, so Role::query()->updateOrCreate(['id' => N, ...])
    // silently drops the explicit id and lets the auto-increment assign
    // the next free slot — wrong for FK targets in our tests. The
    // existing test suite uses this same approach (see
    // tests/Feature/Domains/Incidents/IncidentAssignmentsTest.php:17).
    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => UserRole::AdminSistema->value],
        ['id' => 3, 'name' => UserRole::AdminOrganizacion->value],
        ['id' => 4, 'name' => UserRole::OperadorOrganizacion->value],
        ['id' => 5, 'name' => UserRole::Usuario->value],
    ]);

    foreach (Permission::all() as $permission) {
        $slug = "{$permission->resource}.{$permission->action}";
        Gate::define($slug, fn (User $user) => $user->hasPermission($slug));
    }
});

it('grants viewAny to a user with incidents.view permission', function (): void {
    $admin = User::factory()->create([
        'role_id' => 4, // operador_organizacion — has incidents.view per RolePermissionSeeder
    ]);

    // Grant incidents.view via role-permission so the policy can answer.
    $admin->role?->permissions()->syncWithoutDetaching([
        Permission::where('resource', 'incidents')->where('action', 'view')->first()->permission_id,
    ]);

    $policy = new AssignmentPolicy;

    expect($policy->viewAny($admin))->toBeTrue();
});

it('denies viewAny when the user lacks incidents.view permission', function (): void {
    $stranger = User::factory()->create([
        'role_id' => 5, // usuario — no incidents.view
    ]);

    $policy = new AssignmentPolicy;

    expect($policy->viewAny($stranger))->toBeFalse();
});

it('grants create to a user with assignments.create permission', function (): void {
    $adminOrg = User::factory()->create([
        'role_id' => 3, // admin_organizacion — receives assignments.create per task 2.5
    ]);

    $adminOrg->role?->permissions()->syncWithoutDetaching([
        Permission::where('resource', 'assignments')->where('action', 'create')->first()->permission_id,
    ]);

    $policy = new AssignmentPolicy;

    expect($policy->create($adminOrg))->toBeTrue();
});

it('denies create when the user lacks assignments.create permission', function (): void {
    $operator = User::factory()->create([
        'role_id' => 4, // operador_organizacion — no assignments.create
    ]);

    $policy = new AssignmentPolicy;

    expect($policy->create($operator))->toBeFalse();
});

it('grants delete to a user with assignments.delete permission', function (): void {
    $adminOrg = User::factory()->create([
        'role_id' => 3, // admin_organizacion — receives assignments.delete per task 2.5
    ]);

    $adminOrg->role?->permissions()->syncWithoutDetaching([
        Permission::where('resource', 'assignments')->where('action', 'delete')->first()->permission_id,
    ]);

    $policy = new AssignmentPolicy;

    expect($policy->delete($adminOrg, new Incident))->toBeTrue();
});

it('denies delete when the user lacks assignments.delete permission', function (): void {
    $operator = User::factory()->create([
        'role_id' => 4, // operador_organizacion — no assignments.delete
    ]);

    $policy = new AssignmentPolicy;

    expect($policy->delete($operator, new Incident))->toBeFalse();
});

it('grants view to a user with assignments.view permission', function (): void {
    $user = User::factory()->create(['role_id' => 5]);

    $user->role?->permissions()->syncWithoutDetaching([
        Permission::where('resource', 'assignments')->where('action', 'view')->first()->permission_id,
    ]);

    $policy = new AssignmentPolicy;

    expect($policy->view($user, new Assignment))->toBeTrue();
});

it('bypasses authorization for system admin (admin_sistema) via Gate::before', function (): void {
    // Gate::before in AppServiceProvider short-circuits every check for
    // isAdmin() (admin_sistema + admin_legacy). Verify the system admin
    // does NOT need an explicit assignments.create grant — matches the
    // other policies in this codebase (UserPolicy, OrganizationPolicy).
    $systemAdmin = User::factory()->create([
        'role_id' => Role::where('name', 'admin_sistema')->first()->id, // admin_sistema — no DB-level assignments.create row needed
    ]);

    // Even with NO permissions attached, the gate short-circuits.
    expect(Gate::forUser($systemAdmin)->allows('assignments.create'))->toBeTrue()
        ->and(Gate::forUser($systemAdmin)->allows('assignments.delete'))->toBeTrue()
        ->and(Gate::forUser($systemAdmin)->allows('assignments.view'))->toBeTrue();
});
