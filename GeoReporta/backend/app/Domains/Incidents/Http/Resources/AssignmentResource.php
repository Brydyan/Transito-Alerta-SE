<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * JSON shape for the `assignments` sub-resource.
 *
 *   {
 *     "id": 42,
 *     "incident_id": 11,
 *     "user_id": 7,
 *     "role": "responsable",
 *     "created_at": "...",
 *     "updated_at": "...",
 *     "user": { ... } // only when eager-loaded
 *   }
 *
 * Two contract decisions worth pinning:
 *
 *   1. The DB column is `assignment_role` (the migration kept that name
 *      to match the historical pivot conventions) — but the API
 *      contract surfaces it as `role` because:
 *         - the URL segment is `/assignments/{id}`, not `/assignment_roles/...`
 *         - the spec calls it "rol" in Spanish-only client contexts
 *         - the front-end renders an "Rol" column anyway
 *      Renaming at the resource boundary decouples the wire format
 *      from the schema, which protects future column renames.
 *
 *   2. `user` is gated on `whenLoaded` so the controller's index path
 *      (which already eager-loads users in one round-trip via whereIn)
 *      doesn't accidentally trigger an N+1 if the relationship is
 *      forgotten at the controller — the field simply disappears when
 *      the relation isn't loaded, instead of issuing a follow-up
 *      query.
 */
class AssignmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'incident_id' => $this->incident_id,
            'user_id' => $this->user_id,
            'role' => $this->assignment_role,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'user' => $this->whenLoaded('user'),
        ];
    }
}
