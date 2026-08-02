<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('incident_organization_assignments');

        Schema::table('incidents', function (Blueprint $table) {
            $table->foreignId('claimed_by')
                ->nullable()
                ->after('organization_id')
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamp('claimed_at')
                ->nullable()
                ->after('claimed_by');
        });
    }

    public function down(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->dropForeign(['claimed_by']);
            $table->dropColumn(['claimed_by', 'claimed_at']);
        });

        Schema::create('incident_organization_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('incident_id')->constrained()->cascadeOnDelete();
            $table->foreignId('organization_id')->constrained()->restrictOnDelete();
            $table->foreignId('claimed_by')->constrained('users')->restrictOnDelete();
            $table->string('status')->default('accepted');
            $table->timestamp('claimed_at')->useCurrent();
            $table->timestamp('released_at')->nullable();
            $table->timestamps();
            $table->index('organization_id');
        });
    }
};
