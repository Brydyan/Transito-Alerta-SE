<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Drop the Publicador role and its associated IncidentVerification audit table.
 *
 * Background: the publicador was a separate "verifier" step between the citizen
 * creating an incident and an operator claiming it. The deliverable doc
 * (`docs/2026_Proyecto_Estudiantes_TecDesWeb-3.md` §3.2) specifies only three
 * states — Pendiente → En proceso → Resuelto — so the publicador step is
 * overengineering relative to the actual requirement.
 *
 * This migration:
 *   1. Drops the `incident_verifications` table (CASCADE removes any rows).
 *   2. Deletes the `publicador` row from `roles`. CASCADE on user.role_id
 *      would be dangerous, but the publicador seeder was never wired into
 *      DatabaseSeeder (only MultitenantFeatSeeder used it, and that seeder
 *      doesn't run by default), so no FK violation is expected.
 *   3. Updates the `incidents.status` check constraint to drop the
 *      `pending_operator` value, matching the new 3-state enum.
 *
 * Pre-flight: this migration assumes no incident currently has
 * `status = 'pending_operator'`. If any do, they will fail the new
 * check and the migration will abort. Run this query first to verify:
 *   SELECT COUNT(*) FROM incidents WHERE status = 'pending_operator';
 */
return new class extends Migration
{
    public function up(): void
    {
        // 1. Drop the audit table. CASCADE handles any (unlikely) foreign
        // keys from other tables.
        Schema::dropIfExists('incident_verifications');

        // 2. Delete the publicador role. Safe because:
        //    - MultitenantFeatSeeder (which created publicador users) is
        //      NOT in DatabaseSeeder's default call list.
        //    - No active user should have role_id pointing at this row.
        // If FK constraints exist, the user must clean up references first.
        DB::table('roles')->where('name', 'publicador')->delete();

        // 3. Update the incidents.status check constraint to drop
        //    'pending_operator' from the allowed values.
        if (DB::connection()->getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_status_check');
            DB::statement("ALTER TABLE incidents ADD CONSTRAINT incidents_status_check CHECK (status IN ('pending', 'in_progress', 'resolved'))");
        }
    }

    public function down(): void
    {
        // Recreate the audit table (empty) and the publicador role.
        Schema::create('incident_verifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('incident_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained();
            $table->foreignId('organization_id')->constrained();
            $table->timestamp('verified_at')->useCurrent();
            $table->timestamps();
        });

        // Insert the publicador role only if it doesn't already exist.
        DB::table('roles')->insertOrIgnore([
            ['id' => 6, 'name' => 'publicador', 'description' => null, 'created_at' => now(), 'updated_at' => now()],
        ]);

        if (DB::connection()->getDriverName() !== 'sqlite') {
            DB::statement('ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_status_check');
            DB::statement("ALTER TABLE incidents ADD CONSTRAINT incidents_status_check CHECK (status IN ('pending', 'pending_operator', 'in_progress', 'resolved'))");
        }
    }
};
