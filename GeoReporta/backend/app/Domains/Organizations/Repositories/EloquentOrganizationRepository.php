<?php

declare(strict_types=1);

namespace App\Domains\Organizations\Repositories;

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Shared\Repositories\EloquentRepository;
use App\Domains\Users\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;

class EloquentOrganizationRepository extends EloquentRepository implements OrganizationRepository
{
    public function __construct()
    {
        parent::__construct(new Organization);
    }

    protected function paginateRelations(): array
    {
        return ['location', 'parent', 'category'];
    }

    public function findById(int $id): ?Organization
    {
        return $this->newQuery()->with('category')->find($id);
    }

    public function findForLocation(int $locationId, ?int $categoryId = null): ?Organization
    {
        $location = Location::find($locationId);
        if ($location === null) {
            return null;
        }

        $locationIds = $location->ancestorsAndSelf()->pluck('id');

        /** @var Organization|null */
        return $this->newQuery()
            ->whereIn('location_id', $locationIds)
            ->when($categoryId !== null, function (Builder $q) use ($categoryId) {
                $q->where(function (Builder $sub) use ($categoryId) {
                    $sub->whereIn('incident_category_id', $this->categoryAncestorIds($categoryId))
                        ->orWhereNull('incident_category_id');
                });
            })
            ->orderBy('id')
            ->first();
    }

    public function findNotifiedFor(int $locationId, int $categoryId): Collection
    {
        $location = Location::find($locationId);
        if ($location === null) {
            return collect();
        }

        $locationIds = $location->ancestorsAndSelf()->pluck('id');

        // An org "ate" the notification if its location covers the incident
        // and (its category covers the incident category OR it handles any
        // category). Category coverage follows the same ancestry rule used
        // for locations: an org configured for a root category (e.g.
        // "Infraestructura Vial") also covers its subcategories (e.g.
        // "Baches y Hundimientos"). The NULL branch is intentional: orgs
        // transversales (e.g. "GAD Municipal") must surface here even when
        // the incident has a specific category.
        return $this->newQuery()
            ->whereIn('location_id', $locationIds)
            ->where(function ($q) use ($categoryId) {
                $q->whereIn('incident_category_id', $this->categoryAncestorIds($categoryId))
                    ->orWhereNull('incident_category_id');
            })
            ->orderBy('id')
            ->get();
    }

    /**
     * Category ids in the ancestry chain of the given category, including
     * itself (mirrors `Location::ancestorsAndSelf`). Orgs configured for a
     * parent category cover all of its subcategories.
     *
     * @return array<int, int>
     */
    private function categoryAncestorIds(int $categoryId): array
    {
        $ids = [];
        $current = IncidentCategory::find($categoryId);

        while ($current !== null) {
            $ids[] = $current->id;
            $current = $current->parent;
        }

        return $ids;
    }

    public function catalog(bool $withParent = false): Collection
    {
        $columns = $withParent ? ['id', 'name', 'parent_id'] : ['id', 'name'];

        return $this->newQuery()
            ->orderBy('name')
            ->get($columns)
            ->map(fn (Organization $o) => array_intersect_key($o->toArray(), array_flip($columns)))
            ->values();
    }

    public function tree(): Collection
    {
        $query = $this->newQuery();

        /** @var User|null $user */
        $user = Auth::user();
        if ($user !== null && ! $user->isSystemAdmin()) {
            if ($user->isOrganizationMember()) {
                $query->where('id', $user->organization_id);
            } else {
                $query->whereRaw('1 = 0');
            }
        } else {
            $query->whereNull('parent_id');
        }

        return $query
            ->with('location', 'category', 'children.children.children')
            ->get();
    }

    protected function applyFilters(Builder $query, array $filters): void
    {
        // Scoping por organización (Multitenancy)
        /** @var User|null $user */
        $user = Auth::user();
        if ($user !== null && ! $user->isSystemAdmin()) {
            if ($user->isOrganizationMember()) {
                $query->where('id', $user->organization_id);
            } else {
                $query->whereRaw('1 = 0');
            }
        }

        $query
            ->when($filters['search'] ?? null, fn (Builder $q, string $v) => $q->where('name', 'LIKE', "%{$v}%"))
            ->when($filters['location_id'] ?? null, function (Builder $q, string $v) {
                $location = Location::find((int) $v);
                if ($location) {
                    $ids = $location->descendantsAndSelf()->pluck('id');
                    $q->whereIn('location_id', $ids);
                }
            });
    }
}
