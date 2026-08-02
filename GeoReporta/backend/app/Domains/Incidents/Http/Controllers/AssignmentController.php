<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http\Controllers;

use App\Domains\Comments\Http\CommentController;
use App\Domains\Incidents\Http\Requests\StoreAssignmentRequest;
use App\Domains\Incidents\Http\Requests\UpdateAssignmentRequest;
use App\Domains\Incidents\Http\Resources\AssignmentCollection;
use App\Domains\Incidents\Http\Resources\AssignmentResource;
use App\Domains\Incidents\Models\Assignment;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Incidents\Services\AssignmentService;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * HTTP shell del command side para el sub-recurso `assignments`.
 *
 * @cqrs-role command-http-shell
 *
 * Cubre index/store/update/destroy de asignaciones. No embebe reglas de
 * negocio: delega en AssignmentService, que es quien valida invariantes
 * antes de tocar Postgres.
 *
 * HTTP shell for the `assignments` sub-resource.
 *
 *   GET    /api/incidents/{incident}/assignments
 *   POST   /api/incidents/{incident}/assignments
 *   PUT    /api/incidents/{incident}/assignments/{assignment}
 *   DELETE /api/incidents/{incident}/assignments/{assignment}
 *
 * Layered in PR #2 (this batch):
 *   - {@see AssignmentPolicy} via $this->authorizeResource() — gates
 *     `viewAny`, `create`, and `delete` at the HTTP boundary.
 *   - {@see StoreAssignmentRequest} — replaces the raw Request param
 *     that PR #1 used so the controller body never sees raw input.
 *   - {@see AssignmentResource} / AssignmentCollection — replaces the
 *     inline JSON shaping PR #1 carried, so the shape is one place
 *     and the controller can `return new AssignmentCollection(...)`
 *     like the rest of the codebase.
 *   - `authorizeIncidentOrgScope()` — mirrors CommentController: the
 *     policy's `create()` receives no model instance (Gate does not
 *     pass a parent Incident to list/create-level checks), so org
 *     scoping is enforced inline here. System admins bypass via the
 *     global Gate::before registered in AppServiceProvider.
 *
 * Business rules (duplicate user, max 1 responsable, unknown role)
 * stay inside {@see AssignmentService} — this controller is a shell.
 */
class AssignmentController extends Controller
{
    use AuthorizesRequests;

    public function __construct()
    {
        // The assignment route param is `{assignment}` and resolves to
        // an Eloquent Assignment via route-model binding (see
        // Assignment model). The `incident` param is resolved to
        // Incident by Incident's own route-model binding (typed-hint on
        // each method signature).
        //
        // Mapping applied:
        //   index   → viewAny  (AssignmentPolicy::viewAny  → incidents.view)
        //   store   → create   (PermissionPolicy::create    → assignments.create)
        //   update  → update   (PermissionPolicy::update    → assignments.update)
        //   destroy → delete   (PermissionPolicy::delete    → assignments.delete)
        $this->authorizeResource(Assignment::class, 'assignment');
    }

    public function index(Request $request, Incident $incident): AssignmentCollection
    {
        $this->authorizeIncidentOrgScope($incident);

        $perPage = (int) $request->integer('per_page', 20);
        $perPage = max(1, min($perPage, 100));

        // Eager-load `user` so AssignmentResource::whenLoaded('user')
        // emits a populated payload without N+1 (one extra round-trip
        // for the whole page, regardless of page size).
        $rows = Assignment::query()
            ->where('incident_id', $incident->id)
            ->with('user')
            ->orderBy('id')
            ->paginate($perPage);

        return new AssignmentCollection($rows);
    }

    public function store(
        StoreAssignmentRequest $request,
        Incident $incident,
        AssignmentService $service,
    ): JsonResponse {
        $this->authorizeIncidentOrgScope($incident);

        $userId = (int) $request->input('user_id');
        $role = (string) $request->input('role');

        $service->assign($incident, $userId, $role);

        // Re-read the row we just wrote so the response mirrors
        // `index`'s shape — eager-load the user so the resource can
        // surface first_name / last_name without a follow-up fetch.
        $row = Assignment::query()
            ->where('incident_id', $incident->id)
            ->where('user_id', $userId)
            ->with('user')
            ->firstOrFail();

        return (new AssignmentResource($row))
            ->response()
            ->setStatusCode(201);
    }

    public function destroy(
        Incident $incident,
        Assignment $assignment,
        AssignmentService $service,
    ): JsonResponse {
        $this->authorizeIncidentOrgScope($incident);

        $service->unassign($incident, $assignment->id);

        return response()->json(null, 204);
    }

    public function update(
        UpdateAssignmentRequest $request,
        Incident $incident,
        Assignment $assignment,
    ): JsonResponse {
        $this->authorizeIncidentOrgScope($incident);
        $this->authorize('update', $assignment);

        $role = (string) $request->input('role');

        $assignment->update(['assignment_role' => $role]);

        // Reload with eager-loaded user so response mirrors index shape
        $assignment->load('user');

        return (new AssignmentResource($assignment))->response();
    }

    /**
     * Org-scope enforcement for create/delete. Mirrors
     * {@see CommentController::authorizeIncidentOrgScope()}
     * because Laravel's authorize() does not pass the parent Incident
     * to list/create-level policy calls.
     *
     * Rules:
     *   - System admins: bypass (covered globally by Gate::before in
     *     AppServiceProvider — kept here explicitly for the CommentPolicy
     *     parity).
     *   - Users with no organization (citizens, operador_sistema):
     *     bypass — they have no org-scoped permissions to violate.
     *   - Org admins and operators: must be in the same organization
     *     as the incident — otherwise the policy's `can('...')` grant
     *     would let them touch any org's incidents.
     */
    private function authorizeIncidentOrgScope(Incident $incident): void
    {
        $user = auth()->user();

        if ($user === null) {
            abort(401);
        }

        if ($user->isSystemAdmin() || $user->organization_id === null) {
            return;
        }

        if ($incident->organization_id !== null && $incident->organization_id === $user->organization_id) {
            return;
        }

        abort(403, 'No tienes acceso a las asignaciones de esta organización.');
    }
}
