<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Models;

use App\Domains\Comments\Models\Comment;
use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Enums\IncidentPriority;
use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Locations\Models\Location;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Users\Models\User;
use App\Storage\Models\Image;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use MatanYadaev\EloquentSpatial\Objects\Point;
use MatanYadaev\EloquentSpatial\Traits\HasSpatial;

/**
 * Aggregate root compartido del módulo de Incidencias.
 *
 * @cqrs-role aggregate-root
 *
 * Es el mismo modelo que usa el command side (EloquentIncidentRepository
 * + AssignmentService / IncidentClaimService) para escribir y el query side
 * (FeedController → FeedService) sólo de manera indirecta, leyendo el
 * read model Redis que mantiene RedisIncidentSync a partir de los eventos
 * `created` / `updated` / `deleted` que este modelo dispara.
 *
 * Cualquier mutación a Incidencia DEBE persistirse dentro de
 * DB::transaction() para que el trigger de auditoría y el listener de
 * proyección queden consistentes.
 *
 * @see docs/Convenciones/architecture-cqrs-lite.md
 */
class Incident extends Model
{
    use HasSpatial, SoftDeletes;

    protected static function booted(): void
    {
        static::updating(function (Incident $incident) {
            if ($incident->isDirty('status') && $incident->status === IncidentStatus::Resolved) {
                $incident->resolution_date = now();
            }
        });
    }

    public const STATUS_PENDING = 'pending';

    public const STATUS_IN_PROGRESS = 'in_progress';

    public const STATUS_RESOLVED = 'resolved';

    public const PRIORITY_LOW = 'low';

    public const PRIORITY_MEDIUM = 'medium';

    public const PRIORITY_HIGH = 'high';

    protected $fillable = [
        'incident_category_id',
        'organization_id',
        'user_id',
        'location_id',
        'title',
        'description',
        'status',
        'priority',
        'resolution_date',
        'geom',
        'claimed_by',
        'claimed_at',
        'approved_by',
        'approved_at',
        'rejected_by',
        'rejected_at',
        'rejection_reason',
    ];

    protected $attributes = [
        'status' => IncidentStatus::Pending->value,
    ];

    protected function casts(): array
    {
        return [
            'geom' => Point::class,
            'resolution_date' => 'datetime',
            'status' => IncidentStatus::class,
            'priority' => IncidentPriority::class,
            'claimed_at' => 'datetime',
            'approved_at' => 'datetime',
            'rejected_at' => 'datetime',
            // Normalise FK at the model boundary so consumers (e.g.
            // `IncidentResource::toArray()` → `LocationRepository::ancestors(int $id)`)
            // always see `int`, not the raw JSON string from
            // `$request->validated()`. Matches the precedent set by
            // `Comment::$casts` (`incident_id`/`user_id`/`parent_id`).
            'incident_category_id' => 'integer',
            'location_id' => 'integer',
            'organization_id' => 'integer',
            'user_id' => 'integer',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(IncidentCategory::class, 'incident_category_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function comments(): HasMany
    {
        return $this->hasMany(Comment::class);
    }

    public function assignedUsers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'assignments')
            ->withPivot('assignment_role')
            ->withTimestamps();
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(Assignment::class);
    }

    /**
     * Polymorphic `images` table rows for this incident, ordered by
     * `sort_order` (image-persistence-polymorphic, WU2/WU5).
     *
     * This relation is the live source of truth for reads/writes since the
     * WU5 cutover (IncidentController/IncidentImageService/IncidentResource).
     * The legacy `incidents.images` JSON column is gone from `$fillable`/
     * `casts()` (post-WU8 bug fix): that dead cast entry used to shadow
     * this relation on property access — `getAttribute()` resolves casts
     * before relations, so `$incident->images` (no parentheses) returned
     * the stale legacy attribute (`null`, once the column no longer had a
     * value) instead of falling through to this method. Now that the cast
     * is gone, `$incident->images` (property) and `$incident->images()`
     * (relation call) both correctly resolve this `MorphMany`.
     * `ImageBackfiller` still needs the raw legacy JSON for
     * not-yet-migrated environments — it reads `incidents.images` directly
     * via the query builder instead of through this model.
     */
    public function images(): MorphMany
    {
        return $this->morphMany(Image::class, 'imageable')->orderBy('sort_order');
    }

    public function resolutions(): HasMany
    {
        return $this->hasMany(ResolutionAudit::class)->orderBy('resolved_at', 'desc');
    }
}
