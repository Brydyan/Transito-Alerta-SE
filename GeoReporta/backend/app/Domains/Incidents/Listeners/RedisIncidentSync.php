<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Listeners;

use App\Domains\Incidents\Jobs\SyncIncidentToRedisJob;
use App\Domains\Incidents\Models\Incident;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class RedisIncidentSync
{
    public function created(Incident $incident): void
    {
        $this->invalidateStatsCache($incident);
        $this->queueReconciliation($incident);
    }

    public function updated(Incident $incident): void
    {
        $this->invalidateStatsCache($incident);
        $this->queueReconciliation($incident);
    }

    public function deleted(Incident $incident): void
    {
        $this->invalidateStatsCache($incident);
        $this->queueReconciliation($incident);
    }

    public function forceDeleted(Incident $incident): void
    {
        $this->invalidateStatsCache($incident);
        $this->queueReconciliation($incident);
    }

    /**
     * Flush the incident-stats cache tag when an incident changes.
     * Tag-based invalidation is fast and avoids stale dashboard data.
     */
    private function invalidateStatsCache(Incident $incident): void
    {
        try {
            Cache::tags(['incident-stats'])->flush();
        } catch (\Throwable $e) {
            // Cache driver may not support tags (e.g., array driver in tests);
            // log and continue — stats will expire naturally via TTL.
            Log::debug('Failed to invalidate incident-stats cache', [
                'incident_id' => $incident->getKey(),
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function queueReconciliation(Incident $incident): void
    {
        $incidentId = (int) $incident->getKey();

        try {
            DB::afterCommit(function () use ($incidentId): void {
                try {
                    SyncIncidentToRedisJob::dispatch($incidentId);
                } catch (\Throwable $e) {
                    $this->logDispatchFailure($incidentId, $e);
                }
            });
        } catch (\Throwable $e) {
            $this->logDispatchFailure($incidentId, $e);
        }
    }

    private function logDispatchFailure(int $incidentId, \Throwable $e): void
    {
        Log::warning('Failed to queue incident Redis reconciliation', [
            'incident_id' => $incidentId,
            'error' => $e->getMessage(),
        ]);
    }
}
