<?php

declare(strict_types=1);

namespace App\Domains\Locations\Enums;

enum LocationLevel: string
{
    case Country = 'country';
    case Province = 'province';
    case City = 'city';
    case Neighborhood = 'neighborhood';
}
