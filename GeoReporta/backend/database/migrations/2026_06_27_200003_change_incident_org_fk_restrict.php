<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            // Drop the existing nullOnDelete FK (incidents_organization_id_foreign)
            $table->dropForeign(['organization_id']);

            // Recreate with restrictOnDelete
            $table->foreign('organization_id')
                ->references('id')
                ->on('organizations')
                ->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->dropForeign(['organization_id']);

            $table->foreign('organization_id')
                ->references('id')
                ->on('organizations')
                ->nullOnDelete();
        });
    }
};
