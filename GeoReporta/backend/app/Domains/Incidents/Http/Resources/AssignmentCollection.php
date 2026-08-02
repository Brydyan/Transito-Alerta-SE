<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http\Resources;

use App\Domains\Shared\Http\Resources\PaginatedCollection;

/**
 * Paginated wrapper for AssignmentResource. Mirrors CommentCollection's
 * shape (`data` + `meta`) so the front-end can reuse the same helper
 * for any resource list (tasks #2.1, #2.2, #2.3 of PR #3 will
 * consolidate this on the client side).
 */
class AssignmentCollection extends PaginatedCollection
{
    public $collects = AssignmentResource::class;
}
