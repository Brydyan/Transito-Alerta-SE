<?php

declare(strict_types=1);

namespace App\Domains\Comments\Http\Resources;

use App\Domains\Users\Services\UserAnonymizer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CommentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'incident_id' => $this->incident_id,
            'user_id' => $this->user_id,
            'message' => $this->message,
            'parent_id' => $this->parent_id,
            'depth' => $this->depth ?? 0,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            // Issue #234 — same privacy policy as the reporter: regular
            // viewers see only the author id; operators keep the real name.
            'user' => $this->whenLoaded('user', fn () => app(UserAnonymizer::class)->anonymize(
                $this->user,
                $request->user(),
            )),
            'images' => $this->whenLoaded('images', fn () => CommentImageResource::collection($this->images)),
            'parent' => $this->whenLoaded('parent'),
            'replies' => $this->whenLoaded('replies', fn () => self::collection($this->replies)),
        ];
    }
}
