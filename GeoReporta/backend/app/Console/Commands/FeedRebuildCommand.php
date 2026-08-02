<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Comments\Models\Comment;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Incidents\ReadModels\IncidentFeedSerializer;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;

class FeedRebuildCommand extends Command
{
    private const V2_ITEMS_KEY = 'feed:v2:items';

    private const V2_INDEX_KEY = 'feed:v2:index';

    protected $signature = 'feed:rebuild';

    protected $description = 'Rebuild Redis feed v2 data from PostgreSQL';

    public function __construct(
        private readonly IncidentFeedSerializer $serializer,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $this->info('Rebuilding Redis feed v2 from PostgreSQL...');

        try {
            // Rebuild must be authoritative: wipe first so incidents deleted
            // from PostgreSQL since the last rebuild don't linger as ghosts in
            // the hash/sorted-set (upsert-only never prunes stale members).
            Redis::del(self::V2_ITEMS_KEY, self::V2_INDEX_KEY);

            $incidentCount = 0;

            Incident::with(['category', 'location', 'user'])
                ->chunk(100, function ($incidents) use (&$incidentCount): void {
                    $pipe = Redis::pipeline();

                    foreach ($incidents as $incident) {
                        $data = $this->serializer->serialize($incident);

                        $pipe->hset(self::V2_ITEMS_KEY, (string) $incident->id, json_encode($data));
                        $pipe->zadd(self::V2_INDEX_KEY, (float) $incident->created_at->timestamp, (string) $incident->id);

                        $incidentCount++;
                    }

                    $pipe->exec();
                });

            // Set TTL on v2 keys once after all inserts
            $feedTtlSeconds = (int) config('cache.feed_ttl_seconds');
            Redis::expire(self::V2_ITEMS_KEY, $feedTtlSeconds);
            Redis::expire(self::V2_INDEX_KEY, $feedTtlSeconds);

            $this->info("Synced {$incidentCount} incidents to Redis feed v2.");

            // Sync comments to Redis (unchanged — uses incident: and comment: keys)
            $commentCount = 0;

            Comment::with('user')
                ->chunk(100, function ($comments) use (&$commentCount): void {
                    $pipe = Redis::pipeline();

                    foreach ($comments as $comment) {
                        $commentSetKey = 'incident:'.$comment->incident_id.':comments';
                        $commentHashKey = 'comment:'.$comment->id;

                        $data = [
                            'id' => (string) $comment->id,
                            'incident_id' => (string) $comment->incident_id,
                            'user_id' => (string) $comment->user_id,
                            'user_name' => ($comment->user?->first_name ?? '').' '.($comment->user?->last_name ?? ''),
                            'message' => $comment->message,
                            'created_at' => $comment->created_at?->toIso8601String(),
                            'updated_at' => $comment->updated_at?->toIso8601String(),
                        ];

                        $pipe->zadd($commentSetKey, (float) $comment->created_at->timestamp, (string) $comment->id);
                        $pipe->hmset($commentHashKey, $data);

                        $commentCount++;
                    }

                    $pipe->exec();
                });

            // Rebuild comment_count for each incident that has comments.
            // HSET (absolute), never HINCRBY: the incident:{id} hashes are not
            // wiped above (only the feed:v2 keys are), so an increment would
            // stack on top of the value left by the previous rebuild.
            $counts = Comment::query()
                ->selectRaw('incident_id, COUNT(*) AS total')
                ->groupBy('incident_id')
                ->pluck('total', 'incident_id');

            foreach ($counts as $incidentId => $count) {
                Redis::hset('incident:'.$incidentId, 'comment_count', (int) $count);
            }

            $this->info("Synced {$commentCount} comments to Redis.");
        } catch (\Throwable $e) {
            $this->warn('Redis feed rebuild skipped (Redis unavailable: '.$e->getMessage().')');
            Log::warning('Redis feed rebuild failed', ['exception' => $e]);

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
