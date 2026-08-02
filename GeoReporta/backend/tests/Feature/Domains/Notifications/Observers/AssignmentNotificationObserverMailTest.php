<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Enums\AssignmentRole;
use App\Domains\Incidents\Models\Assignment;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Mail\Services\MailSenderInterface;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Mockery\MockInterface;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    // Mismo seed mínimo que AssignmentNotificationObserverTest.
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
        'title' => 'Incidencia de prueba mail',
        'incident_category_id' => $category->id,
        'user_id' => $this->operator->id,
        'location_id' => $location->id,
        'organization_id' => $org->id,
        'status' => 'pending',
        'priority' => 'medium',
    ]);
});

// ──────────────────────────────────────────────────────────────────────
// El observer debe llamar a MailSenderInterface cuando se crea una asignación
// ──────────────────────────────────────────────────────────────────────
it('invokes mail sender when a responsable assignment is created', function (): void {
    $this->mock(MailSenderInterface::class, function (MockInterface $mock): void {
        $mock->shouldReceive('sendAssignedIncident')
            ->once()
            ->withArgs(function (User $user, Incident $incident, string $role): bool {
                expect($user->id)->toBe($this->operator->id);
                expect($incident->id)->toBe($this->incident->id);
                expect($role)->toBe('responsable');

                return true;
            });
    });

    Assignment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->operator->id,
        'assignment_role' => AssignmentRole::Responsable->value,
    ]);
});

it('invokes mail sender when an apoyo assignment is created', function (): void {
    $this->mock(MailSenderInterface::class, function (MockInterface $mock): void {
        $mock->shouldReceive('sendAssignedIncident')
            ->once()
            ->withArgs(function (User $user, Incident $incident, string $role): bool {
                expect($user->id)->toBe($this->operator->id);
                expect($incident->id)->toBe($this->incident->id);
                expect($role)->toBe('apoyo');

                return true;
            });
    });

    Assignment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->operator->id,
        'assignment_role' => AssignmentRole::Apoyo->value,
    ]);
});

// ──────────────────────────────────────────────────────────────────────
// Tolerancia S-7: si el mailer lanza, el observer no rompe la asignación
// ──────────────────────────────────────────────────────────────────────
it('does not propagate when the mailer throws', function (): void {
    $this->mock(MailSenderInterface::class, function (MockInterface $mock): void {
        $mock->shouldReceive('sendAssignedIncident')
            ->once()
            ->andThrow(new RuntimeException('smtp unreachable'));
    });

    // La creación de la Assignment fila no debe tirar aunque el mailer falle.
    $assignment = null;
    expect(function () use (&$assignment): void {
        $assignment = Assignment::create([
            'incident_id' => $this->incident->id,
            'user_id' => $this->operator->id,
            'assignment_role' => AssignmentRole::Responsable->value,
        ]);
    })->not->toThrow(RuntimeException::class);

    expect($assignment)->not->toBeNull();
    expect($assignment->exists)->toBeTrue();
});

// ──────────────────────────────────────────────────────────────────────
// Idempotencia S-3 (ya existente) también bloquea el envío de mail
// ──────────────────────────────────────────────────────────────────────
it('does not send mail when the operator already claimed the incident as responsable', function (): void {
    // El operador tenía el claim antes de que el admin formalice como responsable.
    $this->incident->update(['claimed_by' => $this->operator->id]);

    // El mailer NO debe ser invocado: la regla S-3 corta antes del bloque de mail.
    $this->mock(MailSenderInterface::class, function (MockInterface $mock): void {
        $mock->shouldReceive('sendAssignedIncident')->never();
    });

    Assignment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->operator->id,
        'assignment_role' => AssignmentRole::Responsable->value,
    ]);
});

// ──────────────────────────────────────────────────────────────────────
// El mailer sigue siendo invocado en reasignación a otro operador
// ──────────────────────────────────────────────────────────────────────
it('invokes mail sender for reassignment to a different operator', function (): void {
    $this->mock(MailSenderInterface::class, function (MockInterface $mock): void {
        // Solo nos interesa el 2do envío (al secondOperator).
        $mock->shouldReceive('sendAssignedIncident')
            ->withArgs(fn (User $u) => $u->id === $this->operator->id)
            ->once();
        $mock->shouldReceive('sendAssignedIncident')
            ->withArgs(fn (User $u) => $u->id === $this->secondOperator->id)
            ->once();
    });

    $original = Assignment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->operator->id,
        'assignment_role' => AssignmentRole::Responsable->value,
    ]);

    // Reasignación real: desasignar (soft delete) antes de crear la fila
    // del segundo — el partial unique index
    // `assignments_one_responsable_per_incident` (WHERE deleted_at IS
    // NULL) solo permite un responsable ACTIVO por incidencia.
    $original->delete();

    Assignment::create([
        'incident_id' => $this->incident->id,
        'user_id' => $this->secondOperator->id,
        'assignment_role' => AssignmentRole::Responsable->value,
    ]);
});
