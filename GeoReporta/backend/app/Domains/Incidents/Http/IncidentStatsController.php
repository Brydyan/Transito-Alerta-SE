<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http;

use App\Domains\Incidents\Enums\IncidentPriority;
use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Http\Concerns\ScopesIncidentQueries;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Aggregates incident counts for the dashboard.
 *
 * Mirrors the English enum values exposed by `IncidentStatus` and
 * `IncidentPriority` so the frontend can read them by name without an
 * extra lookup. Known enum values are always present in the response
 * (zero-filled if no rows exist) so consumers can rely on the shape.
 */
class IncidentStatsController extends Controller
{
    use ScopesIncidentQueries;

    private const int CACHE_TTL_SECONDS = 3600; // 1 hour

    public function __invoke(Request $request): JsonResponse
    {
        // Solo roles con dashboard.view pueden acceder a estadísticas.
        // Define qué aparece en el menú; si algún día se abre a más roles,
        // alcanza con asignar dashboard.view en RolePermissionSeeder.
        if (! $request->user()?->can('dashboard.view')) {
            abort(403, 'No tienes permiso para ver las estadísticas.');
        }

        $validated = $request->validate([
            'inicio' => 'nullable|date_format:Y-m-d',
            'fin' => 'nullable|date_format:Y-m-d|after_or_equal:inicio',
            'tipo_id' => 'nullable|integer|exists:incident_categories,id',
            'ciudad_id' => 'nullable|integer|exists:locations,id',
            'provincia_id' => 'nullable|integer|exists:locations,id',
            'pais_id' => 'nullable|integer|exists:locations,id',
        ], [
            'inicio.date_format' => 'La fecha ingresada no es válida. Use el formato DD/MM/AAAA.',
            'fin.date_format' => 'La fecha ingresada no es válida. Use el formato DD/MM/AAAA.',
        ]);

        $cacheKey = $this->buildStatsCacheKey($request->user(), $validated);

        $stats = Cache::tags(['incident-stats'])->remember($cacheKey, self::CACHE_TTL_SECONDS, function () use ($validated) {
            return $this->computeStats($validated);
        });

        return response()->json($stats);
    }

    /**
     * Build a cache key that accounts for org scope and filter parameters.
     */
    private function buildStatsCacheKey(?User $user, array $validated): string
    {
        $orgScope = $this->getOrgScopeKey($user);
        $filterHash = hash('xxh3', serialize($validated));

        return "incident-stats:{$orgScope}:{$filterHash}";
    }

    /**
     * Get the org scope key for the current user.
     */
    private function getOrgScopeKey(?User $user): string
    {
        if ($user === null) {
            return 'anonymous';
        }

        return match (true) {
            $user->isSystemAdmin() => 'system',
            $user->isOrganizationAdmin(), $user->isOperator() => 'org:'.$user->organization_id,
            default => 'user:'.$user->id,
        };
    }

