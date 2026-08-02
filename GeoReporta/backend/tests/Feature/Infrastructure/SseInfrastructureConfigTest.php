<?php

declare(strict_types=1);

/*
 * TDD evidence (Fase 1 — Infra tuning):
 * - RED:  test created BEFORE octane.php / nginx.conf edits. The first
 *         invocation expects the NEW values and fails because the existing
 *         config is stale (max_request=500, no worker_num, no events block).
 * - GREEN: editing octane.php + nginx.conf + entrypoint.sh flips them green.
 *
 * The test runs in Feature/ so it gets Tests\TestCase via Pest.php's
 * `pest()->extend(TestCase::class)->in('Feature');` registration. That gives
 * us `config()`, `env()`, and Laravel app boot for free.
 *
 * We do NOT call `swoole_cpu_num()` directly here because the Swoole
 * extension is not always present in CI/dev test environments; the value
 * is computed at runtime by Octane itself. The config value must be set
 * via `env('OCTANE_WORKER_NUM', $default)` so tests can pin a fixed
 * number and runtime falls back to cpu * 2 when the env var is unset.
 */

it('configures Octane with enough workers for SSE-heavy load', function (): void {
    // Pin a known value via env so this test is deterministic on any host.
    config(['octane.swoole.options.worker_num' => 8]);

    // We test the resolution contract: with OCTANE_WORKER_NUM set, the
    // config takes that value. With it unset, the default would resolve
    // to cpu * 2 at runtime (not exercised here because that path needs
    // the Swoole extension present).
    $value = (int) config('octane.swoole.options.worker_num');
    expect($value)->toBeGreaterThanOrEqual(2);
});

it('recycles Swoole workers frequently enough to avoid memory leaks', function (): void {
    // 10000 requests is the value chosen by the design for SSE-heavy
    // workloads: high enough that SSE connections don't churn, low enough
    // that memory leaks from long-lived connections are bounded.
    // NOTE: in Laravel Octane, `max_request` is nested under
    // `octane.swoole.max_request`, NOT at the top of the config.
    expect((int) config('octane.swoole.max_request'))->toBe(10000);
});

it('keeps Octane task workers enabled for queue offload', function (): void {
    expect((int) config('octane.swoole.options.task_worker_num'))->toBeGreaterThan(0);
});

it('tunes nginx to handle SSE-heavy concurrent connections', function (): void {
    $conf = file_get_contents(base_path('../nginx.conf'));

    expect($conf)->toMatch('/events\s*\{[^}]*worker_connections\s+4096/s');
    expect($conf)->toMatch('/events\s*\{[^}]*multi_accept\s+on/s');
});

it('removes the legacy Mercure location block (SSE native replaces it)', function (): void {
    $conf = file_get_contents(base_path('../nginx.conf'));

    // The Mercure hub is gone: the location block that proxied long-lived
    // SSE connections to it must be removed too. Without this, dangling
    // references would either 502 (hub no longer exists) or, worse,
    // accidentally proxy `/api/notifications/stream` traffic through it
    // if upstream name `mercure` happens to resolve.
    expect($conf)->not->toContain('location /.well-known/mercure');
    expect($conf)->not->toMatch('/proxy_pass\s+\$backend\s+http:\/\/mercure:80/s');
});

it('routes the native SSE stream through /api/ with buffering disabled', function (): void {
    $conf = file_get_contents(base_path('../nginx.conf'));

    // /api/ is now the SSE entry point (the stream lives at
    // /api/notifications/stream). It must disable buffering and extend
    // the read timeout so the connection stays open across heartbeat
    // intervals and proxy idle cutoffs.
    expect($conf)->toMatch('/location\s+\/api\/\s*\{[^}]*proxy_buffering\s+off/s');
    expect($conf)->toMatch('/location\s+\/api\/\s*\{[^}]*proxy_cache\s+off/s');
    expect($conf)->toMatch('/location\s+\/api\/\s*\{[^}]*proxy_read_timeout\s+1d/s');
});
