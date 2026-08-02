<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Models;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;

/**
 * Read model del feed ciudadano de Incidencias.
 *
 * @cqrs-role query-read-model
 *
 * Pertenece al query side y NUNCA debe tocar Postgres. Lee exclusivamente
 * de Redis (`feed:v2:items` como hash + `feed:v2:index` como sorted set).
 *
 * Si Redis está caído, devuelve una respuesta vacía y loggea en vez de
 * tirar 500 — el mapa del frontend debe seguir renderizando. La fuente
 * de verdad sigue siendo Postgres; este servicio es una vista optimizada
 * eventualmente consistente.
 *
 * Los filtros que agregues acá son filtros del read model, no reglas de
 * negocio: para eso, los servicios del command side.
 *
 * @see docs/Convenciones/architecture-cqrs-lite.md
 */
class FeedService
{
    private const CANDIDATE_LIMIT = 500;

    private const V2_ITEMS_KEY = 'feed:v2:items';

    private const V2_INDEX_KEY = 'feed:v2:index';

    /**
     * @return array{data: array, meta: array}
     */
    public function getFeed(
        ?string $status = null,
        ?int $organizationId = null,
        ?int $locationId = null,
        int $page = 1,
        int $perPage = 12,
    ): array {
        // The citizen feed is the highest-traffic read in the app and the one
        // we cache in Redis specifically to insulate it from Postgres. If
        // Redis is unreachable we MUST NOT 500 the whole map view — degrade
        // to an empty response so the frontend still renders the shell
        // (and can show a stale-data banner if it wants). Logged so ops sees
        // the Redis outage rather than silently swallowing it.
        try {
            $candidateIds = Redis::zrevrange(self::V2_INDEX_KEY, 0, self::CANDIDATE_LIMIT - 1);
            $allItems = $candidateIds === []
                ? []
                : Redis::hgetall(self::V2_ITEMS_KEY);
        } catch (\Throwable $e) {
            Log::warning('feed.redis_unavailable', [
                'method' => __METHOD__,
                'status' => $status,
                'organization_id' => $organizationId,
                'location_id' => $locationId,
                'page' => $page,
                'per_page' => $perPage,
                'exception' => $e->getMessage(),
                'exception_class' => get_class($e),
            ]);
            report($e);

            return $this->emptyResponse($page, $perPage);
        }

        if ($candidateIds === []) {
            return $this->emptyResponse($page, $perPage);
        }

        $incidents = [];
        foreach ($candidateIds as $id) {
            $json = $allItems[$id] ?? null;
            if ($json === null) {
                continue;
            }

            $data = json_decode($json, true);
            if (! is_array($data) || $data === []) {
                continue;
            }

            if (! $this->matchesFilters($data, $status, $organizationId, $locationId)) {
                continue;
            }

            $incidents[] = $this->buildItem($data);
        }

        return $this->buildPaginatedResponse($incidents, $page, $perPage);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function matchesFilters(
        array $data,
        ?string $status,
        ?int $organizationId,
        ?int $locationId,
    ): bool {
        if ($status !== null && ($data['status'] ?? '') !== $status) {
            return false;
        }

        if ($organizationId !== null && (int) ($data['organization_id'] ?? 0) !== $organizationId) {
            return false;
        }

        if ($locationId !== null) {
            $pathIds = isset($data['location_path_ids'])
                ? (array) json_decode((string) $data['location_path_ids'], true)
                : [];

            if (! in_array($locationId, $pathIds, true)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @return array{data: array, meta: array}
     */
    private function buildPaginatedResponse(array $items, int $page, int $perPage): array
    {
        $total = count($items);
        $lastPage = max(1, (int) ceil($total / $perPage));
        $offset = ($page - 1) * $perPage;

        return [
            'data' => array_slice($items, $offset, $perPage),
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'last_page' => $lastPage,
                'from' => $total > 0 ? $offset + 1 : null,
                'to' => $total > 0 ? min($offset + $perPage, $total) : null,
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function buildItem(array $data): array
    {
        return [
            'id' => (int) ($data['id'] ?? 0),
            'incident_category_id' => (int) ($data['incident_category_id'] ?? 0),
            'organization_id' => (int) ($data['organization_id'] ?? 0),
            'user_id' => (int) ($data['user_id'] ?? 0),
            'location_id' => (int) ($data['location_id'] ?? 0),
            'title' => $data['title'] ?? '',
            'status' => $data['status'] ?? '',
            'priority' => $data['priority'] ?? '',
            'resolution_date' => $data['resolution_date'] ?? null,
            'created_at' => $data['created_at'] ?? null,
            'updated_at' => $data['updated_at'] ?? null,
            'geom' => isset($data['geom']) ? json_decode((string) $data['geom']) : null,
            'category' => [
                'id' => (int) ($data['incident_category_id'] ?? 0),
                'name' => $data['category_name'] ?? '',
            ],
            'organization' => [
                'id' => (int) ($data['organization_id'] ?? 0),
                'name' => $data['organization_name'] ?? '',
            ],
            'user' => [
                'id' => (int) ($data['user_id'] ?? 0),
                'first_name' => $data['user_first_name'] ?? null,
                'last_name' => $data['user_last_name'] ?? null,
                'avatar' => $data['user_avatar'] ?? null,
            ],
            'location' => [
                'id' => (int) ($data['location_id'] ?? 0),
                'name' => $data['location_name'] ?? '',
            ],
        ];
    }

    /**
     * @return array{data: array, meta: array}
     */
    private function emptyResponse(int $page, int $perPage): array
    {
        return [
            'data' => [],
            'meta' => [
                'current_page' => $page,
                'per_page' => $perPage,
                'total' => 0,
                'last_page' => 1,
                'from' => null,
                'to' => null,
            ],
        ];
    }
}