    /**
     * Compute all stats — wrapped by Cache::remember in __invoke.
     *
     * @param  array{inicio?: string, fin?: string, tipo_id?: int, ciudad_id?: int, provincia_id?: int, pais_id?: int}  $validated
     * @return array{total: int, by_status: array, by_priority: array, recent_count: int, locations_count: int, average_resolution_time: array|null}
     */
    private function computeStats(array $validated): array
    {
        $driver = DB::connection()->getDriverName();
        if ($driver === 'pgsql') {
            $averageSeconds = $this->applyOrgScope(
                DB::table('incidents')
                    ->whereNull('deleted_at')
                    ->where('status', IncidentStatus::Resolved->value)
                    ->whereNotNull('resolution_date')
                    ->whereRaw('resolution_date >= created_at'),
            )
                ->when($validated['inicio'] ?? null, fn (QueryBuilder $q) => $q->whereDate('created_at', '>=', $validated['inicio']))
                ->when($validated['fin'] ?? null, fn (QueryBuilder $q) => $q->whereDate('created_at', '<=', $validated['fin']))
                ->when($validated['tipo_id'] ?? null, fn (QueryBuilder $q) => $q->where('incident_category_id', $validated['tipo_id']))
                ->when($validated['ciudad_id'] ?? null, fn (QueryBuilder $q) => $this->applyLocationFilter($q, 'ciudad_id', $validated['ciudad_id']))
                ->when($validated['provincia_id'] ?? null, fn (QueryBuilder $q) => $this->applyLocationFilter($q, 'provincia_id', $validated['provincia_id']))
                ->when($validated['pais_id'] ?? null, fn (QueryBuilder $q) => $this->applyLocationFilter($q, 'pais_id', $validated['pais_id']))
                ->value(DB::raw('AVG(EXTRACT(EPOCH FROM (resolution_date - created_at)))'));
        } else { // sqlite
            $averageSeconds = $this->applyOrgScope(
                DB::table('incidents')
                    ->whereNull('deleted_at')
                    ->where('status', IncidentStatus::Resolved->value)
                    ->whereNotNull('resolution_date')
                    ->whereRaw('resolution_date >= created_at'),
            )
                ->when($validated['inicio'] ?? null, fn (QueryBuilder $q) => $q->whereDate('created_at', '>=', $validated['inicio']))
                ->when($validated['fin'] ?? null, fn (QueryBuilder $q) => $q->whereDate('created_at', '<=', $validated['fin']))
                ->when($validated['tipo_id'] ?? null, fn (QueryBuilder $q) => $q->where('incident_category_id', $validated['tipo_id']))
                ->when($validated['ciudad_id'] ?? null, fn (QueryBuilder $q) => $this->applyLocationFilter($q, 'ciudad_id', $validated['ciudad_id']))
                ->when($validated['provincia_id'] ?? null, fn (QueryBuilder $q) => $this->applyLocationFilter($q, 'provincia_id', $validated['provincia_id']))
                ->when($validated['pais_id'] ?? null, fn (QueryBuilder $q) => $this->applyLocationFilter($q, 'pais_id', $validated['pais_id']))
                ->value(DB::raw("AVG(strftime('%s', resolution_date) - strftime('%s', created_at))"));
        }

        $averageResolutionTime = null;
        if ($averageSeconds !== null) {
            $averageSeconds = (float) $averageSeconds;
            $days = (int) floor($averageSeconds / 86400);
            $hours = (int) floor(($averageSeconds % 86400) / 3600);
            $averageResolutionTime = [
                'formatted' => "{$days}d {$hours}h",
                'days' => $days,
                'hours' => $hours,
                'seconds' => (int) round($averageSeconds),
            ];
        }

        return [
            'total' => $this->applyOrgScope(Incident::query())
                ->when($validated['inicio'] ?? null, fn (Builder $q) => $q->whereDate('created_at', '>=', $validated['inicio']))
                ->when($validated['fin'] ?? null, fn (Builder $q) => $q->whereDate('created_at', '<=', $validated['fin']))
                ->when($validated['tipo_id'] ?? null, fn (Builder $q) => $q->where('incident_category_id', $validated['tipo_id']))
                ->when($validated['ciudad_id'] ?? null, fn (Builder $q) => $this->applyLocationFilterEloquent($q, 'ciudad_id', $validated['ciudad_id']))
                ->when($validated['provincia_id'] ?? null, fn (Builder $q) => $this->applyLocationFilterEloquent($q, 'provincia_id', $validated['provincia_id']))
                ->when($validated['pais_id'] ?? null, fn (Builder $q) => $this->applyLocationFilterEloquent($q, 'pais_id', $validated['pais_id']))
                ->count(),
            'by_status' => $this->groupCounts('status', IncidentStatus::values(), $validated),
            'by_priority' => $this->groupCounts('priority', IncidentPriority::values(), $validated),
            'recent_count' => $this->applyOrgScope(
                Incident::query()->where('created_at', '>=', now()->subDays(7)),
            )
                ->when($validated['tipo_id'] ?? null, fn (Builder $q) => $q->where('incident_category_id', $validated['tipo_id']))
                ->when($validated['ciudad_id'] ?? null, fn (Builder $q) => $this->applyLocationFilterEloquent($q, 'ciudad_id', $validated['ciudad_id']))
                ->when($validated['provincia_id'] ?? null, fn (Builder $q) => $this->applyLocationFilterEloquent($q, 'provincia_id', $validated['provincia_id']))
                ->when($validated['pais_id'] ?? null, fn (Builder $q) => $this->applyLocationFilterEloquent($q, 'pais_id', $validated['pais_id']))
                ->count(),
            'locations_count' => $this->applyOrgScope(
                Incident::query()->whereNotNull('location_id'),
            )
                ->when($validated['inicio'] ?? null, fn (Builder $q) => $q->whereDate('created_at', '>=', $validated['inicio']))
                ->when($validated['fin'] ?? null, fn (Builder $q) => $q->whereDate('created_at', '<=', $validated['fin']))
                ->when($validated['tipo_id'] ?? null, fn (Builder $q) => $q->where('incident_category_id', $validated['tipo_id']))
                ->when($validated['ciudad_id'] ?? null, fn (Builder $q) => $this->applyLocationFilterEloquent($q, 'ciudad_id', $validated['ciudad_id']))
                ->when($validated['provincia_id'] ?? null, fn (Builder $q) => $this->applyLocationFilterEloquent($q, 'provincia_id', $validated['provincia_id']))
                ->when($validated['pais_id'] ?? null, fn (Builder $q) => $this->applyLocationFilterEloquent($q, 'pais_id', $validated['pais_id']))
                ->distinct()
                ->count('location_id'),
            'average_resolution_time' => $averageResolutionTime,
            'trends' => $this->calculateTrends($validated),
            'top_categories' => $this->getTopCategories($validated),
        ];
    }

