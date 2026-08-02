<?php

declare(strict_types=1);

namespace App\Domains\Users\Http\Resources;

use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Enums\UserRole;
use App\Domains\Roles\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    /**
     * When true, embeds roles and organizations catalogs in the response.
     * Enabled only by show() so edit-mode forms need a single GET /users/:id.
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
            'email' => $this->email,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'phone' => $this->phone,
            'avatar' => $this->avatar,
            // Sourced from the `avatarImage()` morphOne relation
            // (image-persistence-polymorphic WU7), not the legacy
            // `profile_image_path` column — same bare storage-key shape
            // (D6). Not `whenLoaded()`: this key must always be present,
            // same as when it was a plain column, regardless of whether
            // every call site remembers to eager-load the relation.
            'profile_image_path' => $this->avatarImage?->storage_path,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'role' => $this->whenLoaded('role', fn () => [
                'id' => $this->role->id,
                'name' => $this->role->name,
            ]),
            'organization' => $this->whenLoaded('organization', fn () => [
                'id' => $this->organization->id,
                'name' => $this->organization->name,
            ]),
        ];

        if ($this->withCatalog) {
            $user = $request->user();

            $rolesQuery = Role::orderBy('name');
            $orgsQuery = Organization::orderBy('name');

            if ($user !== null && ! $user->isSystemAdmin()) {
                $rolesQuery->whereNotIn('name', [
                    UserRole::AdminSistema->value,
                    UserRole::OperadorSistema->value,
                    UserRole::AdminLegacy->value,
                ]);

                $orgsQuery->where('id', $user->organization_id);
            }

            $data['roles'] = $rolesQuery->get(['id', 'name'])
                ->map(fn (Role $r) => ['id' => $r->id, 'name' => $r->name])
                ->values();

            $data['organizations'] = $orgsQuery->get(['id', 'name'])
                ->map(fn (Organization $o) => ['id' => $o->id, 'name' => $o->name])
                ->values();
        }

        return $data;
    }
}
