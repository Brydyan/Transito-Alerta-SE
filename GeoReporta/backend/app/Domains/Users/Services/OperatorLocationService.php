<?php

declare(strict_types=1);

namespace App\Domains\Users\Services;

use App\Domains\Roles\Enums\UserRole;
use App\Domains\Users\Models\User;
use Illuminate\Support\Facades\Redis;

class OperatorLocationService
{
    private const ACTIVE_KEY = 'operators:active';

    private const LOCATIONS_KEY = 'operators:locations';

    private const TTL_SECONDS = 300;

    public function record(User $user, float $latitude, float $longitude): void
    {
        $userId = (string) $user->id;

        Redis::geoadd(self::LOCATIONS_KEY, $longitude, $latitude, $userId);
        Redis::zadd(self::ACTIVE_KEY, (float) time(), $userId);
    }

    public function current(User $user): ?array
    {
        $userId = (string) $user->id;
        $lastPing = Redis::zscore(self::ACTIVE_KEY, $userId);

        if ($lastPing === null || $lastPing === false || (int) $lastPing <= time() - self::TTL_SECONDS) {
            return null;
        }

        $position = Redis::geopos(self::LOCATIONS_KEY, $userId);
        if (! isset($position[0][0], $position[0][1])) {
            return null;
        }

        return [
            'lat' => (float) $position[0][1],
            'lng' => (float) $position[0][0],
            'last_ping' => (int) $lastPing,
        ];
    }

    public function activeFor(User $currentUser): array
    {
        $staleLimit = time() - self::TTL_SECONDS;
        $staleIds = Redis::zrangebyscore(self::ACTIVE_KEY, '-inf', (string) $staleLimit);

        if (! empty($staleIds)) {
            Redis::zrem(self::LOCATIONS_KEY, ...$staleIds);
            Redis::zremrangebyscore(self::ACTIVE_KEY, '-inf', (string) $staleLimit);
        }

        $activeIds = Redis::zrange(self::ACTIVE_KEY, 0, -1);
        if (empty($activeIds)) {
            return [];
        }

        $query = User::query()
            ->whereIn('id', $activeIds)
            ->whereHas('role', fn ($roleQuery) => $roleQuery->where('name', UserRole::OperadorOrganizacion->value));

        if ($currentUser->organization_id !== null) {
            $query->where('organization_id', $currentUser->organization_id);
        }

        $users = $query->get();
        if ($users->isEmpty()) {
            return [];
        }

        $pipe = Redis::pipeline();
        foreach ($users as $user) {
            $pipe->zscore(self::ACTIVE_KEY, (string) $user->id);
            $pipe->geopos(self::LOCATIONS_KEY, (string) $user->id);
        }
        $redisData = $pipe->exec();

        return $users->map(function (User $user, int $index) use ($redisData): array {
            $ping = $redisData[$index * 2] ?? null;
            $position = $redisData[$index * 2 + 1] ?? null;

            return [
                'id' => $user->id,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'organization_id' => $user->organization_id,
                'lat' => isset($position[0][1]) ? (float) $position[0][1] : null,
                'lng' => isset($position[0][0]) ? (float) $position[0][0] : null,
                'last_ping' => $ping ? (int) $ping : null,
            ];
        })->all();
    }
}
