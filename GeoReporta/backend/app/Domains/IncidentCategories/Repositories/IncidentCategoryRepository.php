<?php

declare(strict_types=1);

namespace App\Domains\IncidentCategories\Repositories;

use App\Domains\Shared\Repositories\Repository;
use Illuminate\Support\Collection;

interface IncidentCategoryRepository extends Repository
{
    public function tree(): Collection;
}
