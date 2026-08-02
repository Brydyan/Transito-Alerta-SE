<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http;

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Http\Requests\StoreIncidentRequest;
use App\Domains\Incidents\Http\Requests\UpdateIncidentRequest;
use App\Domains\Incidents\Http\Requests\UpdateIncidentStatusRequest;
use App\Domains\Incidents\Http\Resources\IncidentCollection;
use App\Domains\Incidents\Http\Resources\IncidentResource;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Incidents\Repositories\IncidentRepository;
use App\Domains\Incidents\Services\IncidentImageService;
use App\Domains\Organizations\Repositories\OrganizationRepository;
use App\Domains\Roles\Enums\UserRole;
use App\Domains\Users\Models\User;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use MatanYadaev\EloquentSpatial\Objects\Point;

/**
 * HTTP shell del command side de Incidencias.
 *
 * @cqrs-role command-http-shell
 *
 * Cubre el CRUD administrativo (index/show/store/update/updateStatus).
 * No embebe reglas de negocio: delega a IncidentRepository y a los
 * Services (AssignmentService, IncidentClaimService, IncidentImageService).
 * Cualquier mutación que pase por acá dispara los eventos Eloquent que
 * RedisIncidentSync escucha para mantener el read model.
 *
 * Si necesitás un endpoint que sirva datos sin escribir, considerá si
 * corresponde al command side (show/update con lectura incidental) o al
 * query side (FeedController / un nuevo ReadModel Controller).
 *
 * @see docs/Convenciones/architecture-cqrs-lite.md
 */
class IncidentController extends Controller
{
    use AuthorizesRequests;

    public function __construct(
        private readonly IncidentRepository $incidents,
        private readonly OrganizationRepository $organizations,
        private readonly IncidentImageService $images,
    ) {
        $this->authorizeResource(Incident::class, 'incident');
    }

    /**
     * Relations eagerly loaded for the list endpoint.
     *
     * Mirrors the fields exposed via `IncidentResource::toArray()` for the
     * list shape (`category`, `organization`, `user`, `location`). `comments`
     * is intentionally NOT a relation here — only the count is exposed via
     * `withCount('comments')` (kept in the repository).
     */
    private const INDEX_RELATIONS = ['category', 'organization', 'user', 'location', 'images'];

