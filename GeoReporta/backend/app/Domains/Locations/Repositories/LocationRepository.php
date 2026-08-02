<?php

declare(strict_types=1);

namespace App\Domains\Locations\Repositories;

use App\Domains\Locations\Models\Location;
use App\Domains\Shared\Repositories\Repository;
use Illuminate\Support\Collection;
use MatanYadaev\EloquentSpatial\Objects\Point;

interface LocationRepository extends Repository
{
    public function findByLevel(string $level): Collection;

    public function findByParent(int $parentId): Collection;

    public function findByPoint(Point $point): ?Location;

    public function ancestors(int $id): Collection;
}
