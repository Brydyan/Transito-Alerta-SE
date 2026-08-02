<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('incidents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('incident_category_id')->constrained();
            $table->foreignId('user_id')->constrained();
            $table->foreignId('location_id')->constrained();
            $table->string('status');
            $table->string('priority');
            $table->timestamp('resolution_date')->nullable();

            if (DB::connection()->getDriverName() === 'pgsql') {
                $table->geometry('geom', 'Point', 4326)->nullable();
            }

            $table->timestamps();
            $table->softDeletes();
        });

        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE incidents ADD CONSTRAINT incidents_status_check CHECK (status IN ('pending', 'in_progress', 'resolved'))");
            DB::statement("ALTER TABLE incidents ADD CONSTRAINT incidents_priority_check CHECK (priority IN ('low', 'medium', 'high'))");
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('incidents');
    }
};
