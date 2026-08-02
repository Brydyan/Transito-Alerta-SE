<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http;

use App\Domains\Incidents\Models\FeedService;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Incidents\Repositories\IncidentRepository;
use App\Domains\Users\Services\UserAnonymizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * HTTP shell del query side unificado del mapa/feed de Incidencias.
 *
 * @cqrs-role query-http-shell
 *
 * Es el único entry point de lectura del módulo. Despacha por rol:
 * staff → Postgres vía IncidentRepository (con el mismo org-scoping de
 * /api/incidents), citizen → read model Redis vía FeedService.
 *
 * El feed ciudadano NUNCA debe pasar por IncidentRepository directamente:
 * si necesitás agregar un filtro o campo, va en FeedService (read model)
 * y en RedisIncidentSync (proyección) juntos.
 *
 * Unified read-side for the incidents map/feed — one endpoint for every
 * role now that auth is mandatory everywhere (the anonymous "Visitante"
 * role was retired; see docs/Requisitos/SRS.md RF-SW-008). Previously
 * this was two components/two endpoints: the admin map hit `/incidents`
 * (live Postgres, org-scoped) and the citizen map hit this endpoint
 * (Redis-cached, unscoped-by-design for anonymous traffic). Auth is now
 * mandatory, so the split can collapse to one route, branching on role
 * instead of on "is there a token":
 *
 *   - Staff (admin_sistema / admin_organizacion / operador_organizacion /
 *     operador_sistema) → live Postgres via IncidentRepository, same
 *     org-scoping `EloquentIncidentRepository::applyFilters` already
 *     applies to `/incidents`. bbox/pagination behave identically to the
 *     old admin-only map.
 *   - `usuario` (citizen) → stays on the Redis-backed `FeedService` path.
 *     This is the one genuinely high-traffic read (many citizens, one
 *     shared city-wide feed), worth keeping insulated from Postgres.
 *
 * Both branches return the same slim item shape (id/title/status/
 * priority/created_at/geom/category{}/organization{}/user{}/location{})
 * so the single frontend map component (`mapa.component.js`) doesn't
 * need to know which branch served a given response.
 */
class FeedController extends Controller
{
    private const RELATIONS = ['category', 'organization', 'user', 'location'];

    public function __construct(
        private readonly IncidentRepository $incidents,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user === null) {
            abort(401, 'Unauthenticated.');
        }

        if (! $user->isRegularUser()) {
            // Staff path: requiere incidents.view (mismos datos que /api/incidents).
            // Defense-in-depth: el frontend ya gatera la ruta, pero si alguien
            // pega al endpoint directo sin el permiso, se rechaza.
            if (! $user->can('incidents.view')) {
                abort(403, 'No tienes permiso para ver el feed de incidencias.');
            }

            return $this->staffFeed($request);
        }

        // Ciudadano: requiere feed.view explícito.
        // El frontend no muestra la entrada de menú sin feed.view,
        // pero el backend también lo exige por defensa en profundidad.
        if (! $user->can('feed.view')) {
            abort(403, 'No tienes permiso para ver el feed ciudadano.');
        }

        $result = app(FeedService::class)->getFeed(
            status: $request->get('status'),
            organizationId: $request->filled('organization_id') ? (int) $request->integer('organization_id') : null,
            locationId: $request->filled('location_id') ? (int) $request->integer('location_id') : null,
            page: max(1, (int) $request->integer('page', 1)),
            perPage: min(max(1, (int) $request->integer('per_page', 12)), 50),
        );

        return response()->json($result);
    }

    /**
     * Staff path — mirrors IncidentController::index's validation/scoping/
     * bbox contract, reshaped into the feed's slim item contract (a map
     * view with up to 500 markers doesn't need the full IncidentResource
     * payload — images, description, status_history, etc).
     */
    private function staffFeed(Request $request): JsonResponse
    {
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
            'per_page' => ['nullable', 'integer', 'min:1', 'max:500'],
        ]) + ['relations' => self::RELATIONS];

        $hardCap = isset($validated['bbox']) ? 500 : null;

        $incidents = $this->incidents->paginate($validated, perPage: 20, hardCap: $hardCap);

        return response()->json([
            'data' => $incidents->getCollection()
                ->map(fn (Incident $incident) => $this->mapToFeedItem($incident, $request))
                ->values()
                ->all(),
            'meta' => [
                'current_page' => $incidents->currentPage(),
                'per_page' => $incidents->perPage(),
                'total' => $incidents->total(),
                'last_page' => $incidents->lastPage(),
                'from' => $incidents->firstItem(),
                'to' => $incidents->lastItem(),
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function mapToFeedItem(Incident $incident, Request $request): array
    {
        return [
            'id' => $incident->id,
            'incident_category_id' => $incident->incident_category_id,
            'organization_id' => $incident->organization_id,
            'user_id' => $incident->user_id,
            'location_id' => $incident->location_id,
            'title' => $incident->title,
            'status' => $incident->status?->value,
            'priority' => $incident->priority?->value,
            'resolution_date' => $incident->resolution_date,
            'created_at' => $incident->created_at,
            'updated_at' => $incident->updated_at,
            'geom' => $incident->geom ? json_decode($incident->geom->toJson()) : null,
            'category' => $incident->relationLoaded('category') && $incident->category
                ? ['id' => $incident->category->id, 'name' => $incident->category->name]
                : null,
            'organization' => $incident->relationLoaded('organization') && $incident->organization
                ? ['id' => $incident->organization->id, 'name' => $incident->organization->name]
                : null,
            'user' => $incident->relationLoaded('user') && $incident->user
                // Issue #234 — staff path still serializes the user through
                // the same anonymizer so the shape stays consistent across
                // both branches of the feed. Operators+ see real data,
                // a regular user here would be impossible (the staff branch
                // is gated above by `isRegularUser()`), but the contract
                // is uniform.
                ? app(UserAnonymizer::class)->anonymize($incident->user, $request->user())
                : null,
            'location' => $incident->relationLoaded('location') && $incident->location
                ? ['id' => $incident->location->id, 'name' => $incident->location->name]
                : null,
        ];
    }
}
