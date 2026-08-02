<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Jobs;

use App\Domains\Incidents\Models\Incident;
use App\Domains\Incidents\ReadModels\IncidentFeedSerializer;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Redis;

final class SyncIncidentToRedisJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;

    public int $tries = 3;

    public int $timeout = 30;

    public array $backoff = [5, 15, 30];

    public function __construct(
        public readonly int $incidentId,
    ) {}

    public function handle(IncidentFeedSerializer $serializer): void
    {
        $incident = Incident::query()->withTrashed()->find($this->incidentId);

        if ($incident === null || $incident->trashed()) {
            Redis::hdel('feed:v2:items', (string) $this->incidentId);
            Redis::zrem('feed:v2:index', (string) $this->incidentId);

            return;
        }

        $data = $serializer->serialize($incident);

        Redis::hset('feed:v2:items', (string) $incident->id, json_encode($data));
        Redis::zadd('feed:v2:index', (float) $incident->created_at->timestamp, (string) $incident->id);
    }
}
