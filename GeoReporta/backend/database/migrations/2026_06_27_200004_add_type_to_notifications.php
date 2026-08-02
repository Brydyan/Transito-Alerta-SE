<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add type as nullable first so existing rows do not violate NOT NULL
        Schema::table('notifications', function (Blueprint $table) {
            $table->string('type', 64)->nullable()->after('id');
        });

        // Backfill legacy rows (SQLite-compatible)
        DB::statement("UPDATE notifications SET type = 'legacy' WHERE type IS NULL");

        if (DB::getDriverName() === 'pgsql') {
            // Make NOT NULL after backfill (pgsql only — SQLite cannot ALTER COLUMN)
            DB::statement('ALTER TABLE notifications ALTER COLUMN type SET NOT NULL');

            // Check constraint for known type values
            DB::statement("ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('claim', 'assignment', 'status_change', 'comment', 'legacy'))");

            // JSONB for structured payload (pgsql only)
            DB::statement('ALTER TABLE notifications ADD COLUMN data jsonb NULL');
        } else {
            Schema::table('notifications', function (Blueprint $table) {
                $table->json('data')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check');
        }

        Schema::table('notifications', function (Blueprint $table) {
            $table->dropColumn(['type', 'data']);
        });
    }
};
