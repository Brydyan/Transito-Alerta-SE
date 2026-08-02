<?php

declare(strict_types=1);

use App\Domains\Incidents\Enums\IncidentStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Add 'closed' status to the CHECK constraint on the `incidents.status` column.
 *
 * Background: the PHP enum ({@see IncidentStatus})
 * added the `Closed` case to support the admin-approval workflow (sc-123).
 * The DB schema carried a CHECK constraint from migration
 * `2026_06_29_000007_update_incident_status_check_constraint` that did NOT include
 * `'closed'`. INSERTs with status='closed' would fail with SQLSTATE[23514].
 *
 * This migration extends the existing CHECK constraint to include 'closed'.
 * Idempotent: drops any pre-existing constraint with the same name before
 * re-creating it (safe to run on a database that already has the fix applied).
 *
 * pgsql-only: SQLite doesn't carry the constraint.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        // Drop both possible constraint names for idempotency (some environments
        // have chk_incident_status from 2026_07_26_165347_add_referential_integrity_constraints)
        DB::statement('ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_status_check');
        DB::statement('ALTER TABLE incidents DROP CONSTRAINT IF EXISTS chk_incident_status');

        DB::statement(
            'ALTER TABLE incidents ADD CONSTRAINT incidents_status_check '
            ."CHECK (status IN ('pending', 'pending_operator', 'in_progress', 'resolved', 'closed'))"
        );
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_status_check');
        DB::statement(
            'ALTER TABLE incidents ADD CONSTRAINT incidents_status_check '
            ."CHECK (status IN ('pending', 'pending_operator', 'in_progress', 'resolved'))"
        );
    }
};
