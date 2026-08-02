<?php

declare(strict_types=1);

namespace App\Domains\Roles\Http\Policies;

use App\Domains\Shared\Http\Policies\PermissionPolicy;

class RolePolicy extends PermissionPolicy
{
    protected function resource(): string
    {
        return 'roles';
    }
}
