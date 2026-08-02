<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('incident_claims', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->foreignId('incident_id')->constrained()->cascadeOnDelete();
            $table->foreignId('organization_id')->constrained()->restrictOnDelete();
            $table->foreignId('claimed_by')->constrained('users')->restrictOnDelete();
            $table->string('status')->default('accepted');
            $table->timestamp('claimed_at')->useCurrent();
            $table->timestamp('released_at')->nullable();
            $table->timestamps();
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE incident_claims ADD CONSTRAINT incident_claims_status_check CHECK (status IN ('accepted', 'released'))");
            DB::statement("CREATE UNIQUE INDEX uniq_incident_active_claim ON incident_claims (incident_id) WHERE status = 'accepted'");
        }

        Schema::table('incident_claims', function (Blueprint $table) {
            $table->index('organization_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('incident_claims');
    }
};
