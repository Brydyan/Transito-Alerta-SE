<?php

declare(strict_types=1);

namespace App\Domains\Users\Http;

use App\Domains\Roles\Enums\UserRole;
use App\Domains\Users\Services\OperatorLocationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class OperatorLocationController extends Controller
{
    public function __construct(
        private readonly OperatorLocationService $locations,
    ) {}

    /**
     * Roles allowed to PING their own location (update endpoint).
     *
     * Composed of:
     *  - UserRole::OperadorSistema
     *  - UserRole::OperadorOrganizacion
     *
     * SystemAdmin is allowed via the $user->isSystemAdmin() short-circuit,
     * and is intentionally NOT listed here so the same role-id set is
     * the single source of truth for non-admin tiers.
     */
    private const PING_ROLES = [
        UserRole::OperadorSistema->value,
        UserRole::OperadorOrganizacion->value,
    ];

    /**
     * Roles allowed to QUERY the operator-locations map (index endpoint).
     *
     * Includes the union of operator + admin-of-org tiers; SystemAdmin
     * is again handled by $user->isSystemAdmin() and not enumerated.
     */
    private const QUERY_ROLES = [
        UserRole::OperadorSistema->value,
        UserRole::AdminOrganizacion->value,
        UserRole::OperadorOrganizacion->value,
    ];

    /**
     * Update the logged-in operator's location in Redis.
     */
    public function update(Request $request): JsonResponse
    {
        $user = $request->user();

        // Solo admins de sistema, operadores de sistema u operadores de org pueden reportar ubicación
        if (! $user->isSystemAdmin() && ! in_array($user->role?->name, self::PING_ROLES, true)) {
            return response()->json(['message' => __('messages.unauthorized')], 403);
        }

        $data = $request->validate([
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lng' => ['required', 'numeric', 'between:-180,180'],
        ]);

        $this->locations->record($user, (float) $data['lat'], (float) $data['lng']);

        return response()->json(['status' => 'success']);
    }

    /**
     * Get active operator locations within the tenant/org boundaries.
     */
    public function index(Request $request): JsonResponse
    {
        $currentUser = $request->user();

        // Admins de sistema, operadores de sistema, admins de org u operadores de org
        if (! $currentUser->isSystemAdmin() && ! in_array($currentUser->role?->name, self::QUERY_ROLES, true)) {
            return response()->json(['message' => __('messages.unauthorized')], 403);
        }

        return response()->json($this->locations->activeFor($currentUser));
    }
}
