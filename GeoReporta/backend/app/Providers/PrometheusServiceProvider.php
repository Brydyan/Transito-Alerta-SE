<?php

declare(strict_types=1);

namespace App\Providers;

use App\Domains\Incidents\Models\Incident;
use App\Domains\Users\Models\User;
use App\Prometheus\Adapters\FixedLaravelCacheAdapter;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\ServiceProvider;
use Prometheus\CollectorRegistry;
use Prometheus\Storage\InMemory;
use Spatie\Prometheus\Facades\Prometheus;

class PrometheusServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(CollectorRegistry::class, function () {
            $store = config('prometheus.cache');

            $adapter = $store
                ? new FixedLaravelCacheAdapter(Cache::store($store))
                : new InMemory;

            return new CollectorRegistry($adapter, false);
        });

        $this->app->resolving(CollectorRegistry::class, function (CollectorRegistry $registry) {
            $registry->getOrRegisterCounter(
                'app',
                'http_requests_total',
                'Total HTTP requests',
                ['method', 'route', 'status'],
            );

            $registry->getOrRegisterGauge(
                'app',
                'http_requests_in_progress',
                'HTTP requests currently in progress',
                ['method', 'route'],
            );

            $registry->getOrRegisterHistogram(
                'app',
                'http_request_duration_seconds',
                'HTTP request duration in seconds',
                ['method', 'route'],
                [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10],
            );
        });

        Prometheus::addGauge('users_active_total')
            ->helpText('Total registered users')
            ->value(fn () => User::count());

        Prometheus::addGauge('incidents_by_status')
            ->helpText('Incidents grouped by status')
            ->labels(['status'])
            ->value(fn () => Incident::query()
                ->selectRaw('status, count(*) as count')
                ->groupBy('status')
                ->pluck('count', 'status')
                ->map(fn ($count, $status) => [$count, [$status]])
                ->values()
                ->toArray()
            );

        Prometheus::addGauge('incidents_total')
            ->helpText('Total incidents created')
            ->value(fn () => Incident::count());
    }
}
