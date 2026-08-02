<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Services;

use App\Domains\Incidents\Enums\AssignmentRole;
use App\Domains\Incidents\Models\Assignment;
use App\Domains\Incidents\Models\Incident;
use Illuminate\Support\Facades\DB;

/**
 * Reglas de negocio del sub-recurso `assignments`.
 *
 * @cqrs-role command-service
 *
 * Pertenece al command side: encapsula invariantes (rol válido, sin
 * usuarios duplicados, un solo responsable por incidencia) que el
 * controller NO debe embebir para mantenerlas testeables sin kernel.
 *
 * The HTTP layer (AssignmentController) is a thin shell over these
 * methods; the controller does not embed any of this logic so the rules
 * stay unit-testable without touching the kernel.
 *
 * Errors are surfaced as \RuntimeException with the integer HTTP
 * semantic code as the second argument — AssignmentController maps those
 * into JsonResponses in Phase 1, and Phase 2's permissions layer can
 * override them before they leave the framework.
 */
class AssignmentService
{
    /**
     * Assign a user to an incident under the given role.
     *
     * Validation order matters and is documented inline:
     *   1. role string must map to a known AssignmentRole case
     *   2. user must not already be assigned to this incident
     *   3. if the role is responsable, no other responsable may exist
     *
     * @throws \RuntimeException with an HTTP semantic code on any guard failure
     */
    public function assign(Incident $incident, int $userId, string $role): void
    {
        // Guard 1 — role must be a known case. Uses tryFrom to map the
        // failure to a 422 (semantic: unprocessable input) rather than
        // letting PHP surface a ValueError.
        if (AssignmentRole::tryFrom($role) === null) {
            throw new \RuntimeException(
                'El rol de asignación debe ser responsable o apoyo.',
                422
            );
        }

        // Guard 2 — duplicate user. The database has a partial UNIQUE
        // (incident_id, user_id) WHERE deleted_at IS NULL index so this
        // would also raise at the DB layer; checking it here keeps the
        // error message friendly and the controller free of transaction
        // juggling.
        //
        // Must exclude soft-deleted rows: `unassign()` soft-deletes
        // (issue #202), so a raw `DB::table()` query with no `deleted_at`
        // filter still "sees" a previously unassigned row and wrongly
        // blocks re-assigning the same user — exactly the case the
        // partial unique index exists to allow. Surfaced by unskipping
        // the pgsql-gated "allows re-assigning a user who was previously
        // unassigned" test (backend-tests-postgres-migration, #197).
        $alreadyAssigned = DB::table('assignments')
            ->where('incident_id', $incident->id)
            ->where('user_id', $userId)
            ->whereNull('deleted_at')
            ->exists();

        if ($alreadyAssigned) {
            throw new \RuntimeException(
                'Este operador ya está asignado a esta incidencia.',
                409
            );
        }

        // Guard 3 — max one responsable per incident. The Postgres-side
        // partial unique index `assignments_one_responsable_per_incident`
        // (migration 2026_07_09_000001_...) is the backstop; SQLite in
        // tests skips that index, so this check is what the test suite
        // observes. Same soft-delete exclusion as Guard 2 — a previously
        // unassigned responsable must not block a new one.
        if ($role === AssignmentRole::Responsable->value) {
            $existingResponsable = DB::table('assignments')
                ->where('incident_id', $incident->id)
                ->where('assignment_role', AssignmentRole::Responsable->value)
                ->whereNull('deleted_at')
                ->exists();

            if ($existingResponsable) {
                throw new \RuntimeException(
                    'Esta incidencia ya tiene un responsable asignado.',
                    422
                );
            }
        }

        // Create the Assignment row directly so Eloquent dispatches the
        // `created` event (BelongsToMany::attach() bypasses model events
        // — it issues a raw INSERT on the pivot table — which is why the
        // AssignmentNotificationObserver never fired for assignments
        // made through this service in the past). The DB UNIQUE indexes
        // already cover duplicate-user and one-responsable-per-incident
        // guards as a backstop.
        Assignment::create([
            'incident_id' => $incident->id,
            'user_id' => $userId,
            'assignment_role' => $role,
        ]);
    }

    /**
     * Remove an assignment by id, scoped to its parent incident.
     *
     * The incident scoping matters: an authenticated user who guesses a
     * numeric id must not be able to delete a row owned by an incident
     * they have no rights on. The Phase 2 policy layer will further
     * gate the call; the scoping here is the service-level guarantee.
     *
     * @throws \RuntimeException with code 404 when no row matches
     *                           (incident_id, id).
     */
    public function unassign(Incident $incident, int $assignmentId): void
    {
        $assignment = Assignment::query()
            ->where('incident_id', $incident->id)
            ->where('id', $assignmentId)
            ->first();

        if ($assignment === null) {
            throw new \RuntimeException(
                'Asignación no encontrada.',
                404
            );
        }

        // Soft delete — preserva el historial de asignación.
        $assignment->delete();
    }
}
