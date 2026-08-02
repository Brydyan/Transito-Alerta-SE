<?php

declare(strict_types=1);

namespace App\Domains\Roles\Http;

use App\Domains\Permissions\Models\Permission;
use App\Domains\Roles\Http\Requests\StoreRoleRequest;
use App\Domains\Roles\Http\Requests\UpdateRoleRequest;
use App\Domains\Roles\Http\Resources\RoleCollection;
use App\Domains\Roles\Http\Resources\RoleResource;
use App\Domains\Roles\Models\Role;
use App\Domains\Roles\Repositories\RoleRepository;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;

class RoleController extends Controller
{
    use AuthorizesRequests;

    public function __construct(private readonly RoleRepository $roles)
    {
        $this->authorizeResource(Role::class, 'role');
    }

    public function index(Request $request): JsonResponse
    {
        $role = $this->roles->paginate(
            $request->only(['search', 'per_page']),
        );

        return new RoleCollection($role)->response();
    }

    public function store(StoreRoleRequest $request): JsonResponse
    {
        $role = $this->roles->create(
            $request->validated(),
        );

        return (new RoleResource($role))
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    public function show(int $id): JsonResponse
    {
        $role = $this->roles->findById($id);
        if ($role === null) {
            return response()->json([
                'message' => __('messages.role_not_found'),
            ], Response::HTTP_NOT_FOUND);
        }

        return (new RoleResource($role->load('permissions')))->withCatalog()->response();
    }

    public function update(UpdateRoleRequest $request, int $id): JsonResponse
    {
        $role = $this->roles->update($id, $request->validated());

        return new RoleResource($role)->response();
    }

    public function destroy(int $id): JsonResponse
    {
        $this->roles->delete($id);

        return response()->json(null, Response::HTTP_NO_CONTENT);
    }

    /**
     * Sincroniza el conjunto de permisos del rol.
     *
     * Solo `admin_sistema` puede ejecutar esta acción: asignar permisos
     * a un rol es una operación estructural que afecta las policies y
     * los Gates dinámicos generados en boot.
     */
    public function syncPermissions(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        if ($user === null || ! $user->isSystemAdmin()) {
            return response()->json([
                'message' => __('messages.role_sync_unauthorized'),
            ], Response::HTTP_FORBIDDEN);
        }

        $validated = $request->validate([
            'permissions' => 'required|array',
            'permissions.*' => 'integer|exists:permissions,permission_id',
        ]);

        $role = $this->roles->syncPermissions($id, $validated['permissions']);

        return (new RoleResource($role->load('permissions')))->response();
    }

    /**
     * Devuelve el catálogo de permisos disponibles, agrupados por resource.
     *
     * Solo lectura — los permisos son estructurales y se mantienen via seeders.
     * Este endpoint existe para alimentar la UI de asignación de permisos
     * a roles (ver roles.detail.component.js).
     */
    public function availablePermissions(Request $request): JsonResponse
    {
        $this->authorize('roles.view');

        $permissions = Permission::orderBy('resource')->orderBy('action')->get();

        $grouped = $permissions->groupBy('resource')->map(function ($items, $resource) {
            return [
                'resource' => $resource,
                'permissions' => $items->map(fn (Permission $p) => [
                    'id' => $p->permission_id,
                    'action' => $p->action,
                    'name' => $p->name,
                    'description' => $p->description,
                ])->values(),
            ];
        })->values();

        return response()->json(['data' => $grouped]);
    }

    /**
     * Flat list of the CURRENT user's own granted permission slugs
     * ("resource.action"), e.g. ["users.view", "users.create"].
     *
     * Exists so the frontend can authorize routes that have no dedicated
     * menu entry (e.g. /usuarios/crear — the sidebar only links to
     * /usuarios) without over- or under-granting: menuService.getMyMenu()
     * only tells the guard "which list pages can this user see," which is
     * NOT the same as "which specific actions can they take" — a role can
     * hold resource.view without resource.create (e.g. admin_organizacion
     * has organizations.view + organizations.update but NOT
     * organizations.create). No route/menu semantics here, just the raw
     * grant — any authenticated user, any role.
     */
    public function myPermissions(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user === null) {
            return response()->json(['message' => __('messages.unauthenticated')], Response::HTTP_UNAUTHORIZED);
        }

        // SC-127: Validar SIEMPRE contra role_permission, sin excepciones.
        // Antes: isAdmin() devolvía todos los permisos sin filtrar por role_permission.
        // Ahora: Cada rol (incluso admin_sistema) solo tiene los permisos en su tabla.
        $slugs = $user->role?->permissions()
            ->selectRaw("resource || '.' || action as slug")
            ->pluck('slug') ?? collect();

        return response()->json(['data' => $slugs->values()]);
    }
}
