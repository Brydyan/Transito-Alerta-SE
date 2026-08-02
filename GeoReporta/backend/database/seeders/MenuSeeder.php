<?php

namespace Database\Seeders;

use App\Domains\Menus\Models\Menu;
use App\Domains\Permissions\Models\Permission;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class MenuSeeder extends Seeder
{
    /**
     * parent_id = null  → root menu
     * permission        → the permission that gates visibility (null = parent pulled in automatically)
     *
     * Rutas alineadas con frontend/app/app.js. Padres de sección tienen
     * `route => null` (no son navegables, solo agrupan hijos).
     *
     * IDs con huecos: 4 era "Nueva Incidencia" (removida — el back-office
     *                  ya tiene su punto de entrada por otra vía),
     *                  5 era Asignaciones (borrado paso 06),
     *                  9 era Permisos (borrado paso 05-A),
     *                  10 era Menús (sin contraparte, removido),
     *                  15 era Notificaciones (removida — el bell-icon del
     *                  header sigue dando acceso a /notificaciones, no hace
     *                  falta fila duplicada en el sidebar),
     *                  20 era el "Mapa" espejo ciudadano (/mapa-ciudadano) —
     *                  removido al fusionar los dos mapas en un solo endpoint
     *                  + componente (ver comentario en la entrada 19).
     *
     * Los permissions `incidents.manage` y `notifications.update` SIGUEN
     * vivos en PermissionSeeder / RolePermissionSeeder aunque no haya fila
     * de menú aquí que los consuma — la lógica de negocio (controllers,
     * gates) los usa aunque no estén expuestos en el sidebar.
     *
     * `permission` acepta un solo spec {resource, action} o una lista de
     * specs — una lista asigna varios permisos al mismo menú (OR: alcanza
     * con tener uno cualquiera para verlo), usado por la entrada 19 abajo.
     *
     * @var array<int, array{name: string, route: string|null, icon: string|null, parent_id: int|null, permission: array{resource: string, action: string}|list<array{resource: string, action: string}>|null}>
     */
    private const MENUS = [
        1 => ['name' => 'Dashboard',              'route' => '/dashboard',             'icon' => 'gauge-high',       'parent_id' => null, 'permission' => ['resource' => 'dashboard',           'action' => 'view']],
        // Incidencias group (parent header, no navegable)
        2 => ['name' => 'Incidencias',            'route' => null,                     'icon' => 'map-pin',          'parent_id' => null, 'permission' => null],
        3 => ['name' => 'Lista de Incidencias',   'route' => '/incidencias',           'icon' => 'list',             'parent_id' => 2,    'permission' => ['resource' => 'incidents',           'action' => 'view']],
        // Gestión group (admin area, parent header)
        7 => ['name' => 'Gestión',                'route' => null,                     'icon' => 'shield-halved',    'parent_id' => null, 'permission' => null],
        8 => ['name' => 'Usuarios',               'route' => '/usuarios',              'icon' => 'user',             'parent_id' => 7,    'permission' => ['resource' => 'users',               'action' => 'view']],
        9 => ['name' => 'Roles',                  'route' => '/roles',                 'icon' => 'shield',           'parent_id' => 7,    'permission' => ['resource' => 'roles',               'action' => 'view']],
        // Catálogos group (parent header)
        10 => ['name' => 'Catálogos',             'route' => null,                     'icon' => 'book-open',        'parent_id' => null, 'permission' => null],
        11 => ['name' => 'Ubicaciones',           'route' => '/localizaciones',        'icon' => 'map',              'parent_id' => 10,   'permission' => ['resource' => 'locations',           'action' => 'view']],
        12 => ['name' => 'Categorías',            'route' => '/categorias',            'icon' => 'tag',              'parent_id' => 10,   'permission' => ['resource' => 'incident-categories', 'action' => 'view']],
        13 => ['name' => 'Organizaciones',        'route' => '/organizaciones',        'icon' => 'building',         'parent_id' => 10,   'permission' => ['resource' => 'organizations',       'action' => 'view']],
        // Citizen entries (no parent header, flat at the root)
        16 => ['name' => 'Inicio',                'route' => '/feed',                  'icon' => 'house',            'parent_id' => null, 'permission' => ['resource' => 'feed',                'action' => 'view']],
        17 => ['name' => 'Reportar',              'route' => '/feed/crear',            'icon' => 'circle-plus',      'parent_id' => null, 'permission' => ['resource' => 'feed',                'action' => 'view']],
        18 => ['name' => 'Perfil',                'route' => '/configuracion/perfil',  'icon' => 'user',             'parent_id' => null, 'permission' => ['resource' => 'profile',             'action' => 'view']],
        // Mapa georreferenciado — single entry for every role now that
        // FeedController branches server-side by role instead of needing
        // two separate frontend components/routes (/mapa admin vs
        // /mapa-ciudadano citizen). Gated by EITHER incidents.view (staff)
        // OR feed.view (citizen) — whichever the role has, they see one
        // "Mapa" link, and the backend decides what data comes back.
        // Lives at the root so it shows up as a top-level citizen entry —
        // the Incidencias parent header would otherwise clutter the citizen
        // menu (they don't see Lista de Incidencias).
        19 => ['name' => 'Mapa',                  'route' => '/mapa',                  'icon' => 'map-location-dot', 'parent_id' => null, 'permission' => [
            ['resource' => 'incidents', 'action' => 'view'],
            ['resource' => 'feed', 'action' => 'view'],
        ]],
    ];

    public function run(): void
    {
        // Idempotent seed:
        //  1. Drop menus que ya no están en el array (data vieja huérfana)
        //  2. Drop menu_permission para esos menus
        //  3. Crear/actualizar cada menu del array
        //  4. Re-asignar menu_permission para los menus activos

        $keepIds = array_keys(self::MENUS);
        $toDelete = Menu::whereNotIn('menu_id', $keepIds)->pluck('menu_id')->all();
        if (! empty($toDelete)) {
            DB::table('menu_permission')->whereIn('menu_id', $toDelete)->delete();
            Menu::whereIn('menu_id', $toDelete)->delete();
        }

        // Clear remaining menu_permission for a clean re-assign
        DB::table('menu_permission')->delete();

        foreach (self::MENUS as $menuId => $data) {
            Menu::updateOrCreate(
                ['menu_id' => $menuId],
                [
                    'name' => $data['name'],
                    'route' => $data['route'],
                    'icon' => $data['icon'],
                    'parent_id' => $data['parent_id'],
                    'active' => true,
                ],
            );
        }

        $this->command?->info('Menús creados/actualizados.');

        $now = now();

        foreach (self::MENUS as $menuId => $data) {
            if ($data['permission'] === null) {
                continue;
            }

            // 'permission' is either a single {resource, action} spec or a
            // list of specs (see menu_id 19 "Mapa" — granted on EITHER
            // incidents.view OR feed.view). Normalize to a list either way.
            $specs = array_is_list($data['permission']) ? $data['permission'] : [$data['permission']];

            foreach ($specs as $spec) {
                $permission = Permission::where('resource', $spec['resource'])
                    ->where('action', $spec['action'])
                    ->first();

                if ($permission === null) {
                    $this->command?->warn("Permission {$spec['resource']}.{$spec['action']} not found — skipping menu {$menuId}.");

                    continue;
                }

                DB::table('menu_permission')->insert([
                    'menu_id' => $menuId,
                    'permission_id' => $permission->permission_id,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }

        $this->command?->info('Permisos de menú asignados.');
    }
}
