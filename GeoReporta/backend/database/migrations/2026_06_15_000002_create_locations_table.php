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
        Schema::create('locations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('level');

            if (DB::connection()->getDriverName() === 'pgsql') {
                $table->geometry('geom', 'MultiPolygon', 4326)->nullable();
            }

            $table->softDeletes();
            $table->timestamps();
        });

        // Self-referencing FK added after table creation
        Schema::table('locations', function (Blueprint $table) {
            $table->foreignId('parent_id')
                ->nullable()
                ->constrained('locations')
                ->nullOnDelete();
        });

        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE locations ADD CONSTRAINT locations_level_check CHECK (level IN ('country', 'province', 'city', 'neighborhood'))");
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('locations');
    }
};