    /**
     * Build a count map for the given column, zero-filling any known
     * values that did not appear in the aggregate query.
     */
    private function groupCounts(string $column, array $knownValues, array $validated = []): array
    {
        $rows = $this->applyOrgScope(
            DB::table('incidents')->whereNull('deleted_at'),
        )
            ->when($validated['inicio'] ?? null, fn (QueryBuilder $q) => $q->whereDate('created_at', '>=', $validated['inicio']))
            ->when($validated['fin'] ?? null, fn (QueryBuilder $q) => $q->whereDate('created_at', '<=', $validated['fin']))
            ->when($validated['tipo_id'] ?? null, fn (QueryBuilder $q) => $q->where('incident_category_id', $validated['tipo_id']))
            ->when($validated['ciudad_id'] ?? null, fn (QueryBuilder $q) => $this->applyLocationFilter($q, 'ciudad_id', $validated['ciudad_id']))
            ->when($validated['provincia_id'] ?? null, fn (QueryBuilder $q) => $this->applyLocationFilter($q, 'provincia_id', $validated['provincia_id']))
            ->when($validated['pais_id'] ?? null, fn (QueryBuilder $q) => $this->applyLocationFilter($q, 'pais_id', $validated['pais_id']))
            ->selectRaw("{$column} as key, COUNT(*) as count")
            ->groupBy($column)
            ->get();

        $counts = array_fill_keys($knownValues, 0);
        foreach ($rows as $row) {
            if (in_array($row->key, $knownValues, true)) {
                $counts[$row->key] = (int) $row->count;
            }
        }

        return $counts;
    }

