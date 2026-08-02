<?php

declare(strict_types=1);

namespace App\Domains\Users\Http\Policies;

use App\Domains\Shared\Http\Policies\PermissionPolicy;
use App\Domains\Users\Models\User;
use Illuminate\Database\Eloquent\Model;

class UserPolicy extends PermissionPolicy
{
    protected function resource(): string
    {
        return 'users';
    }

    public function view(User $user, Model $model): bool
    {
        if ($user->isSystemAdmin()) {
            return true;
        }

        // Si es Admin u Operador de Org, solo ve usuarios de su misma org
        if ($user->isOrganizationAdmin() || $user->isOperator()) {
            return $user->can('users.view') && $user->organization_id === $model->organization_id;
        }

        return $user->id === $model->id;
    }

    public function update(User $user, Model $model): bool
    {
        if ($user->isSystemAdmin()) {
            return true;
        }

        // Si es Admin de Org, puede editar a miembros de su misma org (incluyéndose a sí mismo)
        if ($user->isOrganizationAdmin()) {
            return $user->can('users.update') && $user->organization_id === $model->organization_id;
        }

        return $user->id === $model->id;
    }

    public function delete(User $user, Model $model): bool
    {
        if ($user->isSystemAdmin()) {
            return true;
        }

        if ($user->isOrganizationAdmin()) {
            return $user->can('users.delete') && $user->organization_id === $model->organization_id;
        }

        return false;
    }
}
