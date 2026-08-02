<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Enums\AssignmentRole;
use App\Domains\Incidents\Models\Assignment;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Notifications\Enums\NotificationType;
use App\Domains\Notifications\Models\Notification;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    // Seed mínimo: roles + estructura jerárquica (location → org → category)
    // + 2 operadores (uno principal, uno secundario para tests de
    // reasignación).
    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => 'admin_sistema'],
        ['id' => 2, 'name' => 'operador_organizacion'],
    ]);

    $this->operator = User::factory()->create(['role_id' => 2]);
    $this->secondOperator = User::factory()->create(['role_id' => 2]);

    $location = Location::create(['name' => 'HQ', 'level' => 'city']);
    $org = Organization::create(['name' => 'Test Org', 'location_id' => $location->id]);
    $category = IncidentCategory::create(['name' => 'General', 'organization_id' => $org->id]);

    $this->incident = Incident::create([
        'title' => 'Test Incident',
        'incident_category_id' => $category->id,
        'user_id' => $this->operator->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => 'pending',
        'priority' => 'medium',
    ]);
});

// Helper: cuenta notifications por tipo y operador en esta incidencia.
function assignmentTestNotifications(User $user, Incident $incident, string $type): int
{
    return Notification::query()
        ->where('user_id', $user->id)
        ->where('incident_id', $incident->id)
        ->where('type', $type)
        ->count();
}

// ──────────────────────────────────────────────────────────────────────
// S-1: Asignar responsable dispara notification
// ──────────────────────────────────────────────────────────────────────
it('creates a notification when a responsable assignment is created (S-1)', function (): void {
    Assignment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->operator->id,
        'assignment_role' => AssignmentRole::Responsable->value,
    ]);

    $notification = Notification::query()
        ->where('user_id', $this->operator->id)
        ->where('incident_id', $this->incident->id)
        ->where('type', NotificationType::Assigned->value)
        ->first();

    expect($notification)->not->toBeNull();
    expect($notification->message)->toContain('responsable');
    expect($notification->message)->toContain('Test Incident');
    expect($notification->read)->toBeFalse();
    expect($notification->data['assignment_role'])->toBe('responsable');
    expect($notification->data['incident_id'])->toBe($this->incident->id);
    expect($notification->data['incident_title'])->toBe('Test Incident');
});

// ──────────────────────────────────────────────────────────────────────
// S-2: Apoyo usa wording diferenciado
// ──────────────────────────────────────────────────────────────────────
it('uses apoyo wording when the assignment role is apoyo (S-2)', function (): void {
    Assignment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->operator->id,
        'assignment_role' => AssignmentRole::Apoyo->value,
    ]);

    $notification = Notification::query()
        ->where('user_id', $this->operator->id)
        ->where('incident_id', $this->incident->id)
        ->where('type', NotificationType::Assigned->value)
        ->first();

    expect($notification)->not->toBeNull();
    expect($notification->message)->toContain('apoyo');
    expect($notification->message)->not->toContain('responsable');
    expect($notification->data['assignment_role'])->toBe('apoyo');
});

// ──────────────────────────────────────────────────────────────────────
// S-3: Idempotencia con claim previo (mismo operador + role responsable)
// ──────────────────────────────────────────────────────────────────────
it('does not notify when the operator already claimed the same incident as responsable (S-3)', function (): void {
    // El operador se auto-asigna primero (claim).
    $this->incident->update(['claimed_by' => $this->operator->id]);

    expect(assignmentTestNotifications($this->operator, $this->incident, NotificationType::Assigned->value))
        ->toBe(0);

    // Después el admin lo formaliza como responsable via Assignment.
    Assignment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->operator->id,
        'assignment_role' => AssignmentRole::Responsable->value,
    ]);

    // El observer debe cortar por la regla S-3: 0 notifications tipo Assigned.
    expect(assignmentTestNotifications($this->operator, $this->incident, NotificationType::Assigned->value))
        ->toBe(0);
});

// ──────────────────────────────────────────────────────────────────────
// S-4: Reasignación a distinto operador — notifica solo al nuevo
// ──────────────────────────────────────────────────────────────────────
it('notifies only the new operator on reassignment (S-4)', function (): void {
    // Asignación original al primer operador
    $original = Assignment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->operator->id,
        'assignment_role' => AssignmentRole::Responsable->value,
    ]);

    // Reasignación real: el operador original se desasigna (soft delete)
    // antes de crear la fila del segundo — el partial unique index
    // `assignments_one_responsable_per_incident` (WHERE deleted_at IS
    // NULL) solo permite un responsable ACTIVO por incidencia, igual que
    // AssignmentService::assign()/unassign() en el flujo real.
    $original->delete();

    Assignment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->secondOperator->id,
        'assignment_role' => AssignmentRole::Responsable->value,
    ]);

    expect(assignmentTestNotifications($this->operator, $this->incident, NotificationType::Assigned->value))
        ->toBe(1);
    expect(assignmentTestNotifications($this->secondOperator, $this->incident, NotificationType::Assigned->value))
        ->toBe(1);
});

// ──────────────────────────────────────────────────────────────────────
// S-6: update sobre Assignment NO crea notification adicional
// (Garantía estructural: el observer solo implementa `created`)
// ──────────────────────────────────────────────────────────────────────
it('does not create an additional notification when an assignment is updated (S-6)', function (): void {
    $assignment = Assignment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->operator->id,
        'assignment_role' => AssignmentRole::Apoyo->value,
    ]);

    // Esperar > 60s no es viable en tests; la garantía S-6 es estructural
    // (el observer no implementa `updated`). Verificamos que tras un
    // update(), sigue habiendo exactamente 1 notification (la del create).
    $assignment->update(['assignment_role' => AssignmentRole::Responsable->value]);

    expect(assignmentTestNotifications($this->operator, $this->incident, NotificationType::Assigned->value))
        ->toBe(1);
});

// ──────────────────────────────────────────────────────────────────────
// S-7: Falla de Mercure no rompe la creación de la notification
// ──────────────────────────────────────────────────────────────────────
it('still creates the notification if Redis publish fails (S-7)', function (): void {
    Redis::shouldReceive('publish')
        ->andThrow(new RuntimeException('redis pub/sub unreachable'));

    Assignment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->operator->id,
        'assignment_role' => AssignmentRole::Responsable->value,
    ]);

    // La fila en `notifications` debe existir igual aunque Mercure falle.
    expect(assignmentTestNotifications($this->operator, $this->incident, NotificationType::Assigned->value))
        ->toBe(1);
});
