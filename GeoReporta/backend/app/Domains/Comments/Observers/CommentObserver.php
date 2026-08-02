<?php

declare(strict_types=1);

namespace App\Domains\Comments\Observers;

use App\Domains\Comments\Models\Comment;
use App\Storage\ImageStorageService;
use Illuminate\Support\Facades\Log;

class CommentObserver
{
    public function __construct(
        private readonly ImageStorageService $images,
    ) {}

    public function deleting(Comment $comment): void
    {
        // Use load() instead of loadMissing() to ensure a fresh query.
        // loadMissing() skips re-loading if the relationship was already
        // accessed (e.g., by RedisCommentSync on the 'created' event),
        // caching an empty collection before images exist.
        $comment->load('images');

        foreach ($comment->images as $image) {
            try {
                $this->images->detach($image);
            } catch (\Throwable $e) {
                Log::warning('Failed to delete comment image from storage', [
                    'comment_id' => $comment->id,
                    'image_path' => $image->storage_path,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }
}
