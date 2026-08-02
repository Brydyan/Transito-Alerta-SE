<?php

declare(strict_types=1);

namespace App\Domains\IncidentCategories\Repositories;

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Shared\Repositories\EloquentRepository;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class EloquentIncidentCategoryRepository extends EloquentRepository implements IncidentCategoryRepository
{
    public function __construct()
    {
        parent::__construct(new IncidentCategory);
    }

    protected function paginateRelations(): array
    {
        return ['parent'];
    }

    public function tree(): Collection
    {
        return $this->newQuery()
            ->whereNull('parent_id')
            ->with('children.children')
            ->get();
    }

    protected function applyFilters(Builder $query, array $filters): void
    {
        $query
            ->when($filters['search'] ?? null, fn (Builder $q, string $v) => $q->where('name', 'LIKE', "%{$v}%"))
            ->when($filters['parent_id'] ?? null, fn (Builder $q, string $v) => $q->where('parent_id', $v));
    }
}
