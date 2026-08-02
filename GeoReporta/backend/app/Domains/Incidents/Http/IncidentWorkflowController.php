<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http;

use App\Domains\Incidents\Http\Resources\IncidentResource;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Incidents\Services\IncidentClaimService;
use App\Domains\Users\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;

/**
 * Multitenant claim/release actions for an incident.
 *
 * Separated from `IncidentController` so the CRUD controller stays focused
 * on the basic `apiResource` actions (index/show/store/update/destroy).
 * Both methods compose the service layer; they are thin shells whose only
 * job is to expose the HTTP boundary.
 */
class IncidentWorkflowController extends Controller
{
    /**
     * Toma (claim) una incidencia como OperadorOrg.
     */
    public function claim(Incident $incident, IncidentClaimService $service): JsonResponse
    {
        /** @var User $user */
        $user = auth()->user();
        $incident = $service->claim($incident->id, $user);

        return (new IncidentResource($incident))->response();
    }

    /**
     * Libera (release) una incidencia previamente claimeada.
     */
    public function release(Incident $incident, IncidentClaimService $service): JsonResponse
    {
        /** @var User $user */
        $user = auth()->user();
        $incident = $service->release($incident->id, $user);

        return (new IncidentResource($incident))->response();
    }
}
