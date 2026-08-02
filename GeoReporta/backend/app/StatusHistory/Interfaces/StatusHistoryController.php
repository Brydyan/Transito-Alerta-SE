<?php

declare(strict_types=1);

namespace App\StatusHistory\Interfaces;

use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Models\Incident;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Status history for an incident.
 *
 * Reads from the `status_history` table. Rows are inserted automatically by
 * the PostgreSQL trigger `trg_log_incident_status` (see migration
 * 2026_06_15_000010_create_incident_triggers) on every UPDATE that changes
 * `status`. User attribution comes from `NEW.user_id` at trigger time, so
 * the "actor" recorded here is the incident's reporter, not necessarily the
 * user who changed the status. The frontend can show this with appropriate
 * framing.
 *
 * Authorization (R-19): the endpoint reuses the parent incident's view
 * permission (IncidentPolicy::view, driven by the `incidents.view` gate).
 * Status history is a sub-resource of an incident — if you can't view the
 * incident, the history is meaningless — so we resolve the parent first,
 * then authorize against it. A bogus incident id surfaces as 404 via
 * {@see Incident::findOrFail()} BEFORE the authorize check; a valid
 * incident the user cannot view surfaces as 403.
 */
class StatusHistoryController
{
    use AuthorizesRequests;

    public function index(Request $request, int $incidentId): JsonResponse
    {
        $incident = Incident::findOrFail($incidentId);

        // Status history is staff-only (status-history.view). Citizens can view
        // incident details via feed, but not the administrative status log.
        // Explicit permission check prevents feed.detail from leaking into
        // operations reserved for status-history.view gate.
        if (! $request->user()?->can('status-history.view')) {
            abort(403);
        }

        $rows = DB::table('status_history')
            ->where('incident_id', $incident->id)
            ->orderBy('created_at')
            ->orderBy('id')
            ->get(['id', 'user_id', 'previous_status', 'new_status', 'created_at']);

        return response()->json([
            'data' => $rows->map(fn ($r) => [
                'id' => (int) $r->id,
                'user_id' => (int) $r->user_id,
                'previous_status' => $r->previous_status,
                'new_status' => $r->new_status,
                'created_at' => $r->created_at,
            ])->all(),
        ]);
    }

    public function availableStatuses(): JsonResponse
    {
        return response()->json(IncidentStatus::availableStatuses());
    }
}
