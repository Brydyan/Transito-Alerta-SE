<?php

use App\Domains\Notifications\Enums\NotificationType;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Add the 'assigned' notification type to the CHECK constraint on the
 * `notifications.type` column.
 *
 * Background: the PHP enum
 * ({@see NotificationType}) added the
 * `Assigned` case to support `AssignmentNotificationObserver` (delivered
 * in the same change-set). The DB schema, however, carried a 5-value
 * CHECK constraint from migration
 * `2026_06_27_200004_add_type_to_notifications` that did NOT include
 * `'assigned'`. Every INSERT attempted by the observer failed with
 * `SQLSTATE[23514] check_violation` and was silently swallowed by the
 * observer's try/catch — so notifications for formal assignments
 * never reached the table.
 *
 * This migration extends the existing CHECK constraint to include
 * `'assigned'`. Idempotent: drops any pre-existing constraint with
 * the same name before re-creating it (safe to run on a database
 * that already has the fix applied).
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
            ."CHECK (type IN ('claim', 'assignment', 'assigned', 'status_change', 'comment', 'legacy'))"
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
            ."CHECK (type IN ('claim', 'assignment', 'status_change', 'comment', 'legacy'))"
        );
    }
};
