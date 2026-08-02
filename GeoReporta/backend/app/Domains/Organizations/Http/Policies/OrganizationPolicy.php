<?php

declare(strict_types=1);

namespace App\Domains\Organizations\Http\Policies;

use App\Domains\Shared\Http\Policies\PermissionPolicy;
use App\Domains\Users\Models\User;
use Illuminate\Database\Eloquent\Model;

class OrganizationPolicy extends PermissionPolicy
{
    protected function resource(): string
    {
        return 'organizations';
    }

    public function view(User $user, Model $model): bool
    {
        if ($user->isSystemAdmin()) {
            return true;
        }

        return $user->can('organizations.view') && $user->organization_id === $model->id;
    }

    public function update(User $user, Model $model): bool
    {
        if ($user->isSystemAdmin()) {
            return true;
        }

        return $user->can('organizations.update') && $user->organization_id === $model->id;
    }
}
