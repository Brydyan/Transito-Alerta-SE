<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            // Drop old check constraint
            DB::statement('ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_status_check');

            // Add new check constraint with 'pending_operator'
            DB::statement("ALTER TABLE incidents ADD CONSTRAINT incidents_status_check CHECK (status IN ('pending', 'pending_operator', 'in_progress', 'resolved'))");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            // Drop new check constraint
            DB::statement('ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_status_check');

            // Restore original check constraint
            DB::statement("ALTER TABLE incidents ADD CONSTRAINT incidents_status_check CHECK (status IN ('pending', 'in_progress', 'resolved'))");
        }
    }
};
