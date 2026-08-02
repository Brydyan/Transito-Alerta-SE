<?php

declare(strict_types=1);

namespace App\Domains\Users\Http\Resources;

use App\Domains\Shared\Http\Resources\PaginatedCollection;

class UserCollection extends PaginatedCollection
{
    public $collects = UserResource::class;
}
