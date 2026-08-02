<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('incident_categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained();
            $table->string('name');
            $table->timestamps();
            $table->softDeletes();
        });

        // Self-referencing FK added after table creation
        Schema::table('incident_categories', function (Blueprint $table) {
            $table->foreignId('parent_id')
                ->nullable()
                ->constrained('incident_categories')
                ->cascadeOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('incident_categories');
    }
};
