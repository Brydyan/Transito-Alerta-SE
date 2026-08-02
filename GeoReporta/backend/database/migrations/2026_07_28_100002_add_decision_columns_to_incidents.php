<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Add approval/rejection audit columns to the `incidents` table.
 *
 * Supports the admin-approval workflow (sc-123): when an incident is approved
 * or rejected by an administrator, the user who made the decision and the
 * timestamp are recorded. The `rejection_reason` stores the admin's optional
 * note explaining the rejection.
 *
 * Partial index on `approved_at` WHERE NOT NULL optimises the common query
 * pattern: "show me incidents that have been decided but not yet closed".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incidents', function (Blueprint $table): void {
            $table->foreignId('approved_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamp('approved_at')->nullable();

            $table->foreignId('rejected_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamp('rejected_at')->nullable();

            $table->text('rejection_reason')->nullable();
        });

        // Partial index: only approved incidents (used by query-side services)
        Schema::table('incidents', function (Blueprint $table): void {
            $table->index(['approved_at'], 'idx_incidents_decided')
                ->where('approved_at IS NOT NULL');
        });

        // Defense-in-depth CHECK constraints:
        // 1. approved_by and approved_at must be both set or both NULL.
        // 2. rejected_by and rejected_at must be both set or both NULL.
        // 3. A row cannot have both approved and rejected decided.
        // DDL via raw SQL because Blueprint does not expose CHECK constraints
        // portably; PostgreSQL is the production target so we hard-code
        // `ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)`.
        DB::statement(<<<'SQL'
            ALTER TABLE incidents
                ADD CONSTRAINT chk_incidents_approved_pair
                CHECK (
                    (approved_by IS NULL AND approved_at IS NULL)
                    OR
                    (approved_by IS NOT NULL AND approved_at IS NOT NULL)
                )
        SQL);

        DB::statement(<<<'SQL'
            ALTER TABLE incidents
                ADD CONSTRAINT chk_incidents_rejected_pair
                CHECK (
                    (rejected_by IS NULL AND rejected_at IS NULL)
                    OR
                    (rejected_by IS NOT NULL AND rejected_at IS NOT NULL)
                )
        SQL);

        DB::statement(<<<'SQL'
            ALTER TABLE incidents
                ADD CONSTRAINT chk_incidents_decision_xor
                CHECK (
                    NOT (approved_by IS NOT NULL AND rejected_by IS NOT NULL)
                )
        SQL);
    }

    public function down(): void
    {
        // Drop CHECK constraints BEFORE the columns they reference.
        DB::statement('ALTER TABLE incidents DROP CONSTRAINT IF EXISTS chk_incidents_approved_pair');
        DB::statement('ALTER TABLE incidents DROP CONSTRAINT IF EXISTS chk_incidents_rejected_pair');
        DB::statement('ALTER TABLE incidents DROP CONSTRAINT IF EXISTS chk_incidents_decision_xor');

        Schema::table('incidents', function (Blueprint $table): void {
            $table->dropIndex('idx_incidents_decided');

            $table->dropForeign(['approved_by']);
            $table->dropColumn('approved_by');
            $table->dropColumn('approved_at');

            $table->dropForeign(['rejected_by']);
            $table->dropColumn('rejected_by');
            $table->dropColumn('rejected_at');

            $table->dropColumn('rejection_reason');
        });
    }
};
