<?php

namespace Database\Seeders;

use App\Domains\Permissions\Models\Permission;
use Database\Seeders\Concerns\SerializesSeeding;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class PermissionSeeder extends Seeder
{
    use SerializesSeeding;

    private const PERMISSIONS = [
        // Dashboard
        ['resource' => 'dashboard',           'action' => 'view',   'name' => 'Ver Dashboard',                'description' => 'Acceso al dashboard principal'],
        // Incidents
        ['resource' => 'incidents',           'action' => 'view',   'name' => 'Ver Incidencias',             'description' => 'Listar y ver detalle de incidencias'],
        ['resource' => 'incidents',           'action' => 'create', 'name' => 'Crear Incidencias',           'description' => 'Registrar nuevas incidencias'],
        ['resource' => 'incidents',           'action' => 'update', 'name' => 'Actualizar Incidencias',      'description' => 'Modificar incidencias existentes'],
        ['resource' => 'incidents',           'action' => 'delete', 'name' => 'Eliminar Incidencias',        'description' => 'Eliminar incidencias'],
        // Comments
        ['resource' => 'comments',            'action' => 'view',   'name' => 'Ver Comentarios',             'description' => 'Ver comentarios de incidencias'],
        ['resource' => 'comments',            'action' => 'create', 'name' => 'Agregar Comentarios',         'description' => 'Comentar en incidencias'],
        ['resource' => 'comments',            'action' => 'update', 'name' => 'Editar Comentarios',          'description' => 'Editar comentarios propios'],
        ['resource' => 'comments',            'action' => 'delete', 'name' => 'Eliminar Comentarios',        'description' => 'Eliminar comentarios'],
        // Status history
        ['resource' => 'status-history',      'action' => 'view',   'name' => 'Ver Historial de Estados',    'description' => 'Ver historial de cambios de estado'],
        // Assignments
        ['resource' => 'assignments',         'action' => 'view',   'name' => 'Ver Asignaciones',            'description' => 'Ver asignaciones de operadores a incidencias'],
        ['resource' => 'assignments',         'action' => 'create', 'name' => 'Crear Asignaciones',          'description' => 'Asignar operadores a incidencias'],
        ['resource' => 'assignments',         'action' => 'update', 'name' => 'Actualizar Asignaciones',     'description' => 'Modificar o reasignar operadores a incidencias'],
        ['resource' => 'assignments',         'action' => 'delete', 'name' => 'Eliminar Asignaciones',       'description' => 'Quitar operadores asignados a incidencias'],
        // Notifications
        ['resource' => 'notifications',       'action' => 'view',   'name' => 'Ver Notificaciones',          'description' => 'Ver notificaciones propias'],
        ['resource' => 'notifications',       'action' => 'update', 'name' => 'Gestionar Notificaciones',    'description' => 'Marcar notificaciones como leídas'],
        // Locations
        ['resource' => 'locations',           'action' => 'view',   'name' => 'Ver Ubicaciones',             'description' => 'Listar ubicaciones'],
        ['resource' => 'locations',           'action' => 'create', 'name' => 'Crear Ubicaciones',           'description' => 'Agregar ubicaciones'],
        ['resource' => 'locations',           'action' => 'update', 'name' => 'Actualizar Ubicaciones',      'description' => 'Modificar ubicaciones'],
        ['resource' => 'locations',           'action' => 'delete', 'name' => 'Eliminar Ubicaciones',        'description' => 'Eliminar ubicaciones'],
        // Organizations
        ['resource' => 'organizations',       'action' => 'view',   'name' => 'Ver Organizaciones',          'description' => 'Listar organizaciones'],
        ['resource' => 'organizations',       'action' => 'create', 'name' => 'Crear Organizaciones',        'description' => 'Agregar organizaciones'],
        ['resource' => 'organizations',       'action' => 'update', 'name' => 'Actualizar Organizaciones',   'description' => 'Modificar organizaciones'],
        ['resource' => 'organizations',       'action' => 'delete', 'name' => 'Eliminar Organizaciones',     'description' => 'Eliminar organizaciones'],
        // Incident categories
        ['resource' => 'incident-categories', 'action' => 'view',   'name' => 'Ver Categorías',              'description' => 'Listar categorías de incidencias'],
        ['resource' => 'incident-categories', 'action' => 'create', 'name' => 'Crear Categorías',            'description' => 'Agregar categorías de incidencias'],
        ['resource' => 'incident-categories', 'action' => 'update', 'name' => 'Actualizar Categorías',       'description' => 'Modificar categorías de incidencias'],
        ['resource' => 'incident-categories', 'action' => 'delete', 'name' => 'Eliminar Categorías',         'description' => 'Eliminar categorías de incidencias'],
        // Users
        ['resource' => 'users',               'action' => 'view',   'name' => 'Ver Usuarios',                'description' => 'Listar usuarios del sistema'],
        ['resource' => 'users',               'action' => 'create', 'name' => 'Crear Usuarios',              'description' => 'Registrar nuevos usuarios'],
        ['resource' => 'users',               'action' => 'update', 'name' => 'Actualizar Usuarios',         'description' => 'Modificar datos de usuarios'],
        ['resource' => 'users',               'action' => 'delete', 'name' => 'Eliminar Usuarios',           'description' => 'Eliminar usuarios'],
        // Roles
        ['resource' => 'roles',               'action' => 'view',   'name' => 'Ver Roles',                   'description' => 'Listar roles del sistema'],
        ['resource' => 'roles',               'action' => 'create', 'name' => 'Crear Roles',                 'description' => 'Agregar nuevos roles'],
        ['resource' => 'roles',               'action' => 'update', 'name' => 'Actualizar Roles',            'description' => 'Modificar roles existentes'],
        ['resource' => 'roles',               'action' => 'delete', 'name' => 'Eliminar Roles',              'description' => 'Eliminar roles'],
        // Incidents: back-office create/manage (distinto de incidents.create, que es ciudadano)
        ['resource' => 'incidents',           'action' => 'manage', 'name' => 'Gestionar Incidencias (Back-office)', 'description' => 'Crear/gestionar incidencias desde el back-office'],
        // Feed ciudadano (Inicio + Reportar)
        ['resource' => 'feed',                'action' => 'view',   'name' => 'Ver Feed',                   'description' => 'Acceso al feed ciudadano de incidencias'],
        // Detalle de incidencia desde el feed ciudadano
        ['resource' => 'feed',                'action' => 'detail', 'name' => 'Ver Detalle de Incidencia',  'description' => 'Ver detalle de una incidencia desde el feed ciudadano'],
        // Perfil propio (visibilidad universal)
        ['resource' => 'profile',             'action' => 'view',   'name' => 'Ver Perfil',                 'description' => 'Ver perfil propio'],
    ];

    public function run(): void
    {
        // Idempotent: borra permisos que ya no están en el catálogo
        // (data huérfana de seeds anteriores).
        $keepResources = array_unique(array_map(
            fn (array $p) => "{$p['resource']}.{$p['action']}",
            self::PERMISSIONS,
        ));
        $keepPairs = array_map(
            fn (string $slug) => ['resource' => explode('.', $slug)[0], 'action' => explode('.', $slug)[1]],
            $keepResources,
        );

        // Shares RolePermissionSeeder's lock: pruning orphans deletes from
        // role_permission, so the two seeders race. See SerializesSeeding.
        $this->seedExclusively(function () use ($keepPairs): void {
            // Borrar permisos huérfanos (los que no están en el array PERMISSIONS)
            $existing = Permission::all();
            foreach ($existing as $perm) {
                $stillValid = collect($keepPairs)->contains(fn ($p) => $p['resource'] === $perm->resource && $p['action'] === $perm->action
                );
                if (! $stillValid) {
                    DB::table('role_permission')->where('permission_id', $perm->permission_id)->delete();
                    DB::table('menu_permission')->where('permission_id', $perm->permission_id)->delete();
                    $perm->delete();
                }
            }

            foreach (self::PERMISSIONS as $data) {
                Permission::updateOrCreate(
                    ['resource' => $data['resource'], 'action' => $data['action']],
                    ['name' => $data['name'], 'description' => $data['description']],
                );
            }
        });

        $this->command?->info('Permisos creados/actualizados.');
    }
}
