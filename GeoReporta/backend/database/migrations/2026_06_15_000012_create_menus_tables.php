<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('menus', function (Blueprint $table) {
            $table->id('menu_id');
            $table->foreignId('parent_id')->nullable()->constrained('menus', 'menu_id')->nullOnDelete();
            $table->string('name');
            $table->string('route');
            $table->string('icon')->nullable();
            $table->boolean('active')->default(true);
            $table->softDeletes();
            $table->timestamps();
        });

        Schema::create('menu_permission', function (Blueprint $table) {
            $table->id('menu_permission_id');
            $table->foreignId('menu_id')->constrained('menus', 'menu_id')->cascadeOnDelete();
            $table->foreignId('permission_id')->constrained('permissions', 'permission_id')->cascadeOnDelete();
            $table->softDeletes();
            $table->timestamps();

            $table->unique(['menu_id', 'permission_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('menu_permission');
        Schema::dropIfExists('menus');
    }
};
