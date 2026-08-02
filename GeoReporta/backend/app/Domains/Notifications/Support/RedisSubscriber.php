<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Support;

use Closure;
use Illuminate\Contracts\Redis\Factory as RedisFactory;

/**
 * Thin wrapper around Redis::subscribe so the controller can be unit-
 * tested by swapping this collaborator. The default binding wires it
 * to the application RedisManager; tests can replace the binding (or
 * pass an alternative instance) to observe the callback without
 * hitting a real broker.
 *
 * The subscribe call is intentionally blocking — it keeps the calling
 * Swoole worker attached to the channel until the broker disconnects
 * or the callback signals completion (by returning a non-null value).
 *
 * Extracted from NotificationStreamController for testability; nothing
 * else in the codebase uses it.
 */
class RedisSubscriber
{
    public function __construct(
        private readonly RedisFactory $redis,
    ) {}

    /**
     * Subscribe to a single channel and invoke $callback for each
     * message. The callback receives the raw payload string (already
     * JSON-encoded by the publisher).
     */
    public function subscribe(string $channel, Closure $callback): void
    {
        $this->redis->connection()->subscribe([$channel], function (string $message, string $receivedChannel) use ($callback): void {
            $callback($message, $receivedChannel);
        });
    }
}
