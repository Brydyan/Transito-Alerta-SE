<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Drop full indexes — low selectivity on boolean, redundant on expires_at
        DB::statement('DROP INDEX IF EXISTS sessions_is_revoked_index');
        DB::statement('DROP INDEX IF EXISTS sessions_expires_at_index');
        DB::statement('DROP INDEX IF EXISTS sessions_user_id_index');

        // Active session lookup by user (auth validation hot path)
        DB::statement('
            CREATE INDEX idx_sessions_active_by_user
            ON sessions (user_id, expires_at)
            WHERE is_revoked = false
        ');

        // Expired session cleanup (background job scans non-revoked + expired)
        DB::statement('
            CREATE INDEX idx_sessions_pending_cleanup
            ON sessions (expires_at)
            WHERE is_revoked = false
        ');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS idx_sessions_active_by_user');
        DB::statement('DROP INDEX IF EXISTS idx_sessions_pending_cleanup');

        DB::statement('CREATE INDEX sessions_user_id_index ON sessions (user_id)');
        DB::statement('CREATE INDEX sessions_is_revoked_index ON sessions (is_revoked)');
        DB::statement('CREATE INDEX sessions_expires_at_index ON sessions (expires_at)');
    }
};
