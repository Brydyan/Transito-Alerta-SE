<?php

declare(strict_types=1);

namespace App\Domains\Users\Services;

use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Users\Models\User;
use BackedEnum;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

class OperatorDashboardService
{
    public function __construct(
        private readonly OperatorLocationService $locations,
    ) {}

    public function forOperator(User $operator, array $filters): array
    {
        $position = $this->locations->current($operator);
        $cacheKey = $this->cacheKey($operator, $filters, $position);
        $ttl = max(1, (int) config('operator-dashboard.cache_ttl_seconds', 300));

        try {
            if (Cache::supportsTags()) {
                return Cache::tags(['operator-dashboard', "operator:{$operator->id}"])
                    ->remember($cacheKey, $ttl, fn (): array => $this->compute($operator, $filters, $position));
            }
        } catch (\Throwable) {
            // Cache driver does not support tags; fallback to live computation
        }

        return $this->compute($operator, $filters, $position);
    }

    private function compute(User $operator, array $filters, ?array $position): array
    {
        $radiusKm = max(0.1, (float) config('operator-dashboard.nearby_radius_km', 10));
        $limit = max(1, min(50, (int) config('operator-dashboard.recommendations_limit', 10)));

        if ($operator->organization_id === null) {
            return $this->emptyPayload($filters, $position !== null, $radiusKm);
        }

        $assignedQuery = $this->applyFilters(
            Incident::query()
                ->where('incidents.organization_id', $operator->organization_id)
                ->whereHas('assignments', fn (Builder $query) => $query->where('user_id', $operator->id)),
            $filters,
        );

        return [
            'has_recent_location' => $position !== null,
            'nearby_radius_km' => $radiusKm,
            'assigned_incidents' => $this->assignedIncidents(clone $assignedQuery, $filters, $position),
            'nearby_recommendations' => $position === null
                ? []
                : $this->nearbyRecommendations($operator, $filters, $position, $radiusKm, $limit),
            'summary_counts' => $this->summary(clone $assignedQuery),
            'filter_options' => [
                'locations' => $this->locationOptions($operator),
            ],
        ];
    }

    private function assignedIncidents(Builder $query, array $filters, ?array $position): array
    {
        $page = (int) ($filters['page'] ?? 1);
        $perPage = (int) ($filters['per_page'] ?? 10);

        $query->with('location')->orderByDesc('incidents.created_at');
        $this->selectDistance($query, $position);

        $paginator = $query->paginate($perPage, ['*'], 'page', $page);

        return [
            'data' => $paginator->getCollection()
                ->map(fn (Incident $incident): array => $this->serializeIncident($incident, true))
                ->values()
                ->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'from' => $paginator->firstItem(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'to' => $paginator->lastItem(),
                'total' => $paginator->total(),
            ],
        ];
    }

    private function nearbyRecommendations(
        User $operator,
        array $filters,
        array $position,
        float $radiusKm,
        int $limit,
    ): array {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return [];
        }

        $latitude = (float) $position['lat'];
        $longitude = (float) $position['lng'];
        $latitudeDelta = $radiusKm / 110.574;
        $longitudeDelta = $radiusKm / (111.320 * max(abs(cos(deg2rad($latitude))), 0.01));
        $radiusMeters = $radiusKm * 1000;

        $query = $this->applyFilters(
            Incident::query()
                ->where('incidents.organization_id', $operator->organization_id)
                ->whereIn('incidents.status', [IncidentStatus::Pending->value, IncidentStatus::InProgress->value])
                ->whereNotNull('incidents.geom')
                ->whereDoesntHave('assignments', fn (Builder $assignmentQuery) => $assignmentQuery->where('user_id', $operator->id)),
            $filters,
        );

