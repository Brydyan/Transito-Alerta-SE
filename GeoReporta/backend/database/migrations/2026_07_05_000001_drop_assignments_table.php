<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Drops the `assignments` table.
 *
 * Context: the table was created by 2026_06_15_000007_create_assignments_table
 * as part of an early attempt to formalize incident assignments as a separate
 * entity (with role/history). The flow was rolled back in
 * 2026_06_29_000003_remove_incident_organization_assignments and the current
 * claim/release/confirm implementation operates on `incidents.claimed_by` /
 * `incidents.claimed_at` instead.
 *
 * This table was never populated by application code (no model, no controller,
 * no service writing to it). The apiResource('incidents.assignments') route,
 * AssignmentController, and AssignmentRole enum have been removed; this
 * migration cleans up the orphaned schema.
 *
 * See docs/Pendientes/06-asignaciones.md for the full decision.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('assignments');
    }

    public function down(): void
    {
        Schema::create('assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('incident_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained();
            $table->string('assignment_role');
            $table->timestamp('created_at')->useCurrent();
            $table->softDeletes();

            $table->unique(['incident_id', 'user_id']);
        });
    }
};
