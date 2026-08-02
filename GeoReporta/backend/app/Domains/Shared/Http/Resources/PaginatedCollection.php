<?php

declare(strict_types=1);

namespace App\Domains\Shared\Http\Resources;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\ResourceCollection;

abstract class PaginatedCollection extends ResourceCollection
{
    public function toResponse($request): JsonResponse
    {
        $paginated = $this->resource->toArray();

        $meta = isset($paginated['current_page']) ? [
            'current_page' => $paginated['current_page'],
            'per_page' => $paginated['per_page'],
            'total' => $paginated['total'],
            'last_page' => $paginated['last_page'],
            'from' => $paginated['from'],
            'to' => $paginated['to'],
            'next_page_url' => $paginated['next_page_url'] ?? null,
        ] : [
            'current_page' => 1,
            'per_page' => count($this->collection),
            'total' => count($this->collection),
            'last_page' => 1,
            'from' => count($this->collection) > 0 ? 1 : null,
            'to' => count($this->collection),
        ];

        return response()->json([
            'data' => $this->collection,
            'meta' => $meta,
        ]);
    }
}