    /**
     * Calculate trends vs previous period.
     * Compares current-period totals and pendientes against the same-length period immediately before.
     * Resolution rate is derived from current period (resueltas/total*100).
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, float|int|null>
     */
    private function calculateTrends(array $validated): array
    {
        // Determine current period
        if (! empty($validated['inicio']) || ! empty($validated['fin'])) {
            $currentStart = ! empty($validated['inicio'])
                ? Carbon::createFromFormat('Y-m-d', $validated['inicio'])->startOfDay()
                : Carbon::createFromFormat('Y-m-d', $validated['fin'])->subDays(30)->startOfDay();

            $currentEnd = ! empty($validated['fin'])
                ? Carbon::createFromFormat('Y-m-d', $validated['fin'])->endOfDay()
                : now();
        } else {
            $currentStart = now()->startOfMonth();
            $currentEnd = now();
        }

        $daysInPeriod = max(1, (int) $currentStart->diffInDays($currentEnd) + 1);
        $previousStart = $currentStart->copy()->subDays($daysInPeriod);
        $previousEnd = $currentStart->copy()->subSecond();

        // Fetch current period totals
        $pendingStatus = IncidentStatus::Pending->value;
        $resolvedStatus = IncidentStatus::Resolved->value;

        $current = $this->applyOrgScope(
            DB::table('incidents')->whereNull('deleted_at')
        )
            ->whereBetween('created_at', [$currentStart, $currentEnd])
            ->when(! empty($validated['tipo_id']), fn (QueryBuilder $q) => $q->where('incident_category_id', $validated['tipo_id']))
            ->when(! empty($validated['ciudad_id']), fn (QueryBuilder $q) => $this->applyLocationFilter($q, 'ciudad_id', $validated['ciudad_id']))
            ->when(! empty($validated['provincia_id']), fn (QueryBuilder $q) => $this->applyLocationFilter($q, 'provincia_id', $validated['provincia_id']))
            ->when(! empty($validated['pais_id']), fn (QueryBuilder $q) => $this->applyLocationFilter($q, 'pais_id', $validated['pais_id']))
            ->selectRaw(
                "COUNT(*) as total,
                 SUM(CASE WHEN status = '{$pendingStatus}' THEN 1 ELSE 0 END) as pendientes,
                 SUM(CASE WHEN status = '{$resolvedStatus}' THEN 1 ELSE 0 END) as resueltas"
            )
            ->first();

        $currentTotal = (int) ($current->total ?? 0);
        $currentPendientes = (int) ($current->pendientes ?? 0);
        $currentResueltas = (int) ($current->resueltas ?? 0);

        // Fetch previous period totals (same filters)
        $previous = $this->applyOrgScope(
            DB::table('incidents')->whereNull('deleted_at')
        )
            ->whereBetween('created_at', [$previousStart, $previousEnd])
            ->when(! empty($validated['tipo_id']), fn (QueryBuilder $q) => $q->where('incident_category_id', $validated['tipo_id']))
            ->when(! empty($validated['ciudad_id']), fn (QueryBuilder $q) => $this->applyLocationFilter($q, 'ciudad_id', $validated['ciudad_id']))
            ->when(! empty($validated['provincia_id']), fn (QueryBuilder $q) => $this->applyLocationFilter($q, 'provincia_id', $validated['provincia_id']))
            ->when(! empty($validated['pais_id']), fn (QueryBuilder $q) => $this->applyLocationFilter($q, 'pais_id', $validated['pais_id']))
            ->selectRaw("COUNT(*) as total, SUM(CASE WHEN status = '{$pendingStatus}' THEN 1 ELSE 0 END) as pendientes")
            ->first();

        $previousTotal = (int) ($previous->total ?? 0);
        $previousPendientes = (int) ($previous->pendientes ?? 0);

        // Calculate percentages
        if ($previousTotal > 0) {
            $totalPct = round((($currentTotal - $previousTotal) / $previousTotal) * 100, 2);
        } elseif ($currentTotal > 0) {
            $totalPct = 100.0;
        } else {
            $totalPct = 0.0;
        }

        if ($previousPendientes > 0) {
            $pendientesPct = round((($currentPendientes - $previousPendientes) / $previousPendientes) * 100, 2);
        } elseif ($currentPendientes > 0) {
            $pendientesPct = 100.0;
        } else {
            $pendientesPct = 0.0;
        }

        $resolutionRatePct = $currentTotal > 0 ? (int) round(($currentResueltas / $currentTotal) * 100) : null;

        return [
            'total_pct' => $totalPct,
            'pendientes_pct' => $pendientesPct,
            'resolution_rate_pct' => $resolutionRatePct,
        ];
    }

    /**
     * Get top 5 incident categories by count, split into resolved and pending.
     */
    private function getTopCategories(array $validated): array
    {
        $resolved = IncidentStatus::Resolved->value;
        $pending = IncidentStatus::Pending->value;
        $inProgress = IncidentStatus::InProgress->value;

        $rows = $this->applyOrgScope(
            DB::table('incidents')->whereNull('incidents.deleted_at'),
        )
            ->when($validated['inicio'] ?? null, fn (QueryBuilder $q) => $q->whereDate('incidents.created_at', '>=', $validated['inicio']))
            ->when($validated['fin'] ?? null, fn (QueryBuilder $q) => $q->whereDate('incidents.created_at', '<=', $validated['fin']))
            ->when($validated['tipo_id'] ?? null, fn (QueryBuilder $q) => $q->where('incidents.incident_category_id', $validated['tipo_id']))
            ->when($validated['ciudad_id'] ?? null, fn (QueryBuilder $q) => $this->applyLocationFilter($q, 'ciudad_id', $validated['ciudad_id']))
            ->when($validated['provincia_id'] ?? null, fn (QueryBuilder $q) => $this->applyLocationFilter($q, 'provincia_id', $validated['provincia_id']))
            ->when($validated['pais_id'] ?? null, fn (QueryBuilder $q) => $this->applyLocationFilter($q, 'pais_id', $validated['pais_id']))
            ->join('incident_categories', 'incidents.incident_category_id', '=', 'incident_categories.id')
            ->selectRaw(
                "incident_categories.name as category,
                 incident_categories.id as category_id,
                 COUNT(*) as total,
                 SUM(CASE WHEN status = '{$resolved}' THEN 1 ELSE 0 END) as resolved,
                 SUM(CASE WHEN status IN ('{$pending}', '{$inProgress}') THEN 1 ELSE 0 END) as pending"
            )
            ->groupBy('incident_categories.id', 'incident_categories.name')
            ->orderByDesc('total')
            ->limit(5)
            ->get();

        return $rows->map(fn ($row) => [
            'name' => $row->category,
            'total' => (int) $row->total,
            'resolved' => (int) $row->resolved,
            'pending' => (int) $row->pending,
        ])->toArray();
    }
}
