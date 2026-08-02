<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->index('incident_category_id');
            $table->index('user_id');
            $table->index('location_id');
            $table->index('organization_id');
        });

        Schema::table('sessions', function (Blueprint $table) {
            $table->index('refresh_token_hash');
        });
    }

    public function down(): void
    {
        Schema::table('incidents', function (Blueprint $table) {
            $table->dropIndex(['incident_category_id']);
            $table->dropIndex(['user_id']);
            $table->dropIndex(['location_id']);
            $table->dropIndex(['organization_id']);
        });

        Schema::table('sessions', function (Blueprint $table) {
            $table->dropIndex(['refresh_token_hash']);
        });
    }
};
