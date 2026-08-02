<?php

declare(strict_types=1);

namespace App\Domains\Locations\Models;

use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Enums\LocationLevel;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use MatanYadaev\EloquentSpatial\Objects\MultiPolygon;
use MatanYadaev\EloquentSpatial\Traits\HasSpatial;
use Staudenmeir\LaravelAdjacencyList\Eloquent\HasRecursiveRelationships;

class Location extends Model
{
    use HasRecursiveRelationships, HasSpatial, SoftDeletes;

    protected $fillable = [
        'name',
        'code',
        'level',
        'parent_id',
        'geom',
    ];

    protected function casts(): array
    {
        return [
            'geom' => MultiPolygon::class,
            'level' => LocationLevel::class,
        ];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Location::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Location::class, 'parent_id');
    }

    public function incidents(): HasMany
    {
        return $this->hasMany(Incident::class);
    }

    public function fullPath(string $separator = ' > '): string
    {
        return $this->ancestorsAndSelf()
            ->orderBy('depth', 'desc')
            ->get()
            ->pluck('name')
            ->implode($separator);
    }
}
