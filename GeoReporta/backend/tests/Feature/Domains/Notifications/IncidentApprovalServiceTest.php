<?php

declare(strict_types=1);

use App\Domains\Comments\Models\Comment;
use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Incidents\Services\IncidentApprovalService;
use App\Domains\Locations\Models\Location;
use App\Domains\Notifications\Enums\NotificationType;
use App\Domains\Notifications\Models\Notification;
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
    $this->adminSistema = User::factory()->create(['role_id' => 1, 'organization_id' => null]);
    // Admin organizacion.
    $this->adminOrg = User::factory()->create(['role_id' => 2, 'organization_id' => $this->org->id]);
    // Operador.
    $this->operador = User::factory()->create(['role_id' => 3, 'organization_id' => $this->org->id]);
    // Usuario.
    $this->ciudadano = User::factory()->create(['role_id' => 5]);

    // Resolved incident with a pending-approval notification.
    $this->incident = Incident::create([
        'incident_category_id' => $this->category->id,
        'user_id' => $this->ciudadano->id,
        'location_id' => $this->location->id,
        'organization_id' => $this->org->id,
        'title' => 'Resolved incident',
        'status' => IncidentStatus::Resolved,
        'priority' => 'medium',
    ]);

    $this->notification = Notification::create([
        'user_id' => $this->adminSistema->id,
        'incident_id' => $this->incident->id,
        'type' => NotificationType::IncidentPendingApproval,
        'message' => 'Tu incidencia necesita aprobación.',
        'read' => false,
        'processed_at' => null,
    ]);

    $this->service = new IncidentApprovalService(new NotificationService);
});

// ──────────────────────────────────────────────────────────────
// approve() happy path
// ──────────────────────────────────────────────────────────────

it('approve sets incident status to Closed and fills approved_by and approved_at', function (): void {
    $result = $this->service->approve($this->notification, $this->adminSistema);

    expect($result->status)->toBe(IncidentStatus::Closed);
    expect($result->approved_by)->toBe($this->adminSistema->id);
    expect($result->approved_at)->not->toBeNull();
});

it('approve marks notification as processed', function (): void {
    $this->service->approve($this->notification, $this->adminSistema);

    $this->notification->refresh();
    expect($this->notification->processed_at)->not->toBeNull();
    expect($this->notification->read)->toBeTrue();
});

// ──────────────────────────────────────────────────────────────
// approve() limpia rejected_*
// ──────────────────────────────────────────────────────────────

it('approve clears rejected_by, rejected_at and rejection_reason', function (): void {
    // Pre-condition: incident was previously rejected.
    $this->incident->update([
        'rejected_by' => $this->adminOrg->id,
        'rejected_at' => now(),
        'rejection_reason' => 'Motivo previo',
    ]);

    $result = $this->service->approve($this->notification, $this->adminSistema);

    expect($result->rejected_by)->toBeNull();
    expect($result->rejected_at)->toBeNull();
    expect($result->rejection_reason)->toBeNull();
});

// ──────────────────────────────────────────────────────────────
// approve() 409 — already processed
// ──────────────────────────────────────────────────────────────

it('approve throws 409 when notification is already processed', function (): void {
    $this->notification->update(['processed_at' => now()]);

    expect(fn () => $this->service->approve($this->notification, $this->adminSistema))
        ->toThrow(RuntimeException::class, 'No decidible');
});

// ──────────────────────────────────────────────────────────────
// approve() 409 — status not resolved
// ──────────────────────────────────────────────────────────────

it('approve throws 409 when incident status is not Resolved', function (): void {
    $this->incident->update(['status' => IncidentStatus::InProgress]);

    expect(fn () => $this->service->approve($this->notification, $this->adminSistema))
        ->toThrow(RuntimeException::class, 'No decidible');
});

it('approve throws 409 when incident is already approved', function (): void {
    // Both approved_by and approved_at must be set together to satisfy
    // the chk_incidents_approved_pair constraint; setting only one would
    // violate the row invariant the constraint enforces.
    $this->incident->update([
        'approved_by' => $this->adminOrg->id,
        'approved_at' => now(),
    ]);

    expect(fn () => $this->service->approve($this->notification, $this->adminSistema))
        ->toThrow(RuntimeException::class, 'No decidible');
});

it('approve clears rejected fields when incident was previously rejected', function (): void {
    // Pre-condition: incident was previously rejected.
    $this->incident->update([
        'rejected_by' => $this->adminOrg->id,
        'rejected_at' => now(),
        'rejection_reason' => 'Motivo previo',
    ]);

    $result = $this->service->approve($this->notification, $this->adminSistema);

    // approve debe limpiar rejection previa y cerrar.
    expect($result->status)->toBe(IncidentStatus::Closed);
    expect($result->rejected_by)->toBeNull();
    expect($result->rejected_at)->toBeNull();
    expect($result->rejection_reason)->toBeNull();
});

// ──────────────────────────────────────────────────────────────
// reject() happy path
// ──────────────────────────────────────────────────────────────

it('reject persists a Comment with user_id = actor->id', function (): void {
    $this->service->reject($this->notification, $this->adminSistema, 'Motivo largo de rechazo valido.');

    $comment = Comment::query()
        ->where('incident_id', $this->incident->id)
        ->where('user_id', $this->adminSistema->id)
        ->first();

    expect($comment)->not->toBeNull();
    expect($comment->message)->toBe('Motivo largo de rechazo valido.');
});

