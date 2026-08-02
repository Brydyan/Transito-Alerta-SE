<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('incident_verifications', function (Blueprint $table) {
            $table->id();

            $table->foreignId('incident_id')
                ->constrained('incidents')
                ->cascadeOnDelete();

            $table->foreignId('verified_by')
                ->constrained('users')
                ->cascadeOnDelete();

            $table->timestamp('verified_at');

            $table->foreignId('organization_id')
                ->constrained('organizations')
                ->cascadeOnDelete();

            // Unique index ensures one verification per incident
            $table->unique('incident_id', 'incident_verifications_incident_id_unique');
        });

        // Comentario de tabla para documentación (solo PostgreSQL)
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement('COMMENT ON TABLE incident_verifications IS \'Registro inmutable de verificaciones de incidencias (auditoría)\'');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('incident_verifications');
    }
};
