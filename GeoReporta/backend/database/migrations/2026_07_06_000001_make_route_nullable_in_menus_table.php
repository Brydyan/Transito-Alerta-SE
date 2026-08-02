<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Makes the `route` column on the `menus` table nullable.
 *
 * Section headers (parent menus like "Incidencias", "Gestión", "Catálogos")
 * don't navigate anywhere — they group children. They previously carried a
 * placeholder route string ("/incidents", "/management"), which the frontend
 * had to special-case. NULL is the honest signal.
 *
 * See docs/Pendientes/01-menu-dinamico.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('menus', function (Blueprint $table) {
            $table->string('route')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('menus', function (Blueprint $table) {
            $table->string('route')->nullable(false)->change();
        });
    }
};
