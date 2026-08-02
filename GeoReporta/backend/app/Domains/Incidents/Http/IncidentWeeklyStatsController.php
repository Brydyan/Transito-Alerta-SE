<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http;

use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Http\Concerns\ScopesIncidentQueries;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Volume incident statistics — received incidents per day.
 *
 * Supports optional date range filtering (inicio/fin).
 * If not provided, defaults to the last 10 days (rolling window).
 * Respects location/category filters same as IncidentStatsController.
 */
class IncidentWeeklyStatsController extends Controller
{
    use ScopesIncidentQueries;

    private const int CACHE_TTL_SECONDS = 3600;

    public function __invoke(Request $request): JsonResponse
    {
        if (! $request->user()?->can('dashboard.view')) {
            abort(403, 'No tienes permiso para ver las estadísticas.');
        }

        $validated = $request->validate([
            'inicio' => 'nullable|date_format:Y-m-d',
            'fin' => 'nullable|date_format:Y-m-d',
            'tipo_id' => 'nullable|integer|exists:incident_categories,id',
            'ciudad_id' => 'nullable|integer|exists:locations,id',
            'provincia_id' => 'nullable|integer|exists:locations,id',
            'pais_id' => 'nullable|integer|exists:locations,id',
        ]);

        // Validate that fin >= inicio if both provided
        if (! empty($validated['inicio']) && ! empty($validated['fin'])) {
            $inicio = Carbon::createFromFormat('Y-m-d', $validated['inicio']);
            $fin = Carbon::createFromFormat('Y-m-d', $validated['fin']);
            if ($fin->isBefore($inicio)) {
                abort(422, 'La fecha fin no puede ser anterior a la fecha inicio.');
            }
        }

        $cacheKey = $this->buildCacheKey($request->user(), $validated);
        $days = Cache::tags(['incident-stats'])->remember(
            $cacheKey,
            self::CACHE_TTL_SECONDS,
            fn (): array => $this->buildDailySeries($validated),
        );

        return response()->json(['days' => $days]);
    }

    private function buildCacheKey(?User $user, array $validated): string
    {
        $scope = match (true) {
            $user === null => 'anonymous',
            $user->isSystemAdmin() => 'system',
            $user->isOrganizationAdmin(), $user->isOperator() => 'org:'.$user->organization_id,
            default => 'user:'.$user->id,
        };

        return 'incident-weekly-stats:'.$scope.':'.hash('xxh3', serialize($validated));
    }

    private function buildDailySeries(array $validated): array
    {
        if (! empty($validated['inicio']) && ! empty($validated['fin'])) {
            $startDate = Carbon::createFromFormat('Y-m-d', $validated['inicio'])->startOfDay();
            $endDate = Carbon::createFromFormat('Y-m-d', $validated['fin'])->endOfDay();
        } else {
            $endDate = now()->endOfDay();
            $startDate = now()->subDays(9)->startOfDay();
        }

        $received = $this->fetchDailyCounts('created_at', $startDate, $endDate, $validated);
        $resolved = $this->fetchDailyCounts('resolution_date', $startDate, $endDate, $validated, IncidentStatus::Resolved->value);

        $days = [];
        $current = $startDate->copy();
        while ($current->lte($endDate)) {
            $dateStr = $current->format('Y-m-d');
            $dayOfWeekES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][$current->dayOfWeek];

            $days[] = [
                'date' => $dateStr,
                'label' => $dayOfWeekES,
                'recibidas' => $received[$dateStr] ?? 0,
                'resueltas' => $resolved[$dateStr] ?? 0,
            ];

            $current->addDay();
        }

        return $days;
    }

    /**
     * Fetch daily counts for a given date column.
     *
     * @param  string  $dateColumn  Column to group by (created_at or resolution_date)
     * @param  string|null  $statusFilter  Optional: filter by specific status (e.g., IncidentStatus::Resolved->value)
     * @return array<string, int> [YYYY-MM-DD => count]
     */
    private function fetchDailyCounts(string $dateColumn, Carbon $startDate, Carbon $endDate, array $validated, ?string $statusFilter = null): array
    {
        $driver = DB::connection()->getDriverName();

        // Date formatting per driver
        $dateExpr = match ($driver) {
            'pgsql' => "TO_CHAR({$dateColumn}, 'YYYY-MM-DD')",
            default => "strftime('%Y-%m-%d', {$dateColumn})",
        };

        $query = $this->applyOrgScope(
            DB::table('incidents')
                ->whereNull('deleted_at')
                ->whereBetween($dateColumn, [$startDate, $endDate])
        );

        // Apply filters
        if (! empty($validated['tipo_id'])) {
            $query->where('incident_category_id', $validated['tipo_id']);
        }
        if (! empty($validated['ciudad_id'])) {
            $query = $this->applyLocationFilter($query, 'ciudad_id', $validated['ciudad_id']);
        }
        if (! empty($validated['provincia_id'])) {
            $query = $this->applyLocationFilter($query, 'provincia_id', $validated['provincia_id']);
        }
        if (! empty($validated['pais_id'])) {
            $query = $this->applyLocationFilter($query, 'pais_id', $validated['pais_id']);
        }

        // Status filter (e.g., only resolved for resolution_date counts)
        if ($statusFilter !== null) {
            $query->where('status', $statusFilter);
        }

        $rows = $query
            ->selectRaw("{$dateExpr} as day, COUNT(*) as count")
            ->groupBy('day')
            ->orderBy('day')
            ->get();

        $counts = [];
        foreach ($rows as $row) {
            $counts[$row->day] = (int) $row->count;
        }

        return $counts;
    }
}
