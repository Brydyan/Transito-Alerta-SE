<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Notifications\Enums\NotificationType;
use App\Domains\Notifications\Http\Policies\NotificationPolicy;
use App\Domains\Notifications\Models\Notification;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Permissions\Models\Permission;
use App\Domains\Roles\Enums\UserRole;
use App\Domains\Users\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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

    $this->location = Location::create(['name' => 'Test City', 'level' => 'city']);
    $this->org = Organization::create(['name' => 'Test Org', 'location_id' => $this->location->id, 'max_active_claims' => 5]);
    $this->org2 = Organization::create(['name' => 'Other Org', 'location_id' => $this->location->id, 'max_active_claims' => 5]);
    $this->category = IncidentCategory::create(['name' => 'Test Category', 'organization_id' => $this->org->id]);

    $this->policy = new NotificationPolicy;

    // Look up role IDs dynamically (RoleSeeder pins names but id may not be stable).
    $roleAdminSistema = (int) DB::table('roles')->where('name', UserRole::AdminSistema->value)->value('id');
    $roleAdminOrganizacion = (int) DB::table('roles')->where('name', UserRole::AdminOrganizacion->value)->value('id');
    $roleOperadorOrganizacion = (int) DB::table('roles')->where('name', UserRole::OperadorOrganizacion->value)->value('id');
    $roleOperadorSistema = (int) DB::table('roles')->where('name', UserRole::OperadorSistema->value)->value('id');
    $roleUsuario = (int) DB::table('roles')->where('name', UserRole::Usuario->value)->value('id');

    // Users.
    $this->adminSistemaGlobal = User::factory()->create(['role_id' => $roleAdminSistema, 'organization_id' => null]);
    $this->adminSistemaOrg = User::factory()->create(['role_id' => $roleAdminSistema, 'organization_id' => $this->org->id]);
    $this->adminOrg = User::factory()->create(['role_id' => $roleAdminOrganizacion, 'organization_id' => $this->org->id]);
    $this->adminOrg2 = User::factory()->create(['role_id' => $roleAdminOrganizacion, 'organization_id' => $this->org2->id]);
    $this->operadorOrg = User::factory()->create(['role_id' => $roleOperadorOrganizacion, 'organization_id' => $this->org->id]);
    $this->operadorSistema = User::factory()->create(['role_id' => $roleOperadorSistema, 'organization_id' => null]);
    $this->ciudadano = User::factory()->create(['role_id' => $roleUsuario, 'organization_id' => null]);

    // Incident.
    $this->ciudadanoOwner = User::factory()->create(['role_id' => $roleUsuario]);
    $this->incident = Incident::create([
        'incident_category_id' => $this->category->id,
        'user_id' => $this->ciudadanoOwner->id,
        'location_id' => $this->location->id,
        'organization_id' => $this->org->id,
        'title' => 'Test Incident',
        'status' => IncidentStatus::Resolved,
        'priority' => 'medium',
    ]);

    // Notification of type IncidentPendingApproval.
    $this->notification = Notification::create([
        'user_id' => $this->adminSistemaGlobal->id,
        'incident_id' => $this->incident->id,
        'type' => NotificationType::IncidentPendingApproval,
        'message' => 'Pending',
        'data' => [],
        'read' => false,
    ]);

    // Notification of another type (legacy, owner-only).
    $this->legacyNotification = Notification::create([
        'user_id' => $this->ciudadanoOwner->id,
        'incident_id' => $this->incident->id,
        'type' => NotificationType::Legacy,
        'message' => 'Legacy notification',
        'data' => [],
        'read' => false,
    ]);
});

// ──────────────────────────────────────────────────────────────
// approve / reject matrix for IncidentPendingApproval
// ──────────────────────────────────────────────────────────────

it('admin_sistema global can approve incident_pending_approval notifications', function (): void {
    expect($this->policy->approve($this->adminSistemaGlobal, $this->notification))->toBeTrue()
        ->and($this->policy->reject($this->adminSistemaGlobal, $this->notification))->toBeTrue();
});

it('admin_sistema org-scoped can approve notifications of their org', function (): void {
    expect($this->policy->approve($this->adminSistemaOrg, $this->notification))->toBeTrue()
        ->and($this->policy->reject($this->adminSistemaOrg, $this->notification))->toBeTrue();
});

