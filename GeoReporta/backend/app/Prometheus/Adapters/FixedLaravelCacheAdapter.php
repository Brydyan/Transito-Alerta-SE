<?php

declare(strict_types=1);

namespace App\Prometheus\Adapters;

use Prometheus\Counter;
use Prometheus\Gauge;
use Prometheus\Histogram;
use Prometheus\Summary;
use Spatie\Prometheus\Adapters\LaravelCacheAdapter;

class FixedLaravelCacheAdapter extends LaravelCacheAdapter
{
    public function collect(bool $sortMetrics = true): array
    {
        $this->gauges = $this->fetch(Gauge::TYPE);
        $this->counters = $this->fetch(Counter::TYPE);
        $this->histograms = $this->fetch(Histogram::TYPE);
        $this->summaries = $this->fetch(Summary::TYPE);

        $metrics = $this->internalCollect($this->counters, $sortMetrics);
        $metrics = array_merge($metrics, $this->internalCollect($this->gauges, $sortMetrics));
        $metrics = array_merge($metrics, $this->collectHistograms());
        $metrics = array_merge($metrics, $this->collectSummaries());

        return $metrics;
    }
}
