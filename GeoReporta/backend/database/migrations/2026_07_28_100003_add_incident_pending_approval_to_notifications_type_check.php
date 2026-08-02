<?php

declare(strict_types=1);

use App\Domains\Notifications\Enums\NotificationType;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Add the 'incident_pending_approval' notification type to the CHECK constraint
 * on the `notifications.type` column.
 *
 * Background: the PHP enum
 * ({@see NotificationType}) added the
 * `IncidentPendingApproval` case to support the admin-approval workflow
 * notification (sc-123). The DB schema carried a CHECK constraint from migration
 * `2026_07_17_000001_add_assigned_to_notifications_type_check` that did NOT
 * include `'incident_pending_approval'`. INSERTs would fail with SQLSTATE[23514].
 *
 * This migration extends the existing CHECK constraint to include
 * `'incident_pending_approval'`. Idempotent: drops any pre-existing constraint
 * with the same name before re-creating it.
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

        DB::statement('ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check');
        DB::statement(
            'ALTER TABLE notifications ADD CONSTRAINT notifications_type_check '
            ."CHECK (type IN ('claim', 'assignment', 'assigned', 'status_change', 'comment', 'legacy', 'incident_pending_approval'))"
        );
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check');
        DB::statement(
            'ALTER TABLE notifications ADD CONSTRAINT notifications_type_check '
            ."CHECK (type IN ('claim', 'assignment', 'assigned', 'status_change', 'comment', 'legacy'))"
        );
    }
};
