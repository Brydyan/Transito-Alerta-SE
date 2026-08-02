<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Http;

use App\Domains\Notifications\Http\Resources\NotificationResource;
use App\Domains\Notifications\Models\Notification;
use App\Domains\Notifications\Services\NotificationService;
use App\Domains\Notifications\Support\RedisSubscriber;
use Illuminate\Contracts\Redis\Factory as RedisFactory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Server-Sent Events endpoint for the individual notification bell.
 *
 * Replaces the previous Mercure-based real-time push. The browser opens
 * `EventSource('/api/notifications/stream')`, optionally with a
 * `Last-Event-ID` header set automatically by the browser on reconnect.
 *
 * Lifecycle:
 *   1. JwtAuthenticate middleware authenticates the request (JWT Bearer
 *      header OR cookie `access_token` — fallback was added precisely
 *      for SSE clients that cannot set custom headers).
 *   2. Snapshot: we query the most recent N notifications with id >
 *      Last-Event-ID, scoped to the authenticated user, and emit them
 *      as SSE events.
 *   3. Subscription: we hand off to RedisSubscriber which
 *      `Redis::subscribe(["user:{id}:notifications"], ...)` and forwards
 *      every received payload as an SSE event. Redis Pub/Sub is
 *      non-durable: any message published while the browser was
 *      disconnected is recoverable from the snapshot on reconnect.
 *   4. Heartbeat: a `:keepalive` SSE comment is emitted every
 *      `stream_heartbeat_seconds` (default 30). The same cadence is
 *      used to re-check that the user's session is still valid; if
 *      it isn't, the stream closes cleanly.
 *
 * Why a separate controller (not a method on NotificationController):
 * the stream uses a streaming response, has no policy gate (the SSE
 * channel IS the user's own private feed), and shares no shape with
 * the REST endpoints. Keeping them apart makes both easier to read.
 *
 * @see openspec/changes/eliminar-mercure-sse-nativo
 */
class NotificationStreamController
{
    public function __construct(
        private readonly RedisFactory $redis,
        private readonly RedisSubscriber $subscriber,
    ) {}

    /**
     * Open an SSE stream for the authenticated user.
     *
     * Returns:
     *  - 200 with text/event-stream on success,
     *  - 503 if Redis Pub/Sub cannot be reached,
     *  - 401 is produced upstream by the JwtAuthenticate middleware.
     */
    public function __invoke(Request $request): StreamedResponse|Response
    {
        $user = $request->user();
        if ($user === null) {
            // Defensive: the JWT middleware should have already rejected.
            return response()->json(['message' => __('messages.unauthenticated')], 401);
        }

        $userId = (int) $user->id;
        $channel = NotificationService::topicFor($userId);
        $lastEventId = (int) $request->header('Last-Event-ID', '0');
        $snapshotCap = (int) config('notifications.stream_snapshot_cap', 50);
        $heartbeatSeconds = max(1, (int) config('notifications.stream_heartbeat_seconds', 30));

        // Pre-flight: confirm Redis Pub/Sub is reachable before we open
        // the stream. Once headers are flushed (inside StreamedResponse),
        // we can no longer return a 503 — the browser would just see an
        // abruptly-closed connection. A 1s round-trip ping is cheap and
        // catches misconfigured deployments before the user does.
        try {
            $this->redis->connection()->ping();
        } catch (\Throwable $e) {
            Log::warning('SSE stream pre-flight ping failed', [
                'user_id' => $userId,
                'channel' => $channel,
                'error' => $e->getMessage(),
            ]);

            return response()->json(
                ['message' => 'Real-time channel unavailable, please retry.'],
                503,
            );
        }

        // Capture the request-side user reference so the closure below
        // can re-check session validity without re-resolving it.
        $lastHeartbeatAt = microtime(true);

        $response = new StreamedResponse(function () use (
            $userId,
            $channel,
            $lastEventId,
            $snapshotCap,
            $heartbeatSeconds,
            &$lastHeartbeatAt,
        ): void {
            // Phase 1: replay persisted events the client hasn't seen.
            // Done BEFORE subscribing so any notification persisted
            // between the snapshot query and the subscribe call is
            // delivered at-least-once: dedup is by event id in the
            // browser. See spec S-NS-01 / D1.
            $this->emitSnapshot($userId, $lastEventId, $snapshotCap);
            $lastHeartbeatAt = microtime(true);

            // Phase 2: subscribe to live updates. The Redis facade
            // blocks the calling process while a subscription is
            // active; under Octane/Swoole that's exactly what keeps
            // the connection alive.
            $this->subscriber->subscribe($channel, function (string $message) use (
                $userId,
                $heartbeatSeconds,
                &$lastHeartbeatAt,
            ): void {
                if ((microtime(true) - $lastHeartbeatAt) >= $heartbeatSeconds) {
                    $stillValid = Notification::query()
                        ->where('user_id', $userId)
                        ->exists();
                    if (! $stillValid) {
                        // Belt-and-suspenders: the auth middleware would
                        // have rejected the original request if no user
                        // existed; this guards against deletion mid-stream.
                        echo "event: close\ndata: session_revoked\n\n";
                        $this->flushOutput();

                        return;
                    }
                    echo ":keepalive\n\n";
                    $this->flushOutput();
                    $lastHeartbeatAt = microtime(true);
                }

                echo "event: notification\n";
                echo 'data: '.$message."\n\n";
                $this->flushOutput();
            });
        });

        // Headers MUST be set on the StreamedResponse directly because
        // the StreamedResponse factory does not accept them via the
        // constructor we used.
        $response->headers->set('Content-Type', 'text/event-stream; charset=UTF-8');
        $response->headers->set('Cache-Control', 'no-cache');
        // Disable nginx response buffering. Without this, nginx waits
        // for the upstream to fill a buffer (default 4k–8k) before
        // forwarding any chunk to the browser, which defeats the
        // whole point of SSE.
        $response->headers->set('X-Accel-Buffering', 'no');
        $response->headers->set('Connection', 'keep-alive');

        return $response;
    }

    /**
     * Emit the snapshot of notifications with id > $lastEventId, capped
     * at $cap, in ascending id order, scoped to the authenticated user.
     */
    private function emitSnapshot(int $userId, int $lastEventId, int $cap): void
    {
        $notifications = Notification::query()
            ->where('user_id', $userId)
            ->where('id', '>', $lastEventId)
            ->orderBy('id', 'asc')
            ->limit($cap)
            ->get();

        foreach ($notifications as $notification) {
            $payload = json_encode(
                (new NotificationResource($notification))->resolve(),
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE,
            );
            echo "id: {$notification->id}\n";
            echo "event: notification\n";
            echo "data: {$payload}\n\n";
            $this->flushOutput();
        }
    }

    /**
     * Flush any active output buffer. Safe to call when no buffer is
     * active: the function_exists + level check is defensive against
     * test runners that disable output buffering.
     */
    private function flushOutput(): void
    {
        if (function_exists('ob_get_level') && ob_get_level() > 0) {
            @ob_flush();
        }
        @flush();
    }
}
