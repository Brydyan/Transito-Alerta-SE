<?php

declare(strict_types=1);

namespace App\Domains\Organizations\Http;

use App\Domains\IncidentCategories\Repositories\IncidentCategoryRepository;
use App\Domains\Organizations\Http\Requests\StoreOrganizationRequest;
use App\Domains\Organizations\Http\Requests\UpdateOrganizationRequest;
use App\Domains\Organizations\Http\Resources\OrganizationCollection;
use App\Domains\Organizations\Http\Resources\OrganizationResource;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Organizations\Repositories\OrganizationRepository;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;
use Illuminate\Validation\Rule;

class OrganizationController extends Controller
{
    use AuthorizesRequests;

    public function __construct(
        private readonly OrganizationRepository $organizations,
        private readonly IncidentCategoryRepository $categories,
    ) {
        $this->authorizeResource(Organization::class, 'organization');
    }

    public function tree(): JsonResponse
    {
        $tree = $this->organizations->tree();

        return response()->json(['data' => OrganizationResource::collection($tree)]);
    }

    public function index(Request $request): JsonResponse
    {
        $organizations = $this->organizations->paginate(
            $request->only(['search', 'location_id', 'per_page']),
        );

        return (new OrganizationCollection($organizations))->response();
    }

    public function store(StoreOrganizationRequest $request): JsonResponse
    {
        $organization = $this->organizations->create(
            $request->validated(),
        );
        $organization->load(['category', 'location', 'parent']);

        return (new OrganizationResource($organization))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(Organization $organization): JsonResponse
    {
        $organization->load(['category', 'location', 'parent']);

        return (new OrganizationResource($organization))->withCatalog()->response();
    }

    public function update(UpdateOrganizationRequest $request, Organization $organization): JsonResponse
    {
        $organization = $this->organizations->update($organization->id, $request->validated());
        $organization->load(['category', 'location', 'parent']);

        return (new OrganizationResource($organization))->response();
    }

    public function destroy(Organization $organization): JsonResponse
    {
        $this->organizations->delete($organization->id);

        return response()->json(null, Response::HTTP_NO_CONTENT);
    }

    /**
     * Returns the catalogs needed to render the organization create/edit form
     * in a single request:
     *   - organizations: flat list of existing orgs (for the parent selector)
     *   - categories: flat list of root incident categories
     *
     * Location data is loaded progressively via locationService on the frontend,
     * using location_path from the organization detail endpoint for preselection.
     * Authorization: reuses the viewAny Organization policy gate.
     */
    public function formData(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Organization::class);

        $cats = $this->categories->tree(); // returns all nodes; frontend filters roots

        return response()->json([
            'organizations' => $this->organizations->catalog(withParent: true),
            'categories' => $cats->map(fn ($c) => [
                'id' => $c->id,
                'name' => $c->name,
                'parent_id' => $c->parent_id,
            ])->values(),
        ]);
    }

    /**
     * Preview of the organizations that will be notified when a new
     * incident is created with the given (location_id, category_id) pair.
     * Used by the incident form (Paso 4 — Revisión Final) so the user can
     * see before submitting which entities will be reached and which one
     * is the primary claimable org (the one IncidentController::store
     * would auto-assign via `findForLocation`).
     *
     * Authorization: any authenticated user can preview (they need it to
     * complete the incident creation flow). The data is read-only and
     * scoped to the location/category they themselves selected.
     */
    public function notifiedFor(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'location_id' => ['required', 'integer', Rule::exists('locations', 'id')],
            'category_id' => ['required', 'integer', Rule::exists('incident_categories', 'id')],
        ]);

        $orgs = $this->organizations->findNotifiedFor(
            (int) $validated['location_id'],
            (int) $validated['category_id'],
        );

        // The "claimable" org is the one IncidentController::store will
        // auto-assign via findForLocation. We compute it separately so the
        // frontend can render a single badge without re-deriving the rule.
        // It must respect the category too — otherwise the badge could mark
        // as "Principal" an org that does not cover the selected category.
        $claimable = $this->organizations->findForLocation(
            (int) $validated['location_id'],
            (int) $validated['category_id'],
        );
        $claimableId = $claimable?->id;

        $data = $orgs->map(function (Organization $org) use ($request, $claimableId) {
            $payload = (new OrganizationResource($org))->resolve($request);
            $payload['is_claimable'] = $org->id === $claimableId;

            return $payload;
        })->values();

        return response()->json(['data' => $data]);
    }
}