it('reject sets rejected_by, rejected_at and rejection_reason', function (): void {
    $result = $this->service->reject($this->notification, $this->adminSistema, 'Motivo de rechazo de exactamente 11 caracteres.');

    expect($result->rejected_by)->toBe($this->adminSistema->id);
    expect($result->rejected_at)->not->toBeNull();
    expect($result->rejection_reason)->toBe('Motivo de rechazo de exactamente 11 caracteres.');
});

// ──────────────────────────────────────────────────────────────
// reject() con claimant activo → in_progress, claimed_by retenido
// ──────────────────────────────────────────────────────────────

it('reject with active claimant sets status to InProgress and retains claimed_by', function (): void {
    // The incident starts in Resolved (from beforeEach).
    // Set claimed_by so reject knows there's an active operator.
    $this->incident->update([
        'claimed_by' => $this->operador->id,
        'claimed_at' => now(),
    ]);
    // Status stays Resolved; reject() transitions to InProgress.

    $result = $this->service->reject(
        $this->notification,
        $this->adminSistema,
        'Resolucion rechazada. Volvera a en proceso.',
    );

    expect($result->status)->toBe(IncidentStatus::InProgress);
    expect($result->claimed_by)->toBe($this->operador->id);
});

// ──────────────────────────────────────────────────────────────
// reject() sin claimant → pending, claimed_by = null
// ──────────────────────────────────────────────────────────────

it('reject without claimant sets status to Pending and clears claimed_by', function (): void {
    $result = $this->service->reject(
        $this->notification,
        $this->adminSistema,
        'Sin claim, vuelve a pending completamente.',
    );

    expect($result->status)->toBe(IncidentStatus::Pending);
    expect($result->claimed_by)->toBeNull();
    expect($result->claimed_at)->toBeNull();
});

// ──────────────────────────────────────────────────────────────
// reject() con claimant inactivo → pending, claimed_by = null
// ──────────────────────────────────────────────────────────────

it('reject with inactive claimant sets status to Pending and clears claimed_by', function (): void {
    // Create a soft-deleted operator.
    $inactiveOp = User::factory()->create([
        'role_id' => 3,
        'organization_id' => $this->org->id,
        'deleted_at' => now(),
    ]);
    // Incident stays Resolved; claimed_by points to inactive operator.
    $this->incident->update([
        'claimed_by' => $inactiveOp->id,
        'claimed_at' => now(),
    ]);

    $result = $this->service->reject(
        $this->notification,
        $this->adminSistema,
        'Operador inactivo, se pierde el claim.',
    );

    expect($result->status)->toBe(IncidentStatus::Pending);
    expect($result->claimed_by)->toBeNull();
});

// ──────────────────────────────────────────────────────────────
// reject() reason length validation
// ──────────────────────────────────────────────────────────────

it('reject throws 422 when reason is shorter than 10 characters', function (): void {
    expect(fn () => $this->service->reject($this->notification, $this->adminSistema, 'corto'))
        ->toThrow(RuntimeException::class, '10 y 500');
});

// ──────────────────────────────────────────────────────────────
// reject() limpia approved_*
// ──────────────────────────────────────────────────────────────

it('reject clears approved_by and approved_at', function (): void {
    // Pre-condition: incident was previously approved.
    $this->incident->update([
        'approved_by' => $this->adminOrg->id,
        'approved_at' => now(),
    ]);

    $result = $this->service->reject(
        $this->notification,
        $this->adminSistema,
        'Limpia la aprobacion previa.',
    );

    expect($result->approved_by)->toBeNull();
    expect($result->approved_at)->toBeNull();
});

// ──────────────────────────────────────────────────────────────
// pendingApprovalRecipients()
// ──────────────────────────────────────────────────────────────

it('pendingApprovalRecipients includes admin_sistema global', function (): void {
    $recipients = $this->service->pendingApprovalRecipients($this->incident);
    $recipientIds = array_map(fn ($u) => $u->id, $recipients);

    expect($recipientIds)->toContain($this->adminSistema->id);
});

it('pendingApprovalRecipients includes admin_organizacion of the org', function (): void {
    $recipients = $this->service->pendingApprovalRecipients($this->incident);
    $recipientIds = array_map(fn ($u) => $u->id, $recipients);

    expect($recipientIds)->toContain($this->adminOrg->id);
});

it('pendingApprovalRecipients excludes operador', function (): void {
    $recipients = $this->service->pendingApprovalRecipients($this->incident);

    expect($recipients)->not->toContain($this->operador);
});

it('pendingApprovalRecipients excludes usuario', function (): void {
    $recipients = $this->service->pendingApprovalRecipients($this->incident);

    expect($recipients)->not->toContain($this->ciudadano);
});

// ──────────────────────────────────────────────────────────────
// Transaction rollback on error
// ──────────────────────────────────────────────────────────────

it('approve rolls back all changes when an exception occurs mid-transaction', function (): void {
    // Create a notification that points to an incident that will cause
    // a foreign-key violation (non-existent claimant), but only after
    // the lock is acquired. We simulate this by using a mock that throws.
    $mockNotifications = $this->createMock(NotificationService::class);
    $mockNotifications->method('notify')->willThrowException(new RuntimeException('notification failure'));

    $service = new IncidentApprovalService($mockNotifications);

    // The notification side-effects (notifyCitizenClosed) throw after the incident
    // is already updated. This should cause a full rollback.
    expect(fn () => $service->approve($this->notification, $this->adminSistema))
        ->toThrow(RuntimeException::class, 'notification failure');

    // Verify nothing was persisted.
    $this->incident->refresh();
    expect($this->incident->status)->toBe(IncidentStatus::Resolved);
    expect($this->incident->approved_by)->toBeNull();
    $this->notification->refresh();
    expect($this->notification->processed_at)->toBeNull();
});
