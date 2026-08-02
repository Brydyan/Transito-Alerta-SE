<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('permissions', function (Blueprint $table) {
            $table->id('permission_id');
            $table->string('name');
            $table->text('description');
            $table->string('resource');
            $table->string('action');
            $table->softDeletes();
            $table->timestamps();

            $table->unique(['resource', 'action']);
        });

        Schema::create('role_permission', function (Blueprint $table) {
            $table->id('role_permission_id');
            $table->foreignId('role_id')->constrained('roles')->cascadeOnDelete();
            $table->foreignId('permission_id')->constrained('permissions', 'permission_id')->cascadeOnDelete();
            $table->softDeletes();
            $table->timestamps();

            $table->unique(['role_id', 'permission_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('role_permission');
        Schema::dropIfExists('permissions');
    }
};
