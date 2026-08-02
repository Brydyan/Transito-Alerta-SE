<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Incidents\Services\IncidentApprovalService;
use App\Domains\Locations\Models\Location;
use App\Domains\Notifications\Enums\NotificationType;
use App\Domains\Notifications\Models\Notification;
use App\Domains\Notifications\Observers\IncidentNotificationObserver;
use App\Domains\Notifications\Services\NotificationService;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Enums\UserRole;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    // Seed roles.
    DB::table('roles')->insert([
        ['id' => 1, 'name' => UserRole::AdminSistema->value],
        ['id' => 2, 'name' => UserRole::AdminOrganizacion->value],
        ['id' => 3, 'name' => UserRole::OperadorOrganizacion->value],
        ['id' => 4, 'name' => UserRole::OperadorSistema->value],
        ['id' => 5, 'name' => UserRole::Usuario->value],
    ]);

    $this->location = Location::create(['name' => 'Test City', 'level' => 'city']);
    $this->org = Organization::create([
        'name' => 'Test Org',
        'location_id' => $this->location->id,
        'max_active_claims' => 5,
    ]);
    $this->category = IncidentCategory::create([
        'name' => 'Test Category',
        'organization_id' => $this->org->id,
    ]);

    // Admin sistema (global).
    $this->adminSistemaGlobal = User::factory()->create(['role_id' => 1, 'organization_id' => null]);
    // Admin sistema (de org).
    $this->adminSistemaOrg = User::factory()->create(['role_id' => 1, 'organization_id' => $this->org->id]);
    // Admin organizacion.
    $this->adminOrg = User::factory()->create(['role_id' => 2, 'organization_id' => $this->org->id]);
    // Operador organizacion.
    $this->operadorOrg = User::factory()->create(['role_id' => 3, 'organization_id' => $this->org->id]);
    // Operador sistema.
    $this->operadorSistema = User::factory()->create(['role_id' => 4, 'organization_id' => null]);
    // Usuario (ciudadano).
    $this->ciudadano = User::factory()->create(['role_id' => 5, 'organization_id' => null]);

    $this->observer = new IncidentNotificationObserver(
        new NotificationService,
        new IncidentApprovalService(new NotificationService),
    );
});

// ──────────────────────────────────────────────────────────────
// handleResolvedPendingApproval
// ──────────────────────────────────────────────────────────────

it('creates one pending approval notification per in-scope admin when status changes to resolved', function (): void {
    // Incident starts in Pending status.
    $incident = Incident::create([
        'incident_category_id' => $this->category->id,
        'user_id' => $this->ciudadano->id,
        'location_id' => $this->location->id,
        'organization_id' => $this->org->id,
        'title' => 'Test Incident',
        'status' => IncidentStatus::Pending,
        'priority' => 'medium',
    ]);

    // Transition to Resolved → should notify admins.
    $incident->status = IncidentStatus::Resolved;
    $incident->syncChanges(); // Sync so wasChanged works correctly on fresh model

    // Verify state before calling handler
    expect($incident->wasChanged('status'))->toBeTrue();
    expect($incident->id)->toBeGreaterThan(0);

    $this->observer->handleResolvedPendingApproval($incident);

    // Should create 3 notifications: adminSistemaGlobal, adminSistemaOrg, adminOrg.
    $notifications = Notification::where('incident_id', $incident->id)
        ->where('type', NotificationType::IncidentPendingApproval)
        ->get();

    expect($notifications)->toHaveCount(3);
    expect($notifications->pluck('user_id'))->toContain($this->adminSistemaGlobal->id);
    expect($notifications->pluck('user_id'))->toContain($this->adminSistemaOrg->id);
    expect($notifications->pluck('user_id'))->toContain($this->adminOrg->id);
});

it('does not create duplicate notifications when status stays resolved (resolved → resolved)', function (): void {
    // Incident already in Resolved.
    $incident = Incident::create([
        'incident_category_id' => $this->category->id,
        'user_id' => $this->ciudadano->id,
        'location_id' => $this->location->id,
        'organization_id' => $this->org->id,
        'title' => 'Test Incident',
        'status' => IncidentStatus::Resolved,
        'priority' => 'medium',
    ]);

    // Call handler again (simulating re-save without actual status change).
    $this->observer->handleResolvedPendingApproval($incident);

    // No new notifications should be created.
    $notifications = Notification::where('incident_id', $incident->id)
        ->where('type', NotificationType::IncidentPendingApproval)
        ->get();

    expect($notifications)->toHaveCount(0);
});

