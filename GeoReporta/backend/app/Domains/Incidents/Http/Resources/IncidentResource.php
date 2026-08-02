<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http\Resources;

use App\Domains\Locations\Http\Resources\LocationResource;
use App\Domains\Locations\Repositories\LocationRepository;
use App\Domains\Users\Services\UserAnonymizer;
use App\Storage\StorageService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

class IncidentResource extends JsonResource
{
    /**
     * When true, embeds status_history and assignments in the response.
     * Enabled only by show() — list/store/update are unaffected.
     */
    public bool $withDetail = false;

    public function withDetail(bool $value = true): static
    {
        $this->withDetail = $value;

        return $this;
    }

    public function toArray(Request $request): array
    {
        $storage = app(StorageService::class);
        // Centralised in one place so every payload that embeds a user
        // (reporter, assignment owner, comment author) reads the same
        // privacy policy. Operators keep the real identity; regular
        // viewers see only the id + is_anonymous flag (issue #234).
        $anonymizer = app(UserAnonymizer::class);

        // NOTE (image-persistence-polymorphic, WU2/WU5): `images` used to be
        // both a legacy JSON column on Incident AND the real MorphMany
        // relation name — the dead cast entry shadowed the relation on
        // property access, so `whenLoaded('images')` (and `$this->images`)
        // could not be trusted. That collision is fixed post-WU8:
        // `Incident::$fillable`/`casts()` no longer declare `images`, so
        // `$this->resource->images` (property) would now resolve
        // identically to the two branches below. This explicit
        // `relationLoaded()`/`getRelation()` check is kept anyway — it is
        // still correct and equally clear, and there is no functional
        // reason to change it now that the underlying bug is gone.
        $images = $this->resource->relationLoaded('images')
            ? $this->resource->getRelation('images')
            : $this->resource->images()->get();

        // Genuine bug fix (image-persistence-polymorphic, WU5): the
        // thumbnail is now selected via the real `is_thumbnail` flag
        // enforced by the DB (one true per owner, WU2's D4 partial unique
        // index), not by array/sort_order position ($images[0]).
        $thumbnail = $images->firstWhere('is_thumbnail', true) ?? $images->first();

        $data = [
            'id' => $this->id,
            'incident_category_id' => $this->incident_category_id,
            'organization_id' => $this->organization_id,
            'user_id' => $this->user_id,
            'location_id' => $this->location_id,
            'title' => $this->title,
            'description' => $this->description,
            'status' => $this->status?->value,
            'priority' => $this->priority?->value,
            'resolution_date' => $this->resolution_date,
            'geom' => $this->when($this->geom !== null, fn () => json_decode($this->geom->toJson())),
            'created_at' => $this->created_at,
            'claimed_by' => $this->claimed_by,
            'claimed_at' => $this->claimed_at,
            'category' => $this->whenLoaded('category'),
            'organization' => $this->whenLoaded('organization'),
            // Issue #234 — anonymize the reporter for regular viewers.
            // The shape is identical to a real user payload (both have
            // the same keys), with `is_anonymous` flagging which is which,
            // so the frontend can branch on it without second-guessing.
            'user' => $this->whenLoaded('user', fn () => $anonymizer->anonymize(
                $this->user,
                $request->user(),
            )),
            // Use LocationResource to ensure geom is always serialized (null when absent)
            'location' => $this->whenLoaded('location', fn () => new LocationResource($this->location)),
            'thumbnail_url' => $thumbnail
                ? $storage->proxyUrl($thumbnail->storage_path)
                : null,
            'images' => $images->map(fn ($img) => [
                'id' => $img->id,
                'url' => $storage->proxyUrl($img->storage_path),
                'original_name' => $img->original_name,
                'is_thumbnail' => $img->is_thumbnail,
            ])->values()->all(),
        ];

        // Add location_path for progressive-loading preselection cascade
        // Uses ancestors() to get root-to-leaf ordered chain for deterministic select preselection
        if ($this->location_id !== null) {
            $locationRepo = app(LocationRepository::class);
            $ancestors = $locationRepo->ancestors($this->location_id);
            $data['location_path'] = $ancestors->map(fn ($location) => [
                'id' => $location->id,
                'name' => $location->name,
                'level' => $location->level->value,
                'geom' => $location->geom !== null ? json_decode($location->geom->toJson()) : null,
            ])->values()->all();
        }

        if ($this->withDetail) {
            // Status history — read via raw query (same as StatusHistoryController)
            // to avoid creating an Eloquent model just for a simple log table.
            $data['status_history'] = DB::table('status_history')
                ->where('incident_id', $this->id)
                ->orderBy('created_at')
                ->orderBy('id')
                ->get(['id', 'user_id', 'previous_status', 'new_status', 'notes', 'created_at'])
                ->map(fn ($r) => [
                    'id' => (int) $r->id,
                    'user_id' => (int) $r->user_id,
                    'previous_status' => $r->previous_status,
                    'new_status' => $r->new_status,
                    'notes' => $r->notes ?? null,
                    'created_at' => $r->created_at,
                ])
                ->all();

            // Current assignments — eager-load user to match AssignmentResource shape.
            $data['assignments'] = $this->whenLoaded(
                'assignments',
                fn () => $this->assignments->map(fn ($a) => [
                    'id' => $a->id,
                    'incident_id' => $a->incident_id,
                    'user_id' => $a->user_id,
                    'role' => $a->assignment_role,
                    'created_at' => $a->created_at,
                    'updated_at' => $a->updated_at,
                    // Issue #234 — anonymize assignment owners the same
                    // way the reporter is anonymized. Operators+ keep the
                    // real user; regular viewers see the id-only payload.
                    'user' => $a->relationLoaded('user')
                        ? $anonymizer->anonymize($a->user, $request->user())
                        : null,
                ])->values()->all(),
            );
        }

        return $data;
    }
}
