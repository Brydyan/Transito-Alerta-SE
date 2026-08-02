<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('role_permission', function (Blueprint $table) {
            $table->dropSoftDeletes();
        });

        Schema::table('menu_permission', function (Blueprint $table) {
            $table->dropSoftDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('role_permission', function (Blueprint $table) {
            $table->softDeletes();
        });

        Schema::table('menu_permission', function (Blueprint $table) {
            $table->softDeletes();
        });
    }
};
