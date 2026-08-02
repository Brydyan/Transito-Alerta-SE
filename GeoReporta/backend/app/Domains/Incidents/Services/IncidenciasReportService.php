<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Services;

use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Users\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\LazyCollection;

/**
 * Builds the filtered query that powers `GET /api/incidencias/export`.
 *
 * The filter logic mirrors `IncidentStatsController` because the dashboard
 * "Exportar" button should hand the user the same rows they see on screen.
 * We intentionally duplicate the small set of helpers (org scope + location
 * expansion) here rather than refactoring the existing controller — those
 * two callers will keep diverging in their needs and a shared trait would
 * just become a magnet for accidental coupling.
 */
class IncidenciasReportService
{
    /**
     * Localised column headers used by every exporter.
     *
     * @return list<string>
     */
    public function columns(): array
    {
        return [
            'ID',
            'Título',
            'Estado',
            'Prioridad',
            'Categoría',
            'Organización',
            'Ubicación',
            'Reportado por',
            'Creada',
            'Resuelta',
        ];
    }

    /**
     * Run the filtered query and yield rows to the caller. We use `lazy()`
     * so we don't materialise the full collection — the StreamedResponse
     * consumes rows one at a time and the DB cursor streams from PG/SQLite.
     *
     * @param  array<string, mixed>  $filters  Validated query params (inicio, fin, tipo_id, ciudad_id, provincia_id, pais_id)
     * @param  int  $hardCap  Maximum rows to yield (caller's exporter-specific limit)
     * @return LazyCollection<int, Incident>
     */
    public function filteredIncidents(array $filters, int $hardCap): LazyCollection
    {
        $query = $this->baseQuery($filters);

        return $query->with(['category', 'organization', 'location', 'user'])
            ->orderByDesc('created_at')
            ->lazy($hardCap);
    }

    /**
     * Total count under the same filters, used to log a warning when the
     * dataset was larger than the exporter's hard cap.
     *
     * @param  array<string, mixed>  $filters
     */
    public function countFiltered(array $filters): int
    {
        return $this->baseQuery($filters)->count();
    }

    /**
     * Build the base query (org scope + filters) without the eager loads
     * or ordering — shared by `filteredIncidents()` and `countFiltered()`.
     *
     * @param  array<string, mixed>  $filters
     */
    private function baseQuery(array $filters): Builder
    {
        $query = Incident::query()->whereNull('deleted_at');

        $this->applyOrgScope($query);

        if (! empty($filters['inicio'])) {
            $query->whereDate('created_at', '>=', (string) $filters['inicio']);
        }

        if (! empty($filters['fin'])) {
            $query->whereDate('created_at', '<=', (string) $filters['fin']);
        }

        if (! empty($filters['tipo_id'])) {
            $query->where('incident_category_id', (int) $filters['tipo_id']);
        }

        if (! empty($filters['ciudad_id'])) {
            $this->applyLocationFilter($query, (int) $filters['ciudad_id']);
        }

        if (! empty($filters['provincia_id'])) {
            $this->applyLocationFilter($query, (int) $filters['provincia_id']);
        }

        if (! empty($filters['pais_id'])) {
            $this->applyLocationFilter($query, (int) $filters['pais_id']);
        }

        return $query;
    }

    /**
     * Mirror of IncidentStatsController::applyOrgScope — see that method
     * for the RBAC rationale. Re-applied here because this query bypasses
     * EloquentIncidentRepository and would otherwise leak system-wide rows
     * to org-scoped roles.
     */
    private function applyOrgScope(Builder $query): Builder
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

    /**
     * Mirror of IncidentStatsController::applyLocationFilterEloquent.
     * Expands a single location id into its descendants so filtering by
     * "country" matches every city nested under it.
     */
    private function applyLocationFilter(Builder $query, int $locationId): Builder
    {
        $location = Location::find($locationId);

        if ($location === null) {
            return $query;
        }

        $descendantIds = $location->descendantsAndSelf()->pluck('id')->toArray();

        return $query->whereIn('location_id', $descendantIds);
    }

    /**
     * Friendly summary of the active filters for the PDF header.
     *
     * @param  array<string, mixed>  $filters
     * @return array<int, string>
     */
    public function describeFilters(array $filters): array
    {
        $out = [];

        if (! empty($filters['inicio']) || ! empty($filters['fin'])) {
            $out[] = sprintf(
                'Período: %s → %s',
                $filters['inicio'] ?? '—',
                $filters['fin'] ?? '—',
            );
        }

        if (! empty($filters['tipo_id'])) {
            $out[] = 'Tipo #'.(int) $filters['tipo_id'];
        }

        foreach (['pais_id' => 'País', 'provincia_id' => 'Provincia', 'ciudad_id' => 'Ciudad'] as $key => $label) {
            if (! empty($filters[$key])) {
                $out[] = "{$label} #".(int) $filters[$key];
            }
        }

        return $out;
    }

    /**
     * Log a structured warning when the dataset was larger than the cap.
     * Helps ops detect "users want bigger exports" without bloating logs
     * on every successful small export.
     */
    public function logTruncationIfNeeded(int $total, int $hardCap, string $format): void
    {
        if ($total <= $hardCap) {
            return;
        }

        Log::warning('incidents.export.truncated', [
            'format' => $format,
            'total' => $total,
            'hard_cap' => $hardCap,
            'exported' => $hardCap,
        ]);
    }
}
