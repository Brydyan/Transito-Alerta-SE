<?php

declare(strict_types=1);

namespace App\Domains\Organizations\Http\Resources;

use App\Domains\Shared\Http\Resources\PaginatedCollection;

class OrganizationCollection extends PaginatedCollection
{
    public $collects = OrganizationResource::class;
}
