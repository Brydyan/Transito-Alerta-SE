<?php

declare(strict_types=1);

namespace App\Domains\Comments\Models;

use App\Domains\Comments\Observers\CommentObserver;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Users\Models\User;
use App\Storage\Models\Image;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Comment extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'incident_id',
        'user_id',
        'message',
        'parent_id',
    ];

    protected function casts(): array
    {
        return [
            'incident_id' => 'integer',
            'user_id' => 'integer',
            'parent_id' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::observe(CommentObserver::class);
    }

    public function incident(): BelongsTo
    {
        return $this->belongsTo(Incident::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Comment::class, 'parent_id');
    }

    public function replies(): HasMany
    {
        return $this->hasMany(Comment::class, 'parent_id');
    }

    /**
     * Polymorphic `images` table rows for this comment, ordered by
     * `sort_order` (image-persistence-polymorphic, WU2/WU6 cutover).
     *
     * Replaces the legacy `CommentImage` hasMany relation that used to
     * live under this same method name — `CommentObserver`,
     * `CommentImageController`, `CommentResource`, and
     * `SyncCommentToRedisJob` all reference the `'images'` relation
     * string, which now resolves to the shared `images` table via
     * `App\Storage\Models\Image` instead of the legacy `comment_images`
     * table.
     */
    public function images(): MorphMany
    {
        return $this->morphMany(Image::class, 'imageable')->orderBy('sort_order');
    }

    /**
     * Polymorphic `images` table rows for this comment, ordered by
     * `sort_order` (image-persistence-polymorphic, WU2).
     *
     * Deliberately named differently from `images()` above: that method
     * is load-bearing today (`CommentObserver`, `CommentImageController`,
     * `CommentResource`, `SyncCommentToRedisJob` all reference the
     * `'images'` relation string / `CommentImage` hasMany). WU6 (Comment
     * cutover) is responsible for retiring `CommentImage` and repointing
     * `images()` itself to this polymorphic relation — do not merge the
     * two before then.
     */
    public function polymorphicImages(): MorphMany
    {
        return $this->morphMany(Image::class, 'imageable')->orderBy('sort_order');
    }

    public function getDepthAttribute(): int
    {
        if ($this->parent_id === null) {
            return 0;
        }

        if ($this->parent?->parent_id === null) {
            return 1;
        }

        return 2;
    }
}
