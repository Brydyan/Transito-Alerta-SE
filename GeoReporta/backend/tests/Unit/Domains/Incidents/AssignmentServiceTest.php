<?php

declare(strict_types=1);

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Models\Assignment;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Incidents\Services\AssignmentService;
use App\Domains\Locations\Models\Location;
use App\Domains\Notifications\Models\Notification;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Enums\UserRole;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

/**
 * AssignmentService encapsulates the business rules for the
 * `assignments` sub-resource:
 *   - role must be a known AssignmentRole case
 *   - a user cannot be assigned twice to the same incident (duplicate guard)
 *   - at most one `responsable` per incident (DB partial unique index is
 *     the Postgres-side backstop; SQLite in tests skips that index)
 *   - `unassign` is scoped to the parent incident — a bogus assignment
 *     id, or an id that belongs to another incident, raises the same
 *     not-found exception.
 *
 * These tests call the service directly so the DB writes are observable
 * via the assignments table without spinning up the HTTP layer; the
 * AssignmentControllerTest covers the HTTP contract.
 */
beforeEach(function (): void {
    // Direct DB::insert, not Role::query()->updateOrCreate(): Role's
    // $fillable = ['name'] excludes `id`, so the Eloquent mass-assignment
    // path silently drops the explicit id and lets auto-increment assign
    // whatever the sequence happens to be at (see RoleSeederTest / the
    // same convention documented in AssignmentPolicyTest.php).
    DB::table('roles')->insertOrIgnore([
        ['id' => 1, 'name' => UserRole::AdminSistema->value],
        ['id' => 5, 'name' => UserRole::Usuario->value],
    ]);

    $location = Location::create(['name' => 'Loc', 'level' => 'city']);
    $category = IncidentCategory::create(['name' => 'Cat']);
    $org = Organization::create(['name' => 'Org', 'location_id' => $location->id]);
    $reporter = User::factory()->create();

    $this->incident = Incident::create([
        'incident_category_id' => $category->id,
        'organization_id' => $org->id,
        'user_id' => $reporter->id,
        'location_id' => $location->id,
        'title' => 'Test Incident',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);

    $this->alice = User::factory()->create();
    $this->bob = User::factory()->create();
    $this->carol = User::factory()->create();

    $this->service = new AssignmentService;
});

it('persists a responsable assignment', function (): void {
    $this->service->assign($this->incident, $this->alice->id, 'responsable');

    $rows = DB::table('assignments')
        ->where('incident_id', $this->incident->id)
        ->get();

    expect($rows)->toHaveCount(1);
    expect($rows->first()->assignment_role)->toBe('responsable');
    expect((int) $rows->first()->user_id)->toBe($this->alice->id);
});

it('persists an apoyo assignment independently of other roles', function (): void {
    $this->service->assign($this->incident, $this->alice->id, 'apoyo');

    $rows = DB::table('assignments')
        ->where('incident_id', $this->incident->id)
        ->get();

    expect($rows)->toHaveCount(1);
    expect($rows->first()->assignment_role)->toBe('apoyo');
});

it('rejects an unknown role string before touching the table', function (): void {
    $this->service->assign($this->incident, $this->alice->id, 'supervisor');
})->throws(RuntimeException::class);

it('rejects double-assigning the same user to the same incident', function (): void {
    $this->service->assign($this->incident, $this->alice->id, 'apoyo');

    // Second assignment for the same (incident, user) pair, even with a
    // different role, must be rejected.
    expect(fn () => $this->service->assign($this->incident, $this->alice->id, 'responsable'))
        ->toThrow(RuntimeException::class);

    expect(DB::table('assignments')->where('incident_id', $this->incident->id)->count())->toBe(1);
});

it('rejects a second responsable on the same incident', function (): void {
    $this->service->assign($this->incident, $this->alice->id, 'responsable');

    // Second operator as responsable must be rejected. The check is
    // scoped to the incident (not the user) — a different user with the
    // same role collides with the existing responsable.
    expect(fn () => $this->service->assign($this->incident, $this->bob->id, 'responsable'))
        ->toThrow(RuntimeException::class);

    $rows = DB::table('assignments')
        ->where('incident_id', $this->incident->id)
        ->where('assignment_role', 'responsable')
        ->get();

    expect($rows)->toHaveCount(1);
    expect((int) $rows->first()->user_id)->toBe($this->alice->id);
});

it('allows unlimited apoyo roles on the same incident', function (): void {
    // Triangulation for the spec scenario "Unlimited apoyo assignments":
    // three distinct operators in apoyo must coexist. The responsable
    // slot is intentionally left empty here so the test isolates the
    // apoyo capacity from the max-1-responsable rule.
    $this->service->assign($this->incident, $this->alice->id, 'apoyo');
    $this->service->assign($this->incident, $this->bob->id, 'apoyo');
    $this->service->assign($this->incident, $this->carol->id, 'apoyo');

    $rows = DB::table('assignments')
        ->where('incident_id', $this->incident->id)
        ->where('assignment_role', 'apoyo')
        ->get();

    expect($rows)->toHaveCount(3);
});

it('allows a responsable and multiple apoyo to coexist', function (): void {
    $this->service->assign($this->incident, $this->alice->id, 'responsable');
    $this->service->assign($this->incident, $this->bob->id, 'apoyo');

    $rows = DB::table('assignments')->where('incident_id', $this->incident->id)->get();
    $roles = $rows->pluck('assignment_role')->all();

    expect($rows)->toHaveCount(2);
    expect($roles)->toContain('responsable');
    expect($roles)->toContain('apoyo');
});

it('soft-deletes an assignment via unassign', function (): void {
    $this->service->assign($this->incident, $this->alice->id, 'responsable');

    $assignmentId = (int) DB::table('assignments')
        ->where('incident_id', $this->incident->id)
        ->value('id');

    $this->service->unassign($this->incident, $assignmentId);

    // La fila debe persistir con deleted_at seteado (soft delete)
    $row = DB::table('assignments')
        ->where('incident_id', $this->incident->id)
        ->first();

    expect($row)->not->toBeNull();
    expect($row->deleted_at)->not->toBeNull();
});

it('excludes soft-deleted assignments from active queries', function (): void {
    $this->service->assign($this->incident, $this->alice->id, 'responsable');

    $assignmentId = (int) DB::table('assignments')
        ->where('incident_id', $this->incident->id)
        ->value('id');

    $this->service->unassign($this->incident, $assignmentId);

    // La query activa (con SoftDeletingScope) no debe traer la fila
    expect(Assignment::where('incident_id', $this->incident->id)->count())->toBe(0);
});

it('allows re-assigning a user who was previously unassigned', function (): void {
    // Assign → unassign → assign again — el partial unique index
    // (WHERE deleted_at IS NULL) no debe bloquear la re-asignación.
    // `composer test` corre exclusivamente contra Postgres
    // (backend-tests-postgres-migration, issue #197), así que este
    // escenario siempre se ejecuta de verdad.

    $this->service->assign($this->incident, $this->alice->id, 'responsable');

    $assignmentId = (int) DB::table('assignments')
        ->where('incident_id', $this->incident->id)
        ->value('id');

    $this->service->unassign($this->incident, $assignmentId);

    // Re-asignar al mismo usuario — debe funcionar
    $this->service->assign($this->incident, $this->alice->id, 'responsable');

    expect(DB::table('assignments')
        ->where('incident_id', $this->incident->id)
        ->whereNull('deleted_at')
        ->count()
    )->toBe(1);
});

it('fires the AssignmentNotificationObserver so the assignee gets a notification', function (): void {
    // Regression: the service used to call $incident->assignedUsers()
    // ->attach($userId, ['assignment_role' => $role]) which performs a
    // raw INSERT on the pivot table and therefore does NOT dispatch
    // Eloquent's `created` event on the Assignment model. The
    // observer listens for `created` and never fired, so the operator
    // was assigned in the DB but received no notification. The fix was
    // to use Assignment::create([...]) directly; this test pins the
    // contract end-to-end so a future "let's just go back to attach()"
    // refactor would fail the suite immediately.
    expect(Notification::count())->toBe(0);

    $this->service->assign($this->incident, $this->alice->id, 'responsable');

    $notification = Notification::where('user_id', $this->alice->id)
        ->where('incident_id', $this->incident->id)
        ->where('type', 'assigned')
        ->first();
    expect($notification)->not->toBeNull();
    expect($notification->message)->toContain('responsable');
});

it('fires the observer for apoyo too, not just responsable', function (): void {
    // Triangulation of the production bug: the user reported
    // notifications arriving for responsable but not for apoyo. Root
    // cause was the same attach() path issue; the fix is also covered
    // here. Pin both roles so a future regression cannot hide behind
    // the "responsable works" symptom.
    $this->service->assign($this->incident, $this->alice->id, 'apoyo');

    $notification = Notification::where('user_id', $this->alice->id)
        ->where('incident_id', $this->incident->id)
        ->where('type', 'assigned')
        ->first();
    expect($notification)->not->toBeNull();
    expect($notification->message)->toContain('apoyo');
    expect($notification->message)->not->toContain('responsable');
});

it('rejects unassign for an unknown assignment id', function (): void {
    expect(fn () => $this->service->unassign($this->incident, 999_999))
        ->toThrow(RuntimeException::class);
});

it('rejects unassign when the assignment belongs to another incident', function (): void {
    $otherIncident = Incident::create([
        'incident_category_id' => $this->incident->incident_category_id,
        'organization_id' => $this->incident->organization_id,
        'user_id' => $this->alice->id,
        'location_id' => $this->incident->location_id,
        'title' => 'Other Incident',
        'status' => Incident::STATUS_PENDING,
        'priority' => Incident::PRIORITY_MEDIUM,
    ]);

    $this->service->assign($otherIncident, $this->alice->id, 'responsable');

    $foreignAssignmentId = (int) DB::table('assignments')
        ->where('incident_id', $otherIncident->id)
        ->value('id');

    // Asking $this->incident to delete a row owned by $otherIncident
    // must fail closed — otherwise an attacker who guesses an id could
    // delete rows from incidents they do not own.
    expect(fn () => $this->service->unassign($this->incident, $foreignAssignmentId))
        ->toThrow(RuntimeException::class);

    expect(DB::table('assignments')->where('incident_id', $otherIncident->id)->count())->toBe(1);
});
