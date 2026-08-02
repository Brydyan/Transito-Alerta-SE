<?php

declare(strict_types=1);

namespace App\Domains\Comments\Jobs;

use App\Domains\Comments\Models\Comment;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Redis;

final class SyncCommentToRedisJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;

    public int $tries = 3;

    public int $timeout = 30;

    public array $backoff = [5, 15, 30];

    public function __construct(public readonly int $commentId) {}

    public function handle(): void
    {
        $comment = Comment::query()->withTrashed()->find($this->commentId);

        if ($comment === null) {
            return;
        }

        $commentSetKey = 'incident:'.$comment->incident_id.':comments';
        $commentHashKey = 'comment:'.$comment->id;
        $incidentHashKey = 'incident:'.$comment->incident_id;

        if ($comment->trashed()) {
            $pipe = Redis::pipeline();
            $pipe->zrem($commentSetKey, (string) $comment->id);
            $pipe->hincrby($incidentHashKey, 'comment_count', -1);
            $pipe->exec();

            return;
        }

        $comment->loadMissing(['user', 'images']);

        $data = [
            'id' => (string) $comment->id,
            'incident_id' => (string) $comment->incident_id,
            'user_id' => (string) $comment->user_id,
            'user_name' => ($comment->user?->first_name ?? '').' '.($comment->user?->last_name ?? ''),
            'message' => $comment->message,
            'parent_id' => $comment->parent_id !== null ? (string) $comment->parent_id : '',
            'depth' => $comment->depth,
            // `images()` now resolves via the shared polymorphic `images`
            // table (image-persistence-polymorphic, WU6) — the storage
            // key column is `storage_path`, not the legacy `url` column.
            'images' => json_encode($comment->images->map(fn ($img) => [
                'id' => (string) $img->id,
                'url' => $img->storage_path,
                'caption' => $img->caption ?? '',
            ])->values()),
            'created_at' => $comment->created_at?->toIso8601String(),
            'updated_at' => $comment->updated_at?->toIso8601String(),
        ];

        $pipe = Redis::pipeline();
        $pipe->zadd($commentSetKey, (float) $comment->created_at->timestamp, (string) $comment->id);
        $pipe->hmset($commentHashKey, $data);
        $pipe->hincrby($incidentHashKey, 'comment_count', 1);
        $pipe->exec();
    }
}
