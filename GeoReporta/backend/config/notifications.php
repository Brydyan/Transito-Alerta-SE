<?php

declare(strict_types=1);

/*
 * Notifications domain configuration.
 *
 * Hosts SSE stream tuning constants for the individual notification bell.
 * See openspec/changes/eliminar-mercure-sse-nativo/spec.md (S-BE-03)
 * for the contract these values implement.
 *
 * All values are env-driven so an operator can tune for production
 * without code changes. Defaults match the design's reference values.
 */

return [

    /*
    |--------------------------------------------------------------------------
    | SSE stream — snapshot cap
    |--------------------------------------------------------------------------
    |
    | Maximum number of notifications emitted in the initial snapshot
    | when a client reconnects with a `Last-Event-ID`. Caps replay
    | bandwidth after long disconnects and bounds the per-request query.
    |
    */

    'stream_snapshot_cap' => (int) env('NOTIFICATIONS_STREAM_SNAPSHOT_CAP', 50),

    /*
    |--------------------------------------------------------------------------
    | SSE stream — heartbeat cadence
    |--------------------------------------------------------------------------
    |
    | Seconds between `:keepalive` SSE comments emitted on every open
    | stream. The heartbeat also doubles as the cadence at which the
    | controller re-validates the session (heartbeat-based revocation
    | per spec decision D2). Below 10s is wasteful; above 60s lets dead
    | connections linger past nginx's proxy_read_timeout.
    |
    */

    'stream_heartbeat_seconds' => (int) env('NOTIFICATIONS_STREAM_HEARTBEAT_SECONDS', 30),

    /*
    |--------------------------------------------------------------------------
    | SSE stream — Redis Pub/Sub channel naming
    |--------------------------------------------------------------------------
    |
    | Per-user channel template. The current implementation uses
    | NotificationService::topicFor($userId) which produces
    | "user:{id}:notifications". The split is exposed as config so a
    | future deployment can prefix all channels (e.g. with an env name
    | like "prod:user:{id}:notifications") without code changes.
    |
    */

    'stream_channel_prefix' => env('NOTIFICATIONS_STREAM_CHANNEL_PREFIX', 'user'),
    'stream_channel_suffix' => env('NOTIFICATIONS_STREAM_CHANNEL_SUFFIX', 'notifications'),
];
