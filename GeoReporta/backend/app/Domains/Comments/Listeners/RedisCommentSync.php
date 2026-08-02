<?php

declare(strict_types=1);

namespace App\Domains\Comments\Listeners;

use App\Domains\Comments\Jobs\SyncCommentToRedisJob;
use App\Domains\Comments\Models\Comment;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class RedisCommentSync
{
    public function created(Comment $comment): void
    {
        $this->queueReconciliation($comment);
    }

    public function updated(Comment $comment): void
    {
        $this->queueReconciliation($comment);
    }

    public function deleted(Comment $comment): void
    {
        $this->queueReconciliation($comment);
    }

    public function forceDeleted(Comment $comment): void
    {
        $this->queueReconciliation($comment);
    }

    private function queueReconciliation(Comment $comment): void
    {
        $commentId = (int) $comment->getKey();

        try {
            DB::afterCommit(function () use ($commentId): void {
                try {
                    SyncCommentToRedisJob::dispatch($commentId);
                } catch (\Throwable $e) {
                    $this->logDispatchFailure($commentId, $e);
                }
            });
        } catch (\Throwable $e) {
            $this->logDispatchFailure($commentId, $e);
        }
    }

    private function logDispatchFailure(int $commentId, \Throwable $e): void
    {
        Log::warning('Failed to queue comment Redis reconciliation', [
            'comment_id' => $commentId,
            'error' => $e->getMessage(),
        ]);
    }
}
