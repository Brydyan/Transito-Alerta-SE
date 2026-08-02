<?php

declare(strict_types=1);

namespace App\Domains\IncidentCategories\Http\Policies;

use App\Domains\Shared\Http\Policies\PermissionPolicy;

class IncidentCategoryPolicy extends PermissionPolicy
{
    protected function resource(): string
    {
        return 'incident-categories';
    }
}
