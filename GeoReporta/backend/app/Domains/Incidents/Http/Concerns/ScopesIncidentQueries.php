<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http\Concerns;

use App\Domains\Locations\Models\Location;
use App\Domains\Users\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\Auth;

/**
 * Shared scope/filter methods for incident queries.
 * Used by IncidentStatsController and IncidentWeeklyStatsController
 * to maintain consistent RBAC and location hierarchy handling.
 */
trait ScopesIncidentQueries
{
    /**
     * Apply location hierarchy filter to query builder (Query\Builder).
     * Resolves location descendants when filtering by parent (country → provinces → cities).
     */
    private function applyLocationFilter(QueryBuilder $query, string $filterType, int|string $locationId): QueryBuilder
    {
        $location = Location::find((int) $locationId);
        if ($location === null) {
            return $query;
        }

        $descendantIds = $location->descendantsAndSelf()
            ->pluck('id')
            ->toArray();

        return $query->whereIn('location_id', $descendantIds);
    }

    /**
     * Apply location hierarchy filter to Eloquent builder.
     * Mirrors applyLocationFilter for Eloquent queries.
     */
    private function applyLocationFilterEloquent(Builder $query, string $filterType, int|string $locationId): Builder
    {
        $location = Location::find((int) $locationId);
        if ($location === null) {
            return $query;
        }

        $descendantIds = $location->descendantsAndSelf()
            ->pluck('id')
            ->toArray();

        return $query->whereIn('location_id', $descendantIds);
    }

    /**
     * Mirrors the scoping in EloquentIncidentRepository::applyFilters
     * (REQ-RBAC-03) — this controller runs its own aggregate queries
     * instead of going through the repository, so the org boundary has
     * to be re-applied here or org-scoped roles see system-wide totals.
     *
     * @template TBuilder of \Illuminate\Database\Eloquent\Builder|\Illuminate\Database\Query\Builder
     *
     * @param  TBuilder  $query
     * @return TBuilder
     */
    private function applyOrgScope($query)
    {
        /** @var User|null $user */
        $user = Auth::user();

        if ($user !== null && ! $user->isSystemAdmin()) {
            if ($user->isOrganizationAdmin() || $user->isOperator()) {
                $query->where('organization_id', $user->organization_id);
            }
            if ($user->isRegularUser()) {
                $query->whereRaw('1 = 0');
            }
        }

        return $query;
    }
}
