<?php

declare(strict_types=1);

namespace App\Domains\Roles\Repositories;

use App\Domains\Shared\Repositories\Repository;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

interface RoleRepository extends Repository
{
    /**
     * Reemplaza el conjunto de permisos del rol.
     *
     * @param  array<int>  $permissionIds  IDs de Permission (permission_id)
     * @return Model El rol con permisos ya sincronizados
     */
    public function syncPermissions(int $roleId, array $permissionIds): Model;

    /**
     * Catálogo plano id/name (ordenado por nombre) para selects de formularios.
     *
     * @return Collection<int, array{id: int, name: string}>
     */
    public function catalog(): Collection;
}