it('admin_sistema org-scoped cannot approve notifications of other org', function (): void {
    // Create notification for an incident in org2.
    $incidentOrg2 = Incident::create([
        'incident_category_id' => $this->category->id,
        'user_id' => $this->ciudadanoOwner->id,
        'location_id' => $this->location->id,
        'organization_id' => $this->org2->id,
        'title' => 'Other Org Incident',
        'status' => IncidentStatus::Resolved,
        'priority' => 'medium',
    ]);
    $notificationOrg2 = Notification::create([
        'user_id' => $this->adminOrg2->id,
        'incident_id' => $incidentOrg2->id,
        'type' => NotificationType::IncidentPendingApproval,
        'message' => 'Pending org2',
        'data' => [],
        'read' => false,
    ]);

    expect($this->policy->approve($this->adminSistemaOrg, $notificationOrg2))->toBeFalse()
        ->and($this->policy->reject($this->adminSistemaOrg, $notificationOrg2))->toBeFalse();
});

it('admin_organizacion can approve notifications of their org', function (): void {
    $notificationToAdminOrg = Notification::create([
        'user_id' => $this->adminOrg->id,
        'incident_id' => $this->incident->id,
        'type' => NotificationType::IncidentPendingApproval,
        'message' => 'Pending',
        'data' => [],
        'read' => false,
    ]);

    expect($this->policy->approve($this->adminOrg, $notificationToAdminOrg))->toBeTrue()
        ->and($this->policy->reject($this->adminOrg, $notificationToAdminOrg))->toBeTrue();
});

it('admin_organizacion cannot approve notifications of other org', function (): void {
    $incidentOrg2 = Incident::create([
        'incident_category_id' => $this->category->id,
        'user_id' => $this->ciudadanoOwner->id,
        'location_id' => $this->location->id,
        'organization_id' => $this->org2->id,
        'title' => 'Other Org Incident',
        'status' => IncidentStatus::Resolved,
        'priority' => 'medium',
    ]);
    $notificationOrg2 = Notification::create([
        'user_id' => $this->adminOrg2->id,
        'incident_id' => $incidentOrg2->id,
        'type' => NotificationType::IncidentPendingApproval,
        'message' => 'Pending org2',
        'data' => [],
        'read' => false,
    ]);

    expect($this->policy->approve($this->adminOrg, $notificationOrg2))->toBeFalse()
        ->and($this->policy->reject($this->adminOrg, $notificationOrg2))->toBeFalse();
});

it('operador_organizacion cannot approve or reject', function (): void {
    expect($this->policy->approve($this->operadorOrg, $this->notification))->toBeFalse()
        ->and($this->policy->reject($this->operadorOrg, $this->notification))->toBeFalse();
});

it('operador_sistema cannot approve or reject', function (): void {
    expect($this->policy->approve($this->operadorSistema, $this->notification))->toBeFalse()
        ->and($this->policy->reject($this->operadorSistema, $this->notification))->toBeFalse();
});

it('usuario (citizen) cannot approve or reject', function (): void {
    expect($this->policy->approve($this->ciudadano, $this->notification))->toBeFalse()
        ->and($this->policy->reject($this->ciudadano, $this->notification))->toBeFalse();
});

// ──────────────────────────────────────────────────────────────
// Legacy / non-approval types: owner-only
// ──────────────────────────────────────────────────────────────

it('legacy notification: owner without notifications.update permission is denied', function (): void {
    // Owner (ciudadanoOwner) — the notification belongs to them, but
    // usuario role does not have notifications.update permission.
    expect($this->policy->approve($this->ciudadanoOwner, $this->legacyNotification))->toBeFalse()
        ->and($this->policy->reject($this->ciudadanoOwner, $this->legacyNotification))->toBeFalse();

    // Admin sistema global — not the owner and has notifications.update — denied (not owner).
    expect($this->policy->approve($this->adminSistemaGlobal, $this->legacyNotification))->toBeFalse()
        ->and($this->policy->reject($this->adminSistemaGlobal, $this->legacyNotification))->toBeFalse();
});

// ──────────────────────────────────────────────────────────────
// User without notifications.update permission is denied
// ──────────────────────────────────────────────────────────────

it('user without notifications.update permission is denied approve/reject', function (): void {
    // operador_sistema may have a role but not the specific permission.
    // Gate uses hasPermission, which checks the role's permissions.
    expect($this->policy->approve($this->operadorSistema, $this->notification))->toBeFalse()
        ->and($this->policy->reject($this->operadorSistema, $this->notification))->toBeFalse();
});
