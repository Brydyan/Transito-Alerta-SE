<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Adds a partial unique index on `assignments(incident_id)` filtered to
 * rows where `assignment_role = 'responsable'`.
 *
 * Backs the "at most one responsable per incident" business rule at the
 * database level (defense-in-depth on top of the application-level check
 * in AssignmentService::assign). The index is created as PARTIAL because
 * there is no upper bound on `apoyo` rows per incident — a non-partial
 * unique index on `(incident_id, role)` would over-constrain.
 *
 * Postgres only: SQLite does not support partial indexes via CREATE INDEX.
 * The existing assignments migration (`2026_07_08_000001_create_assignments_table`)
 * similarly guards with `getDriverName() !== 'sqlite'` for the CHECK
 * constraint, so the project convention is: structural SQL objects that
 * Postgres supports but SQLite does not are skipped under
 * `DB_CONNECTION=sqlite` (the test suite in phpunit.xml), and enforced in
 * dev/prod where Postgres is the target. Application-layer validation
 * remains the only guarantee when running tests.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->getDriverName() === 'sqlite') {
            return;
        }

        DB::statement(
            'CREATE UNIQUE INDEX assignments_one_responsable_per_incident '
            .'ON assignments (incident_id) WHERE assignment_role = \'responsable\''
        );
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() === 'sqlite') {
            return;
        }

        DB::statement('DROP INDEX IF EXISTS assignments_one_responsable_per_incident');
    }
};
