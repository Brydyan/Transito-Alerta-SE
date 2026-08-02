<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Remover el permiso incidents.create del rol admin_sistema (id=1)
        // Justificación: admin_sistema gestiona y aprueba incidencias, no las reporta.
        // Esta separación de responsabilidades refuerza el Principio del Menor Privilegio (PoLP).
        DB::table('role_permission')
            ->where('role_id', 1) // admin_sistema
            ->whereIn('permission_id', function ($query) {
                $query->select('permission_id')
                    ->from('permissions')
                    ->where('resource', 'incidents')
                    ->where('action', 'create');
            })
            ->delete();
    }
};