        return $query
            ->with('location')
            ->select('incidents.*')
            ->selectRaw(
                'ST_Distance(incidents.geom::geography, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography) / 1000.0 AS distance_km',
                [$longitude, $latitude],
            )
            ->whereRaw(
                'incidents.geom && ST_MakeEnvelope(?, ?, ?, ?, 4326)',
                [
                    $longitude - $longitudeDelta,
                    max(-90, $latitude - $latitudeDelta),
                    $longitude + $longitudeDelta,
                    min(90, $latitude + $latitudeDelta),
                ],
            )
            ->whereRaw(
                'ST_DWithin(incidents.geom::geography, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?)',
                [$longitude, $latitude, $radiusMeters],
            )
            ->orderBy('distance_km')
            ->limit($limit)
            ->get()
            ->map(fn (Incident $incident): array => $this->serializeIncident($incident, false))
            ->values()
            ->all();
    }

    private function locationOptions(User $operator): array
    {
        return Location::query()
            ->whereHas('incidents', fn (Builder $query) => $query->where('organization_id', $operator->organization_id))
            ->orderBy('name')
            ->get()
            ->map(fn (Location $location): array => $this->serializeLocation($location))
            ->values()
            ->all();
    }

    private function summary(Builder $query): array
    {
        $statusRows = (clone $query)
            ->selectRaw('incidents.status AS key, COUNT(*) AS aggregate')
            ->groupBy('incidents.status')
            ->get();

        $byStatus = array_fill_keys(IncidentStatus::values(), 0);
        foreach ($statusRows as $row) {
            if (array_key_exists($row->key, $byStatus)) {
                $byStatus[$row->key] = (int) $row->aggregate;
            }
        }

        $resolvedQuery = (clone $query)
            ->where('incidents.status', IncidentStatus::Resolved->value)
            ->whereNotNull('incidents.resolution_date')
            ->whereColumn('incidents.resolution_date', '>=', 'incidents.created_at');

        $averageExpression = DB::connection()->getDriverName() === 'pgsql'
            ? 'AVG(EXTRACT(EPOCH FROM (incidents.resolution_date - incidents.created_at)))'
            : "AVG(strftime('%s', incidents.resolution_date) - strftime('%s', incidents.created_at))";
        $averageRow = $resolvedQuery
            ->selectRaw("{$averageExpression} AS average_seconds")
            ->toBase()
            ->first();
        $averageSeconds = $averageRow?->average_seconds;

        return [
            'total_assigned' => (clone $query)->count(),
            'by_status' => $byStatus,
            'average_resolution_time' => $this->formatAverage($averageSeconds),
        ];
    }

    private function applyFilters(Builder $query, array $filters): Builder
    {
        return $query
            ->when(! empty($filters['inicio']), fn (Builder $builder) => $builder->whereDate('incidents.created_at', '>=', $filters['inicio']))
            ->when(! empty($filters['fin']), fn (Builder $builder) => $builder->whereDate('incidents.created_at', '<=', $filters['fin']))
            ->when(! empty($filters['location_id']), function (Builder $builder) use ($filters): void {
                $locationId = (int) $filters['location_id'];
                $builder->whereRaw('incidents.location_id IN (
                    WITH RECURSIVE location_tree AS (
                        SELECT id FROM locations WHERE id = ?
                        UNION ALL
                        SELECT locations.id FROM locations
                        INNER JOIN location_tree ON locations.parent_id = location_tree.id
                    )
                    SELECT id FROM location_tree
                )', [$locationId]);
            });
    }

    private function selectDistance(Builder $query, ?array $position): void
    {
        $query->select('incidents.*');

        if ($position === null || DB::connection()->getDriverName() !== 'pgsql') {
            $query->selectRaw('NULL AS distance_km');

            return;
        }

        $query->selectRaw(
            'ST_Distance(incidents.geom::geography, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography) / 1000.0 AS distance_km',
            [(float) $position['lng'], (float) $position['lat']],
        );
    }

    private function serializeIncident(Incident $incident, bool $includePriority): array
    {
        $data = [
            'id' => $incident->id,
            'title' => $incident->title,
            'status' => $this->enumValue($incident->status),
            'created_at' => $incident->created_at?->toISOString(),
            'location' => $this->serializeLocation($incident->location),
            'distance_km' => $incident->distance_km === null ? null : round((float) $incident->distance_km, 2),
        ];

        if ($includePriority) {
            $data['priority'] = $this->enumValue($incident->priority);
        }

        return $data;
    }

    private function serializeLocation(?Location $location): ?array
    {
        if ($location === null) {
            return null;
        }

        return [
            'id' => $location->id,
            'path' => $location->fullPath(),
        ];
    }

    private function enumValue(mixed $value): mixed
    {
        return $value instanceof BackedEnum ? $value->value : $value;
    }

    private function formatAverage(mixed $averageSeconds): ?array
    {
        if ($averageSeconds === null) {
            return null;
        }

        $seconds = (int) round((float) $averageSeconds);
        $days = intdiv($seconds, 86400);
        $hours = intdiv($seconds % 86400, 3600);

        return [
            'formatted' => "{$days}d {$hours}h",
            'days' => $days,
            'hours' => $hours,
            'seconds' => $seconds,
        ];
    }

    private function cacheKey(User $operator, array $filters, ?array $position): string
    {
        ksort($filters);

        return sprintf(
            'operator-dashboard:%d:%s',
            $operator->id,
            hash('xxh3', serialize([$filters, $position])),
        );
    }

    public static function clearCacheForOperator(int $userId): void
    {
        try {
            if (Cache::supportsTags()) {
                Cache::tags(["operator:{$userId}"])->flush();

                return;
            }

            if (config('cache.default') === 'redis' || config('cache.default') === 'octane') {
                $redis = Redis::connection();
                $prefix = config('database.redis.options.prefix', '');
                $pattern = "{$prefix}operator-dashboard:{$userId}:*";
                $keys = $redis->keys($pattern);
                foreach ($keys as $key) {
                    $unprefixedKey = preg_replace('/^'.preg_quote($prefix, '/').'/', '', $key);
                    Cache::forget($unprefixedKey);
                }
            }
        } catch (\Throwable) {
            // Ignore cache invalidation failures
        }
    }

    public static function clearCacheForIncident(Incident $incident): void
    {
        try {
            if (Cache::supportsTags()) {
                Cache::tags(['operator-dashboard'])->flush();
            }

            $assignedUserIds = DB::table('assignments')
                ->where('incident_id', $incident->id)
                ->pluck('user_id')
                ->all();

            foreach ($assignedUserIds as $userId) {
                self::clearCacheForOperator((int) $userId);
            }
        } catch (\Throwable) {
            // Ignore cache invalidation failures
        }
    }

    private function emptyPayload(array $filters, bool $hasRecentLocation, float $radiusKm): array
    {
        return [
            'has_recent_location' => $hasRecentLocation,
            'nearby_radius_km' => $radiusKm,
            'assigned_incidents' => [
                'data' => [],
                'meta' => [
                    'current_page' => (int) ($filters['page'] ?? 1),
                    'from' => null,
                    'last_page' => 1,
                    'per_page' => (int) ($filters['per_page'] ?? 10),
                    'to' => null,
                    'total' => 0,
                ],
            ],
            'nearby_recommendations' => [],
            'summary_counts' => [
                'total_assigned' => 0,
                'by_status' => array_fill_keys(IncidentStatus::values(), 0),
                'average_resolution_time' => null,
            ],
            'filter_options' => [
                'locations' => [],
            ],
        ];
    }
}
