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
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;

uses(RefreshDatabase::class);

// R-19: GET /api/incidents/{id}/status-history requires incident view
// permission. Kept in a separate file from TriggerStatusHistoryTest
// because that suite is gated to PostgreSQL only (the trg_log_incident_status
// trigger), while authorization must also run on SQLite.

beforeEach(function (): void {
    $this->seed(PermissionSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(RolePermissionSeeder::class);

    // Register dynamic gates — same seam as RolePermissionSyncTest.php:21-24.
    foreach (Permission::all() as $permission) {
        $slug = "{$permission->resource}.{$permission->action}";
        Gate::define($slug, fn (User $user) => $user->hasPermission($slug));
    }

    $this->withoutMiddleware(JwtAuthenticate::class);

    $this->user = User::factory()->create();

    $category = IncidentCategory::create(['name' => 'Test Category']);
    $location = Location::create(['name' => 'Test Location', 'level' => 'city']);
    $org = Organization::create([
        'name' => 'Test Org',
        'location_id' => $location->id,
    ]);

    $this->incident = Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $org->id,
        'user_id' => $this->user->id,
        'location_id' => $location->id,
        'title' => 'Test Incident',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);
});

it('R-19 denies access to status history for user without incident view permission', function (): void {
    // Fresh non-admin role bypasses Gate::before and has no incidents.view.
    $noPermsRole = Role::firstOrCreate(['name' => 'rol_test_sin_permisos']);
    $stranger = User::factory()->create(['role_id' => $noPermsRole->id]);
    $this->actingAs($stranger);

    $response = $this->getJson("/api/incidents/{$this->incident->id}/status-history");

    $response->assertForbidden();
});

it('R-19 allows status history access for user who can view the incident', function (): void {
    // admin_sistema (role 1) bypasses gates via Gate::before in
    // AppServiceProvider; IncidentPolicy::view short-circuits to true for
    // system admins (IncidentPolicy.php:26-28).
    $admin = User::factory()->create(['role_id' => 1]);
    $this->actingAs($admin);

    $response = $this->getJson("/api/incidents/{$this->incident->id}/status-history");

    $response->assertOk();
    $response->assertJsonStructure(['data']);
});

it('R-19 denies status history to the citizen who reported the incident themselves', function (): void {
    // Documents a known, pre-existing gap (not introduced by R-19, and not
    // fixed here — flagged in docs/Pendientes/10-enforcement-permisos-frontend.md
    // for a follow-up decision): USUARIO_PERMISSIONS (RolePermissionSeeder)
    // grants role 5 only incidents.create, never incidents.view, so
    // IncidentPolicy::view denies even the incident's own reporter. No
    // citizen-facing page currently calls this endpoint, so today this is
    // inert — but locking in the behavior here means a future change that
    // starts calling /status-history from a citizen-facing page will fail
    // this test instead of silently 403ing in production.
    $citizenRole = Role::where('name', 'usuario')->firstOrFail();
    $reporter = User::factory()->create(['role_id' => $citizenRole->id]);
    $this->incident->update(['user_id' => $reporter->id]);
    $this->actingAs($reporter);

    $response = $this->getJson("/api/incidents/{$this->incident->id}/status-history");

    $response->assertForbidden();
});
