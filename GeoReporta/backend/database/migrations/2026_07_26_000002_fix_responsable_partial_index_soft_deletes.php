<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Fixes `assignments_one_responsable_per_incident` (from
 * `2026_07_09_000001_add_partial_unique_responsable_to_assignments.php`)
 * to exclude soft-deleted rows.
 *
 * That index was created before `assignments` had a `deleted_at` column
 * at all (soft deletes landed later in
 * `2026_07_26_000001_add_soft_deletes_to_assignments_table.php`, #202),
 * so its `WHERE assignment_role = 'responsable'` clause has no way to
 * exclude a soft-deleted responsable row. Once soft deletes exist, an
 * unassigned (soft-deleted) responsable still counts against this
 * index, permanently blocking any new responsable from ever being
 * assigned to that incident again — a real production defect, not just
 * a test artifact, surfaced by unskipping the pgsql-gated
 * `AssignmentServiceTest` "allows re-assigning a user who was
 * previously unassigned" case (backend-tests-postgres-migration, #197).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('DROP INDEX IF EXISTS assignments_one_responsable_per_incident');
        DB::statement(
            'CREATE UNIQUE INDEX assignments_one_responsable_per_incident '
            .'ON assignments (incident_id) '
            ."WHERE assignment_role = 'responsable' AND deleted_at IS NULL"
        );
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('DROP INDEX IF EXISTS assignments_one_responsable_per_incident');
        DB::statement(
            'CREATE UNIQUE INDEX assignments_one_responsable_per_incident '
            .'ON assignments (incident_id) '
            ."WHERE assignment_role = 'responsable'"
        );
    }
};
