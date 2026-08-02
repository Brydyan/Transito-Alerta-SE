<?php

declare(strict_types=1);

namespace App\Domains\Invitations\Models;

use App\Domains\Users\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Representa una invitación de usuario pendiente de aceptación.
 *
 * El token en plaintext viaja solo por SMTP/URL; en base de datos
 * se almacena el hash (Hash::make). El modelo nunca expone el
 * plaintext.
 *
 * @property int $id
 * @property int $user_id
 * @property string $token_hash
 * @property Carbon $expires_at
 * @property Carbon|null $accepted_at
 * @property string $terms_version
 * @property int|null $invited_by_user_id
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read User $user
 * @property-read User|null $invitedByUser
 */
class UserInvitation extends Model
{
    /**
     * The table associated with the model.
     */
    protected $table = 'user_invitations';

    protected $fillable = [
        'user_id',
        'token_hash',
        'expires_at',
        'accepted_at',
        'terms_version',
        'invited_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'accepted_at' => 'datetime',
        ];
    }

    /**
     * Usuario que recibe la invitación.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Usuario admin que generó la invitación (nullable).
     */
    public function invitedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by_user_id');
    }

    /**
     * Indica si la invitación está pendiente de ser aceptada.
     *
     * Retorna true cuando:
     *   - accepted_at es null (nunca fue aceptada)
     *   - Y expires_at es mayor que now() (no expiró)
     */
    public function isPending(): bool
    {
        return $this->accepted_at === null && $this->expires_at->isFuture();
    }

    /**
     * Indica si la invitación ya expiró.
     *
     * Un invitación está expirada cuando expires_at es menor que now(),
     * independientemente de si ya fue aceptada (una vez consumida,
     * el estado de expirado es irrelevante para el flujo de negocio,
     * pero el flag técnico sigue siendo true).
     */
    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }

    /**
     * Marca la invitación como aceptada, seteando accepted_at a now().
     */
    public function accept(): void
    {
        $this->accepted_at = Carbon::now();
        // No persistimos aquí — el caller es responsable de guardar
        // los cambios dentro de su transacción.
    }
}