it('does not notify citizen when status changes to resolved', function (): void {
    // Incident starts in Pending.
    $incident = Incident::create([
        'incident_category_id' => $this->category->id,
        'user_id' => $this->ciudadano->id,
        'location_id' => $this->location->id,
        'organization_id' => $this->org->id,
        'title' => 'Test Incident',
        'status' => IncidentStatus::Pending,
        'priority' => 'medium',
    ]);

    // Transition to Resolved.
    $incident->status = IncidentStatus::Resolved;
    $this->observer->handleResolvedPendingApproval($incident);

    // No notification to citizen with type IncidentPendingApproval.
    $citizenNotifications = Notification::where('user_id', $this->ciudadano->id)
        ->where('incident_id', $incident->id)
        ->where('type', NotificationType::IncidentPendingApproval)
        ->exists();

    expect($citizenNotifications)->toBeFalse();
});

it('excludes operador and usuario from pending approval recipients', function (): void {
    $incident = Incident::create([
        'incident_category_id' => $this->category->id,
        'user_id' => $this->ciudadano->id,
        'location_id' => $this->location->id,
        'organization_id' => $this->org->id,
        'title' => 'Test Incident',
        'status' => IncidentStatus::Pending,
        'priority' => 'medium',
    ]);

    // Transition to Resolved.
    $incident->status = IncidentStatus::Resolved;
    $this->observer->handleResolvedPendingApproval($incident);

    // No notifications for operador or usuario.
    $operadorNotifications = Notification::where('user_id', $this->operadorOrg->id)
        ->where('incident_id', $incident->id)
        ->where('type', NotificationType::IncidentPendingApproval)
        ->exists();

    $usuarioNotifications = Notification::where('user_id', $this->ciudadano->id)
        ->where('incident_id', $incident->id)
        ->where('type', NotificationType::IncidentPendingApproval)
        ->exists();

    expect($operadorNotifications)->toBeFalse();
    expect($usuarioNotifications)->toBeFalse();
});

// ──────────────────────────────────────────────────────────────
// handleConfirmChange (citizen notification)
// ──────────────────────────────────────────────────────────────

it('does not notify citizen via handleConfirmChange when status changes to resolved', function (): void {
    $incident = Incident::create([
        'incident_category_id' => $this->category->id,
        'user_id' => $this->ciudadano->id,
        'location_id' => $this->location->id,
        'organization_id' => $this->org->id,
        'title' => 'Test Incident',
        'status' => IncidentStatus::Pending,
        'priority' => 'medium',
    ]);

    // Transition to Resolved.
    $incident->status = IncidentStatus::Resolved;
    $incident->syncChanges();
    $this->observer->handleConfirmChange($incident);

    // No StatusChange notification to citizen on resolved.
    $citizenNotifications = Notification::where('user_id', $this->ciudadano->id)
        ->where('incident_id', $incident->id)
        ->where('type', NotificationType::StatusChange)
        ->exists();

    expect($citizenNotifications)->toBeFalse();
});

it('notifies citizen when status changes to closed', function (): void {
    $incident = Incident::create([
        'incident_category_id' => $this->category->id,
        'user_id' => $this->ciudadano->id,
        'location_id' => $this->location->id,
        'organization_id' => $this->org->id,
        'title' => 'Test Incident',
        'status' => IncidentStatus::Resolved,
        'priority' => 'medium',
    ]);

    // Transition to Closed.
    $incident->status = IncidentStatus::Closed;
    $incident->syncChanges(); // Sync so wasChanged works correctly on fresh model

    $this->observer->handleConfirmChange($incident);

    $notification = Notification::where('user_id', $this->ciudadano->id)
        ->where('incident_id', $incident->id)
        ->where('type', NotificationType::StatusChange)
        ->first();

    expect($notification)->not->toBeNull();
    expect($notification->message)->toContain('cerrada');
});
