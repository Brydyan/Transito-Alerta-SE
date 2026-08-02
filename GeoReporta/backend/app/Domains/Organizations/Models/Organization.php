<?php

declare(strict_types=1);

namespace App\Domains\Organizations\Models;

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Locations\Models\Location;
use App\Domains\Users\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Organization extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name',
        'location_id',
        'parent_id',
        'incident_category_id',
        'max_active_claims',
    ];

    protected function casts(): array
    {
        return [
            // Normalise FK at the model boundary so consumers (e.g.
            // `OrganizationResource::toArray()` → `LocationRepository::ancestors(int $id)`)
            // always see `int`, not the raw JSON string from
            // `$request->validated()`. Matches the precedent set by
            // `Comment::$casts` and (after this change) `Incident::$casts`.
            'incident_category_id' => 'integer',
            'location_id' => 'integer',
            'max_active_claims' => 'integer',
            'parent_id' => 'integer',
        ];
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(IncidentCategory::class, 'incident_category_id');
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }
}
