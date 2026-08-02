<?php

declare(strict_types=1);

namespace App\Domains\Locations\Repositories;

use App\Domains\Locations\Models\Location;
use App\Domains\Shared\Repositories\EloquentRepository;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use MatanYadaev\EloquentSpatial\Objects\Point;

class EloquentLocationRepository extends EloquentRepository implements LocationRepository
{
    public function __construct()
    {
        parent::__construct(new Location);
    }

    public function findByLevel(string $level): Collection
    {
        return $this->newQuery()->where('level', $level)->get();
    }

    public function findByParent(int $parentId): Collection
    {
        return $this->newQuery()->where('parent_id', $parentId)->get();
    }

    public function findByPoint(Point $point): ?Location
    {
        // A point inside a cantón is necessarily also inside that cantón's
        // parent province (nested polygons), so more than one row can
        // legitimately match. Callers want the most specific one (e.g.
        // `LocationGeomConsistentRule` walks *up* from the match via
        // `ancestorsAndSelf()` — an arbitrary coarser match, like a
        // province instead of its cantón, would never contain a
        // deeper-level submitted `location_id` in that chain).
        return $this->newQuery()
            ->whereContains('geom', $point)
            ->orderByRaw("CASE level
                WHEN 'neighborhood' THEN 0
                WHEN 'city' THEN 1
                WHEN 'province' THEN 2
                WHEN 'country' THEN 3
                ELSE 4
            END")
            ->first();
    }

    /**
     * Returns the ordered ancestor chain (root-to-leaf) for the given location.
     *
     * Uses the HasRecursiveRelationships trait's ancestorsAndSelf() but enforces
     * ascending depth order (root first, self last) for deterministic cascade
     * preselection in organization and incident detail responses.
     *
     * @see Location::ancestorsAndSelf()
     */
    public function ancestors(int $id): Collection
    {
        $location = $this->findById($id);

        if ($location === null) {
            return new Collection;
        }

        // ancestorsAndSelf() returns root first, self last in the collection
        // when ordered by depth ASC
        return $location->ancestorsAndSelf()
            ->orderBy('depth', 'asc')
            ->get();
    }

    protected function applyFilters(Builder $query, array $filters): void
    {
        $query
            ->when($filters['search'] ?? null, fn (Builder $query, string $value) => $query->where(function (Builder $query) use ($value) {
                $query->where('name', 'LIKE', "%{$value}%")
                    ->orWhere('code', 'LIKE', "%{$value}%");
            }))
            ->when($filters['level'] ?? null, fn (Builder $query, string $value) => $query->where('level', $value))
            ->when($filters['parent_id'] ?? null, fn (Builder $query, string $value) => $query->where('parent_id', $value));
    }
}
