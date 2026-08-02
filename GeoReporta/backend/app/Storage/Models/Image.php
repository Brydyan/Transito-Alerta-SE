<?php

declare(strict_types=1);

namespace App\Storage\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * A single stored image owned by any morph-mapped model (`incident`,
 * `comment`, `user` — see `Relation::enforceMorphMap` in
 * `AppServiceProvider::boot()`).
 *
 * `storage_path` is a bare object key (never a resolved URL) — resolving
 * to a client-facing URL is the caller's responsibility via
 * `StorageService::proxyUrl()`.
 */
class Image extends Model
{
    protected $fillable = [
        'imageable_type',
        'imageable_id',
        'storage_path',
        'original_name',
        'mime_type',
        'size',
        'is_thumbnail',
        'sort_order',
        'caption',
    ];

    protected function casts(): array
    {
        return [
            'imageable_id' => 'integer',
            'size' => 'integer',
            'sort_order' => 'integer',
            'is_thumbnail' => 'boolean',
        ];
    }

    public function imageable(): MorphTo
    {
        return $this->morphTo();
    }
}
