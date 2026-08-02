<?php

declare(strict_types=1);

namespace App\Domains\Roles\Http\Resources;

use App\Domains\Shared\Http\Resources\PaginatedCollection;

class RoleCollection extends PaginatedCollection
{
    public $collects = RoleResource::class;
}
