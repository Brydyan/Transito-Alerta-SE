<?php

declare(strict_types=1);

use App\Domains\Comments\Jobs\SyncCommentToRedisJob;
use App\Domains\Comments\Listeners\RedisCommentSync;
use App\Domains\Comments\Models\Comment;
use Illuminate\Contracts\Bus\Dispatcher;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Mockery\MockInterface;
use Tests\TestCase;

uses(TestCase::class);

it('queues comment reconciliation only after commit', function (): void {
    Queue::fake();
    $comment = new Comment;
    $comment->id = 42;
    $comment->exists = true;

    DB::transaction(function () use ($comment): void {
        (new RedisCommentSync)->created($comment);
        Queue::assertNothingPushed();
    });

    Queue::assertPushed(SyncCommentToRedisJob::class, fn (SyncCommentToRedisJob $job): bool => $job->commentId === 42);
});

it('logs and tolerates dispatch failures after commit', function (): void {
    $this->mock(Dispatcher::class, function (MockInterface $mock): void {
        $mock->shouldReceive('dispatch')->once()->andThrow(new RuntimeException('Queue unavailable'));
    });

    Log::shouldReceive('warning')->once()->withArgs(fn (string $message, array $context): bool => $message === 'Failed to queue comment Redis reconciliation'
        && $context === ['comment_id' => 42, 'error' => 'Queue unavailable']);

    $comment = new Comment;
    $comment->id = 42;
    $comment->exists = true;

    DB::transaction(fn () => (new RedisCommentSync)->created($comment));
});
