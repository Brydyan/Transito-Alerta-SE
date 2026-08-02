<?php

declare(strict_types=1);

namespace App\Domains\IncidentCategories\Http\Resources;

use App\Domains\Shared\Http\Resources\PaginatedCollection;

class IncidentCategoryCollection extends PaginatedCollection
{
    public $collects = IncidentCategoryResource::class;
}
