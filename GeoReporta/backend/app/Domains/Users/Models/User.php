<?php

declare(strict_types=1);

namespace App\Domains\Users\Models;

use App\Domains\Auth\Local\Notifications\PasswordResetMail;
use App\Domains\Auth\Local\Notifications\VerifyEmailMail;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Enums\UserRole;
use App\Domains\Roles\Models\Role;
use App\Domains\Sessions\Models\Session;
use App\Storage\Models\Image;
use Database\Factories\UserFactory;
use Illuminate\Auth\Passwords\CanResetPassword;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable implements MustVerifyEmail
{
    use CanResetPassword;
    use HasFactory;
    use Notifiable;
    use SoftDeletes;

    /**
     * Maximum avatar upload size in kilobytes, used ONLY by
     * `GenerateAvatarConstantsCommand` to emit the frontend's
     * single-source-of-truth constants.
     */
    public const AVATAR_MAX_KB = 5120;

    protected $fillable = [
        'first_name',
        'last_name',
        'email',
        'password',
        'role_id',
        'organization_id',
        'email_verified_at',
        'verification_otp',
        'verification_otp_expires_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'verification_otp',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'verification_otp_expires_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function organization(): BelongsTo
    {
        return $this->belongsTo(Organization::class);
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(Session::class);
    }

    /**
     * Shared polymorphic image relationship (image-persistence-polymorphic, WU6).
     */
    public function image(): MorphOne
    {
        return $this->morphOne(Image::class, 'imageable');
    }

    /**
     * Back-port of avatarImage() lost in the email-verification branch merge.
     * UserResource, UserController, ProfileImageService, ImageBackfiller and
     * EloquentUserRepository all eager-load or access $user->avatarImage; the
     * query-builder relation MUST exist on the model or Laravel throws
     * RelationNotFoundException on /api/users, /api/auth/profile, etc.
     * Mirror of the `image()` morphOne targeting the same `images` table —
     * kept as a separate method for read-site intent (canonical name used by
     * every call site in this codebase).
     */
    public function avatarImage(): MorphOne
    {
        return $this->morphOne(Image::class, 'imageable');
    }

    /**
     * Virtual avatar attribute: returns storage_path if custom avatar uploaded,
     * null otherwise (frontend generates initials fallback).
     */
    public function getAvatarAttribute(): ?string
    {
        return $this->image?->storage_path;
    }

    protected static function newFactory(): UserFactory
    {
        return UserFactory::new();
    }

    public function hasPermission(string $permissionName): bool
    {
        if ($this->relationLoaded('role') && $this->role) {
            if ($this->role->relationLoaded('permissions')) {
                return $this->role->permissions
                    ->contains(function ($p) use ($permissionName) {
                        return "{$p->resource}.{$p->action}" === $permissionName;
                    });
            }
        }

        [$resource, $action] = explode('.', $permissionName);

        return $this->role()
            ->whereHas('permissions', function ($query) use ($resource, $action) {
                $query->where('resource', $resource)
                    ->where('action', $action);
            })
            ->exists();
    }

    public function hasPermissionTo(string $resource, string $action): bool
    {
        if ($this->relationLoaded('role') && $this->role) {
            if ($this->role->relationLoaded('permissions')) {
                return $this->role->permissions
                    ->contains(function ($p) use ($resource, $action) {
                        return $p->resource === $resource && $p->action === $action;
                    });
            }
        }

        return $this->role?->permissions()
            ->where('resource', $resource)
            ->where('action', $action)
            ->exists() ?? false;
    }

    public function belongsToOrganization(Organization $org): bool
    {
        return $this->organization_id === $org->id;
    }

    public function isOrganizationMember(): bool
    {
        return $this->organization_id !== null;
    }

    /**
     * Back-port of the canonical role checks lost when the email verification
     * feature branch merged onto the older sc-117 base. AppServiceProvider::boot
     * and MenuService rely on isAdmin() in Gate::before and the admin branch of
     * getMyMenus; the AppServiceProvider's feed rate limiter additionally
     * guards with method_exists($user, 'isSystemAdmin') — without it, every
     * authenticated request that touches a Gate crashes with
     * BadMethodCallException, and the whole /api/menus/my flow returns 500.
     *
     * isOperator() and isRegularUser() already exist below; this only
     * restores the two helpers that didn't survive the merge.
     */
    public function isAdmin(): bool
    {
        return $this->role?->name === UserRole::AdminSistema->value;
    }

    public function isSystemAdmin(): bool
    {
        return $this->role?->name === UserRole::AdminSistema->value;
    }

    /**
     * Back-port of the third missing role check surfaced by
     * IncidentPolicy / IncidentQueryScope filters. Same split-merge origin
     * as isAdmin()/isSystemAdmin() (commit 3461d43): IncidentPolicy and
     * IncidentController scope queries by \$user->isOrganizationAdmin(),
     * which throws BadMethodCallException for any admin_organizacion
     * user, returning 500 on /api/incidents, /api/incidents/feed,
     * /api/incidents/stats and /api/incidents/weekly-stats.
     */
    public function isOrganizationAdmin(): bool
    {
        return $this->role?->name === UserRole::AdminOrganizacion->value;
    }

    public function isOperator(): bool
    {
        return $this->role?->name === UserRole::OperadorOrganizacion->value;
    }

    public function isRegularUser(): bool
    {
        return $this->role?->name === UserRole::Usuario->value;
    }

    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new PasswordResetMail($token));
    }

    /**
     * Genera un código OTP de 6 dígitos con expiración (15 minutos).
     */
    public function generateVerificationOtp(int $expiresInMinutes = 15): string
    {
        $otp = sprintf('%06d', random_int(0, 999999));

        $this->forceFill([
            'verification_otp' => hash('sha256', $otp),
            'verification_otp_expires_at' => now()->addMinutes($expiresInMinutes),
        ])->save();

        return $otp;
    }

    /**
     * Valida el código OTP de 6 dígitos ingresado por el usuario.
     */
    public function verifyOtp(string $otp): bool
    {
        if ($this->verification_otp === null || $this->verification_otp_expires_at === null) {
            return false;
        }

        if (now()->greaterThan($this->verification_otp_expires_at)) {
            return false;
        }

        if (! hash_equals($this->verification_otp, hash('sha256', trim($otp)))) {
            return false;
        }

        $this->forceFill([
            'email_verified_at' => now(),
            'verification_otp' => null,
            'verification_otp_expires_at' => null,
        ])->save();

        return true;
    }

    /**
     * Send the email verification notification with 6-digit OTP code — story sc-117 / R8.
     */
    public function sendEmailVerificationNotification(): void
    {
        $otp = $this->generateVerificationOtp(15);
        $this->notify(new VerifyEmailMail($otp));
    }
}
