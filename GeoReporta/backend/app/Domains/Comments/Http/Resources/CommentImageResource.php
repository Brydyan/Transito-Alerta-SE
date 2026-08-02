<?php

declare(strict_types=1);

namespace App\Domains\Comments\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Serializes an `App\Storage\Models\Image` row owned by a `Comment`
 * (image-persistence-polymorphic, WU6 cutover).
 *
 * The JSON contract is unchanged from the legacy `CommentImage`-backed
 * resource: `storage_path` is exposed under the `url` key (D7 — comments
 * keep returning a bare storage key, not a proxied URL, because
 * `frontend/app/utils/format.js`'s `getCommentImageUrl()` already
 * resolves bare keys against `STORAGE_BASE`) and `imageable_id` is
 * exposed under the `comment_id` key so no frontend consumer needs to
 * change.
 */
class CommentImageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'comment_id' => $this->imageable_id,
            'url' => $this->storage_path,
            'caption' => $this->caption,
            'sort_order' => $this->sort_order,
            'created_at' => $this->created_at,
        ];
    }
}
