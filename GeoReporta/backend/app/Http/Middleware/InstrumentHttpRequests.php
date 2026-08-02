<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Prometheus\CollectorRegistry;
use Symfony\Component\HttpFoundation\Response;

class InstrumentHttpRequests
{
    private const SKIP_PATHS = ['metrics', 'up'];

    public function handle(Request $request, Closure $next): mixed
    {
        if ($this->shouldSkip($request)) {
            return $next($request);
        }

        $route = $request->route()?->uri() ?? $request->path();
        $method = $request->method();

        $registry = app(CollectorRegistry::class);

        $registry
            ->getOrRegisterGauge('app', 'http_requests_in_progress', '', ['method', 'route'])
            ->inc([$method, $route]);

        $request->attributes->set('_prometheus_start', microtime(true));
        $request->attributes->set('_prometheus_route', $route);
        $request->attributes->set('_prometheus_method', $method);

        return $next($request);
    }

    public function terminate(Request $request, Response $response): void
    {
        $start = $request->attributes->get('_prometheus_start');

        if ($start === null) {
            return;
        }

        $route = $request->attributes->get('_prometheus_route');
        $method = $request->attributes->get('_prometheus_method');
        $status = (string) $response->getStatusCode();
        $duration = microtime(true) - $start;

        $registry = app(CollectorRegistry::class);

        $registry
            ->getOrRegisterCounter('app', 'http_requests_total', '', ['method', 'route', 'status'])
            ->inc([$method, $route, $status]);

        $registry
            ->getOrRegisterHistogram(
                'app', 'http_request_duration_seconds', '', ['method', 'route'],
                [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10],
            )
            ->observe($duration, [$method, $route]);

        $registry
            ->getOrRegisterGauge('app', 'http_requests_in_progress', '', ['method', 'route'])
            ->dec([$method, $route]);
    }

    private function shouldSkip(Request $request): bool
    {
        $path = $request->path();

        foreach (self::SKIP_PATHS as $skip) {
            if ($path === $skip || str_starts_with($path, $skip.'/')) {
                return true;
            }
        }

        return false;
    }
}
