<?php

declare(strict_types=1);

namespace App\Domains\Locations\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LocationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'code' => $this->code,
            'level' => $this->level,
            'parent_id' => $this->parent_id,
            'parent' => new self($this->whenLoaded('parent')),
            'children' => self::collection($this->whenLoaded('children')),
            // Always include geom for progressive-loading contract: null when not set
            'geom' => $this->geom !== null ? json_decode($this->geom->toJson()) : null,
        ];
    }
}
