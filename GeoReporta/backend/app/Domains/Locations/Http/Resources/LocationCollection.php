<?php

declare(strict_types=1);

namespace App\Domains\Locations\Http\Resources;

use App\Domains\Shared\Http\Resources\PaginatedCollection;

class LocationCollection extends PaginatedCollection
{
    public $collects = LocationResource::class;
}
