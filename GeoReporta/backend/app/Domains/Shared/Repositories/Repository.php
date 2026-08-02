<?php

declare(strict_types=1);

namespace App\Domains\Shared\Repositories;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Model;

/**
 * @template TModel of Model
 */
interface Repository
{
    /**
     * @param  array<string, mixed>  $filters
     * @param  int  $perPage  Requested page size. Overridden by `$filters['per_page']` when present.
     * @param  int|null  $hardCap  Hard ceiling applied to the resolved per-page value.
     *                             Null falls back to the implementation default (100).
     *                             Endpoints that need >100 results (e.g. bbox-driven map fetches)
     *                             pass a higher value here.
     * @return LengthAwarePaginator<TModel>
     */
    public function paginate(
        array $filters = [],
        int $perPage = 20,
        ?int $hardCap = null,
    ): LengthAwarePaginator;

    /**
     * @return TModel|null
     */
    public function findById(int $id): ?Model;

    /**
     * @param  array<string, mixed>  $data
     * @return TModel
     */
    public function create(array $data): Model;

    /**
     * @param  array<string, mixed>  $data
     * @return TModel
     */
    public function update(int $id, array $data): Model;

    public function delete(int $id): void;
}
