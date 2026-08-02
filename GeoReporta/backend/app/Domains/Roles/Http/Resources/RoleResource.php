<?php

declare(strict_types=1);

namespace App\Domains\Roles\Http\Resources;

use App\Domains\Permissions\Models\Permission;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RoleResource extends JsonResource
{
    /**
     * When true, includes the full permissions catalog grouped by resource.
     * Used by show() so the frontend can build the permission editor
     * in a single request instead of calling GET /permissions separately.
     */
    public bool $withCatalog = false;

    public function withCatalog(bool $value = true): static
    {
        $this->withCatalog = $value;

        return $this;
    }

    public function toArray(Request $request): array
    {
        $data = [
            'id' => $this->id,
            'name' => $this->name,
            'permissions' => $this->whenLoaded('permissions', fn () => $this->permissions->map(fn ($permission) => [
                'id' => $permission->permission_id,
                'resource' => $permission->resource,
                'action' => $permission->action,
                'created_at' => $permission->pivot->created_at,
                'deleted_at' => $permission->pivot->deleted_at,
                'reassigned_at' => $permission->pivot->reassigned_at,
            ])),
        ];

        if ($this->withCatalog) {
            $data['available_permissions'] = Permission::orderBy('resource')
                ->orderBy('action')
                ->get()
                ->groupBy('resource')
                ->map(fn ($items, $resource) => [
                    'resource' => $resource,
                    'permissions' => $items->map(fn (Permission $p) => [
                        'id' => $p->permission_id,
                        'action' => $p->action,
                        'name' => $p->name,
                        'description' => $p->description,
                    ])->values(),
                ])
                ->values();
        }

        return $data;
    }
}
