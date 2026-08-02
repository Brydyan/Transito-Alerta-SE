<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http\Resources;

use App\Domains\Shared\Http\Resources\PaginatedCollection;

class IncidentCollection extends PaginatedCollection
{
    public $collects = IncidentResource::class;
}
