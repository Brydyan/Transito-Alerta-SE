<?php

declare(strict_types=1);

namespace App\Domains\Comments\Http\Resources;

use App\Domains\Shared\Http\Resources\PaginatedCollection;

class CommentCollection extends PaginatedCollection
{
    public $collects = CommentResource::class;
}
