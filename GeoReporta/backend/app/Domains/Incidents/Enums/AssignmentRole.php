<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Enums;

/**
 * The role a user occupies when assigned to an incident.
 *
 * Backed values match the snake-case strings persisted in
 * `assignments.assignment_role` (see migration
 * 2026_07_08_000001_create_assignments_table). The application-level
 * uniqueness rule (max 1 `responsable` per incident) is enforced by
 * AssignmentService::assign; the database backstop is the partial
 * unique index introduced in
 * 2026_07_09_000001_add_partial_unique_responsable_to_assignments.
 *
 * The supported roles per spec (req: Admin Assignment Management):
 *   - Responsable — single accountable owner of the incident
 *   - Apoyo       — supporting operator; any number may be assigned
 */
enum AssignmentRole: string
{
    case Responsable = 'responsable';
    case Apoyo = 'apoyo';

    /**
     * Backing string values for every case.
     *
     * Native PHP enums only expose `cases()`; this helper returns the
     * plain string values so callers (validation rules and read-side
     * filters) can use the canonical list without re-deriving it.
     *
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
