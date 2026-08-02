<?php

declare(strict_types=1);

namespace App\Domains\Menus\Services;

use App\Domains\Menus\Models\Menu;
use App\Domains\Users\Models\User;
use Illuminate\Support\Collection;

class MenuService
{
    public function getMyMenus(User $user): array
    {
        if ($user->isAdmin()) {
            return $this->buildTree(
                Menu::where('active', true)->orderBy('menu_id')->get()
            );
        }

        $permissionIds = $user->role?->permissions()
            ->pluck('permissions.permission_id')
            ->toArray() ?? [];

        if (empty($permissionIds)) {
            return [];
        }

        /** @var Collection<int, Menu> $menuMap */
        $menuMap = Menu::where('active', true)
            ->whereHas('permissions', fn ($q) => $q->whereIn('permissions.permission_id', $permissionIds))
            ->orderBy('menu_id')
            ->get()
            ->keyBy('menu_id');

        // Walk up the tree to pull in ancestor menus
        $current = $menuMap->values();
        while ($current->isNotEmpty()) {
            $missingParentIds = $current
                ->pluck('parent_id')
                ->filter(fn ($id) => $id !== null && ! $menuMap->has($id))
                ->unique()
                ->values();

            if ($missingParentIds->isEmpty()) {
                break;
            }

            $parents = Menu::where('active', true)
                ->whereIn('menu_id', $missingParentIds)
                ->get()
                ->keyBy('menu_id');

            $menuMap = $menuMap->merge($parents);
            $current = $parents->values();
        }

        $tree = $this->buildTree($menuMap->sortKeys()->values());

        return $user->isOperator() ? $this->withOperatorDashboardRoute($tree) : $tree;
    }

    /** @param iterable<Menu> $menus */
    private function buildTree(iterable $menus): array
    {
        $map = [];
        foreach ($menus as $menu) {
            $map[$menu->menu_id] = [
                'id' => $menu->menu_id,
                'parent_id' => $menu->parent_id,
                'name' => $menu->name,
                'route' => $menu->route,
                'icon' => $menu->icon,
                'children' => [],
            ];
        }

        $tree = [];
        foreach ($map as $id => &$node) {
            $parentId = $node['parent_id'];
            if ($parentId !== null && isset($map[$parentId])) {
                $map[$parentId]['children'][] = &$node;
            } else {
                $tree[] = &$node;
            }
        }
        unset($node);

        // Filter out empty headers (no route, no children). These happen when
        // a parent menu (e.g., "Incidencias" group) has no visible children
        // after role-based filtering. Don't render empty section headers in UX.
        return $this->filterEmptyHeaders($tree);
    }

    private function withOperatorDashboardRoute(array $menus): array
    {
        return array_map(function (array $menu): array {
            if ($menu['route'] === '/dashboard') {
                $menu['route'] = '/operator/dashboard';
            }

            $menu['children'] = $this->withOperatorDashboardRoute($menu['children']);

            return $menu;
        }, $menus);
    }

    private function filterEmptyHeaders(array $menus): array
    {
        return array_values(array_filter(
            array_map(function ($node) {
                $node['children'] = $this->filterEmptyHeaders($node['children']);

                // Keep node if it has a route OR has children
                $hasRoute = $node['route'] !== null;
                $hasChildren = count($node['children']) > 0;

                return ($hasRoute || $hasChildren) ? $node : null;
            }, $menus),
            fn ($item) => $item !== null,
        ));
    }
}
