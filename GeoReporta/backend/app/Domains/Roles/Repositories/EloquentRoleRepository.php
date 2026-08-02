<?php

declare(strict_types=1);

namespace App\Domains\Roles\Repositories;

use App\Domains\Roles\Models\Role;
use App\Domains\Roles\Models\RolePermission;
use App\Domains\Shared\Repositories\EloquentRepository;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class EloquentRoleRepository extends EloquentRepository implements RoleRepository
{
    public function __construct()
    {
        parent::__construct(new Role);
    }

    public function applyFilters(Builder $query, array $filters): void
    {
        $query->when(
            $filters['search'] ?? null,
            fn (Builder $query, string $value) => $query->where('name', 'LIKE', "%{$value}%")
        );
    }

    public function catalog(): Collection
    {
        return $this->newQuery()
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn (Role $r) => ['id' => $r->id, 'name' => $r->name])
            ->values();
    }

    public function syncPermissions(int $roleId, array $permissionIds): Model
    {
        $role = $this->findById($roleId);

        if ($role === null) {
            throw new \RuntimeException("Role with ID {$roleId} not found.", 404);
        }

        $now = now();

        // Obtener permisos actuales (solo activos, no soft-deleted)
        $current = $role->permissions()
            ->wherePivotNull('deleted_at')
            ->pluck('role_permission.permission_id')
            ->toArray();
        $toAdd = array_diff($permissionIds, $current);
        $toRemove = array_diff($current, $permissionIds);

        // Soft delete permisos que no están en la nueva lista
        if (! empty($toRemove)) {
            $role->permissions()->detach($toRemove);
        }

        // Identificar permisos reasignados (que fueron deletrados y ahora se vuelven a agregar)
        $reasigned = [];
        if (! empty($toAdd)) {
            $reasigned = RolePermission::withTrashed()
                ->where('role_id', $roleId)
                ->whereIn('permission_id', $toAdd)
                ->whereNotNull('deleted_at')
                ->pluck('permission_id')
                ->toArray();

            // Force delete registros soft-deleted que van a ser reasignados
            if (! empty($reasigned)) {
                RolePermission::withTrashed()
                    ->where('role_id', $roleId)
                    ->whereIn('permission_id', $reasigned)
                    ->whereNotNull('deleted_at')
                    ->forceDelete();
            }
        }

        // Agregar nuevos permisos (solo reassigned_at si es reasignado, NULL si es nuevo)
        if (! empty($toAdd)) {
            $rows = collect($toAdd)
                ->map(fn ($permissionId) => [
                    'role_id' => $roleId,
                    'permission_id' => $permissionId,
                    'created_at' => $now,
                    'updated_at' => $now,
                    'reassigned_at' => in_array($permissionId, $reasigned) ? $now : null,
                ])
                ->all();

            DB::table('role_permission')->insert($rows);
        }

        // Actualizar updated_at de permisos que se mantienen (no se modifican)
        $toKeep = array_intersect($current, $permissionIds);
        if (! empty($toKeep)) {
            DB::table('role_permission')
                ->where('role_id', $roleId)
                ->whereIn('permission_id', $toKeep)
                ->whereNull('deleted_at')
                ->update(['updated_at' => $now]);
        }

        return $role->load('permissions');
    }
}
