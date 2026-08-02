<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domains\Permissions\Models\Permission;
use App\Domains\Roles\Enums\UserRole;
use App\Domains\Roles\Models\Role;
use Database\Seeders\Concerns\SerializesSeeding;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class RolePermissionSeeder extends Seeder
{
    use SerializesSeeding;

    private const ADMIN_SISTEMA_PERMISSIONS = [
        ['resource' => 'dashboard',           'action' => 'view'],
        ['resource' => 'incidents',           'action' => 'view'],
        ['resource' => 'incidents',           'action' => 'update'],
        ['resource' => 'incidents',           'action' => 'delete'],
        ['resource' => 'incidents',           'action' => 'manage'],
        ['resource' => 'comments',            'action' => 'view'],
        ['resource' => 'comments',            'action' => 'create'],
        ['resource' => 'comments',            'action' => 'update'],
        ['resource' => 'comments',            'action' => 'delete'],
        ['resource' => 'status-history',      'action' => 'view'],
        ['resource' => 'assignments',         'action' => 'view'],
        ['resource' => 'assignments',         'action' => 'create'],
        ['resource' => 'assignments',         'action' => 'update'],
        ['resource' => 'assignments',         'action' => 'delete'],
        ['resource' => 'notifications',       'action' => 'view'],
        ['resource' => 'notifications',       'action' => 'update'],
        ['resource' => 'locations',           'action' => 'view'],
        ['resource' => 'locations',           'action' => 'create'],
        ['resource' => 'locations',           'action' => 'update'],
        ['resource' => 'locations',           'action' => 'delete'],
        ['resource' => 'organizations',       'action' => 'view'],
        ['resource' => 'organizations',       'action' => 'create'],
        ['resource' => 'organizations',       'action' => 'update'],
        ['resource' => 'organizations',       'action' => 'delete'],
        ['resource' => 'incident-categories', 'action' => 'view'],
        ['resource' => 'incident-categories', 'action' => 'create'],
        ['resource' => 'incident-categories', 'action' => 'update'],
        ['resource' => 'incident-categories', 'action' => 'delete'],
        ['resource' => 'roles',               'action' => 'view'],
        ['resource' => 'roles',               'action' => 'create'],
        ['resource' => 'roles',               'action' => 'update'],
        ['resource' => 'roles',               'action' => 'delete'],
        ['resource' => 'users',               'action' => 'view'],
        ['resource' => 'users',               'action' => 'create'],
        ['resource' => 'users',               'action' => 'update'],
        ['resource' => 'users',               'action' => 'delete'],
        ['resource' => 'profile',             'action' => 'view'],
    ];

    private const OPERADOR_SISTEMA_PERMISSIONS = [
        ['resource' => 'dashboard',           'action' => 'view'],
        ['resource' => 'incidents',           'action' => 'view'],
        ['resource' => 'incidents',           'action' => 'create'],
        ['resource' => 'incidents',           'action' => 'update'],
        ['resource' => 'incidents',           'action' => 'manage'],
        ['resource' => 'comments',            'action' => 'view'],
        ['resource' => 'comments',            'action' => 'create'],
        ['resource' => 'comments',            'action' => 'update'],
        ['resource' => 'status-history',      'action' => 'view'],
        ['resource' => 'assignments',         'action' => 'view'],
        ['resource' => 'notifications',       'action' => 'view'],
        ['resource' => 'notifications',       'action' => 'update'],
        ['resource' => 'locations',           'action' => 'view'],
        ['resource' => 'organizations',       'action' => 'view'],
        ['resource' => 'incident-categories', 'action' => 'view'],
        ['resource' => 'profile',             'action' => 'view'],
    ];

    private const ADMIN_ORGANIZACION_PERMISSIONS = [
        ['resource' => 'dashboard',           'action' => 'view'],
        ['resource' => 'incidents',           'action' => 'view'],
        ['resource' => 'incidents',           'action' => 'update'],
        ['resource' => 'incidents',           'action' => 'delete'],
        ['resource' => 'incidents',           'action' => 'manage'],
        ['resource' => 'comments',            'action' => 'view'],
        ['resource' => 'comments',            'action' => 'create'],
        ['resource' => 'comments',            'action' => 'update'],
        ['resource' => 'comments',            'action' => 'delete'],
        ['resource' => 'status-history',      'action' => 'view'],
        ['resource' => 'assignments',         'action' => 'view'],
        ['resource' => 'assignments',         'action' => 'create'],
        ['resource' => 'assignments',         'action' => 'update'],
        ['resource' => 'assignments',         'action' => 'delete'],
        ['resource' => 'notifications',       'action' => 'view'],
        ['resource' => 'notifications',       'action' => 'update'],
        ['resource' => 'locations',           'action' => 'view'],
        ['resource' => 'organizations',       'action' => 'view'],
        ['resource' => 'organizations',       'action' => 'update'],
        ['resource' => 'incident-categories', 'action' => 'view'],
        ['resource' => 'users',               'action' => 'view'],
        ['resource' => 'users',               'action' => 'create'],
        ['resource' => 'users',               'action' => 'update'],
        ['resource' => 'users',               'action' => 'delete'],
        // Spec override (design Decision 1): admin_organizacion receives
        // feed.view in addition to usuario, so org admins can verify the
        // citizen experience in-browser. Overrides the spec rule
        // "No other role SHALL receive feed.view in this change".
        ['resource' => 'feed',                'action' => 'view'],
        ['resource' => 'profile',             'action' => 'view'],
    ];

    private const OPERADOR_ORGANIZACION_PERMISSIONS = [
        ['resource' => 'dashboard',           'action' => 'view'],
        ['resource' => 'incidents',           'action' => 'view'],
        ['resource' => 'incidents',           'action' => 'update'],
        // Previously missing: the menu item Notificaciones was gated by
        // notifications.view, which this role never had. Granting it here
        // fixes the leak where the menu was hidden despite the role being
        // able to act on notifications.
        ['resource' => 'notifications',       'action' => 'view'],
        ['resource' => 'notifications',       'action' => 'update'],
        ['resource' => 'comments',            'action' => 'view'],
        ['resource' => 'comments',            'action' => 'create'],
        ['resource' => 'comments',            'action' => 'update'],
        ['resource' => 'assignments',         'action' => 'view'],
        ['resource' => 'profile',             'action' => 'view'],
    ];

    private const USUARIO_PERMISSIONS = [
        ['resource' => 'feed',          'action' => 'detail'],
        ['resource' => 'incidents',     'action' => 'create'],
        ['resource' => 'comments',      'action' => 'create'],
        ['resource' => 'comments',      'action' => 'view'],
        ['resource' => 'assignments',   'action' => 'view'],
        ['resource' => 'feed',          'action' => 'view'],
        ['resource' => 'profile',       'action' => 'view'],
    ];

    public function run(): void
    {
        $rolePermissionMap = [
            UserRole::AdminSistema->value => self::ADMIN_SISTEMA_PERMISSIONS,
            UserRole::OperadorSistema->value => self::OPERADOR_SISTEMA_PERMISSIONS,
            UserRole::AdminOrganizacion->value => self::ADMIN_ORGANIZACION_PERMISSIONS,
            UserRole::OperadorOrganizacion->value => self::OPERADOR_ORGANIZACION_PERMISSIONS,
            UserRole::Usuario->value => self::USUARIO_PERMISSIONS,
        ];

        // The delete/insert pair below must not interleave with a second
        // container running the same seeder. See SerializesSeeding.
        $this->seedExclusively(function () use ($rolePermissionMap): void {
            $roleIds = Role::whereIn('name', array_keys($rolePermissionMap))
                ->pluck('id')
                ->toArray();

            if (count($roleIds) > 0) {
                DB::table('role_permission')->whereIn('role_id', $roleIds)->delete();
            }

            foreach ($rolePermissionMap as $roleName => $permissions) {
                $role = Role::where('name', $roleName)->first();
                if ($role) {
                    $this->assignPermissions($role->id, $permissions);
                } else {
                    $this->command?->warn("Rol '{$roleName}' no encontrado en la base de datos.");
                }
            }
        });

        $this->command?->info('Permisos asignados a todos los roles exitosamente.');
    }

    /** @param array<array{resource: string, action: string}> $definitions */
    private function assignPermissions(int $roleId, array $definitions): void
    {
        $now = now();

        foreach ($definitions as $def) {
            $permission = Permission::where('resource', $def['resource'])
                ->where('action', $def['action'])
                ->first();

            if ($permission === null) {
                $this->command?->warn("Permiso {$def['resource']}.{$def['action']} no encontrado en la base de datos.");

                continue;
            }

            DB::table('role_permission')->insert([
                'role_id' => $roleId,
                'permission_id' => $permission->permission_id,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }
}
