<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('incident_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('assignment_role');
            $table->timestamps();

            $table->unique(['incident_id', 'user_id']);
        });

        if (DB::connection()->getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE assignments ADD CONSTRAINT assignments_role_check CHECK (assignment_role IN ('responsable', 'apoyo'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('assignments');
    }
};
