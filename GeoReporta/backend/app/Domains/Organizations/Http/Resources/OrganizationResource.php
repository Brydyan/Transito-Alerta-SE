<?php

declare(strict_types=1);

namespace App\Domains\Organizations\Http\Resources;

use App\Domains\IncidentCategories\Http\Resources\IncidentCategoryResource;
use App\Domains\IncidentCategories\Repositories\IncidentCategoryRepository;
use App\Domains\Locations\Repositories\LocationRepository;
use App\Domains\Organizations\Models\Organization;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class OrganizationResource extends JsonResource
{
    /**
     * When true, embeds organizations (parent list) and categories catalogs in the response.
     * Location data is provided via location_path (ordered ancestor chain) on the OrganizationResource
     * itself, loaded progressively on the frontend via locationService.
     * Enabled only by show() so edit-mode forms need a single GET /organizations/:id.
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
            'location_id' => $this->location_id,
            'location' => $this->whenLoaded('location'),
            'parent_id' => $this->parent_id,
            'parent' => $this->whenLoaded('parent'),
            'children' => OrganizationResource::collection($this->whenLoaded('children')),
            'incident_category' => new IncidentCategoryResource($this->whenLoaded('category')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
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

        if ($this->withCatalog) {
            $cats = app(IncidentCategoryRepository::class)->tree();

            $data['organizations'] = Organization::orderBy('name')
                ->get(['id', 'name', 'parent_id'])
                ->map(fn (Organization $o) => [
                    'id' => $o->id,
                    'name' => $o->name,
                    'parent_id' => $o->parent_id,
                ])
                ->values();

            $data['categories'] = $cats->map(fn ($c) => [
                'id' => $c->id,
                'name' => $c->name,
                'parent_id' => $c->parent_id,
            ])->values();
        }

        return $data;
    }
}