    public function index(Request $request): JsonResponse
    {
        // Inline map params validation (was MapBoundsRequest FormRequest).
        // One place to read; three fields actually filter the list.
        $validated = $request->validate([
            'bbox' => [
                'nullable',
                'string',
                'regex:/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/',
            ],
            'zoom' => ['nullable', 'integer', 'min:1', 'max:22'],
            'status' => ['nullable', 'string'],
            'priority' => ['nullable', 'string'],
            'location_id' => ['nullable', 'integer'],
            'incident_category_id' => ['nullable', 'integer'],
            'user_id' => ['nullable', 'integer'],
            'title' => ['nullable', 'string', 'max:200'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:500'],
            'relations' => ['nullable', 'array'],
            'relations.*' => ['string'],
        ]) + ['relations' => self::INDEX_RELATIONS];

        // The map frontend asks for 500 per page because a single bbox
        // viewport can legitimately hold >100 incidents in dense urban
        // areas. The default repo cap (100) is too tight here, so we
        // raise it only when a bbox is present. Other callers keep the
        // safe 100 cap.
        $hardCap = isset($validated['bbox']) ? 500 : null;

        $incidents = $this->incidents->paginate(
            $validated,
            perPage: 20,
            hardCap: $hardCap,
        );

        return (new IncidentCollection($incidents))->response();
    }

    public function store(StoreIncidentRequest $request): JsonResponse
    {
        $validated = $request->validated();
        IncidentCategory::findOrFail($validated['incident_category_id']);

        $data = array_merge($validated, [
            'user_id' => $request->user()->id,
        ]);

        $data = $this->castGeomToPoint($data);

        // Los archivos se manejan aparte — no mezclar con el create
        unset($data['images']);

        // Auto-asignar organización basada en la ubicación y categoría (B-02).
        // `findForLocation` también exige que la org cubra la categoría
        // (o sea transversal), igual que el preview del form — así la
        // asignación real nunca contradice lo que el usuario vio en
        // "Notificación" (Paso 4).
        if (empty($data['organization_id']) && ! empty($data['location_id'])) {
            $org = $this->organizations->findForLocation(
                (int) $data['location_id'],
                (int) $data['incident_category_id'],
            );
            if ($org !== null) {
                $data['organization_id'] = $org->id;
            }
        }

        $incident = $this->incidents->create($data);

        if ($request->hasFile('images')) {
            $this->images->upload($request->file('images'), $incident, true);
        }

        return (new IncidentResource($incident))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    /**
     * Relations eagerly loaded for the show endpoint.
     * `assignments.user` is included here (not in INDEX_RELATIONS) because
     * the detail view embeds assignments directly — the list endpoint does
     * not need them.
     * `resolutions.resolvedByUser` includes audit trail with resolver info.
     */
    private const SHOW_RELATIONS = ['category', 'organization', 'user', 'location', 'assignments.user', 'images'];

    public function show(Request $request, Incident $incident): JsonResponse
    {
        $incident->load(self::SHOW_RELATIONS);

        return (new IncidentResource($incident))->withDetail()->response();
    }

    public function update(UpdateIncidentRequest $request, Incident $incident): JsonResponse
    {
        $validated = $request->validated();
        $notes = $validated['notes'] ?? null;
        unset($validated['notes']);

        $data = $this->castGeomToPoint($validated);

        unset($data['images']);

        if ($request->hasFile('images')) {
            $hasExisting = $incident->images()->exists();
            $this->images->upload($request->file('images'), $incident, ! $hasExisting);
        }

        $incident = $this->incidents->update($incident->id, $data);

        if ($notes !== null) {
            DB::table('status_history')
                ->where('incident_id', $incident->id)
                ->latest('created_at')
                ->limit(1)
                ->update(['notes' => $notes]);
        }

        return (new IncidentResource($incident))->response();
    }

    public function destroy(Incident $incident): JsonResponse
    {
        $this->incidents->delete($incident->id);

        return response()->json(['message' => __('messages.incident_deleted')], Response::HTTP_OK);
    }

    public function updateStatus(UpdateIncidentStatusRequest $request, Incident $incident): JsonResponse
    {
        $validated = $request->validated();

        // Defense-in-depth: la request ya restringe status a
        // pending|in_progress|resolved, pero blindamos explícitamente
        // el endpoint para que nadie pueda cerrar una incidencia
        // directa (bypass del flujo de aprobación).
        if ($validated['status'] === IncidentStatus::Closed->value) {
            throw ValidationException::withMessages([
                'status' => 'El estado closed solo puede asignarse a través del flujo de aprobación.',
            ]);
        }

        // Permiso de update + regla de responsable, ambos en la Policy.
        $this->authorize('updateStatus', [$incident, $validated['status']]);

        $incident = $this->incidents->update($incident->id, ['status' => $validated['status']]);

        if (! empty($validated['notes'])) {
            DB::table('status_history')
                ->where('incident_id', $incident->id)
                ->latest('created_at')
                ->limit(1)
                ->update(['notes' => $validated['notes']]);
        }

        return (new IncidentResource($incident))->response();
    }

    /**
     * Normalizes accepted `geom` input shapes for spatial persistence.
     */
    private function castGeomToPoint(array $data): array
    {
        if (! isset($data['geom'])) {
            return $data;
        }

        $geom = match (true) {
            $data['geom'] instanceof Point => $data['geom'],
            is_array($data['geom']) => $data['geom'],
            is_string($data['geom']) => json_decode($data['geom'], true),
            default => null,
        };

        if ($geom instanceof Point) {
            return $data;
        }

        $coordinates = is_array($geom) ? ($geom['coordinates'] ?? null) : null;
        if (is_array($coordinates) && isset($coordinates[0], $coordinates[1])) {
            $data['geom'] = new Point((float) $coordinates[1], (float) $coordinates[0]);
        }

        return $data;
    }

    /**
     * Returns the list of operators (role = operador_organizacion) that
     * belong to the same organization as the incident.
     *
     * Replaces the two-request dance the frontend used to do:
     *   GET /roles?per_page=100  → find operador_organizacion role id
     *   GET /users?organization_id=X&role_id=Y → get operator list
     *
     * Authorization reuses the parent incident's view policy — if you can
     * see the incident you can see who could be assigned to it.
     */
    public function availableOperators(Request $request, Incident $incident): JsonResponse
    {
        $this->authorize('view', $incident);

        if ($incident->organization_id === null) {
            return response()->json(['data' => []]);
        }

        $operators = User::query()
            ->whereHas('role', fn ($q) => $q->where('name', UserRole::OperadorOrganizacion->value))
            ->where('organization_id', $incident->organization_id)
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->get(['id', 'first_name', 'last_name', 'email']);

        return response()->json([
            'data' => $operators->map(fn (User $u) => [
                'id' => $u->id,
                'first_name' => $u->first_name,
                'last_name' => $u->last_name,
                'email' => $u->email,
            ])->values(),
        ]);
    }
}
