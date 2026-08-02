<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Models;

use App\Domains\Incidents\Models\Incident;
use App\Domains\Notifications\Enums\NotificationType;
use App\Domains\Users\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Notification extends Model
{
    use SoftDeletes;

    protected $table = 'notifications';

    /**
     * La tabla `notifications` tiene `created_at` (default current) pero
     * no tiene `updated_at`. Marcamos UPDATED_AT como null para que
     * Eloquent no intente escribir esa columna al hacer `update()`.
     */
    public $timestamps = true;

    public const UPDATED_AT = null;

    protected $fillable = [
        'user_id',
        'incident_id',
        'type',
        'data',
        'message',
        'read',
        'processed_at',
    ];

    protected function casts(): array
    {
        return [
            'type' => NotificationType::class,
            'data' => 'array',
            'read' => 'boolean',
            'processed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function incident(): BelongsTo
    {
        return $this->belongsTo(Incident::class);
    }

    /**
     * Scope: solo notificaciones del usuario indicado, más recientes primero.
     */
    public function scopeForUser(Builder $query, User $user): Builder
    {
        return $query->where('user_id', $user->id)->latest('created_at');
    }

    /**
     * Scope: solo no leídas.
     */
    public function scopeUnread(Builder $query): Builder
    {
        return $query->where('read', false);
    }
}
