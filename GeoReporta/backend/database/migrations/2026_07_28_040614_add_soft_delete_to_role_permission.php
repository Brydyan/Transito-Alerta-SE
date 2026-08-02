<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('role_permission', function (Blueprint $table) {
            $table->softDeletes();
            $table->timestamp('reassigned_at')->nullable();
            $table->dropUnique(['role_id', 'permission_id']);
        });

        DB::statement(
            'CREATE UNIQUE INDEX role_id_permission_id_deleted_at_unique
             ON role_permission (role_id, permission_id)
             WHERE deleted_at IS NULL'
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS role_id_permission_id_deleted_at_unique');

        Schema::table('role_permission', function (Blueprint $table) {
            $table->dropColumn('reassigned_at');
            $table->dropSoftDeletes();
            $table->unique(['role_id', 'permission_id']);
        });
    }
};
