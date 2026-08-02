<?php

declare(strict_types=1);

namespace App\Domains\Sessions\Models;

use App\Domains\Users\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Session extends Model
{
    protected $table = 'sessions';

    protected $primaryKey = 'id';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'id',
        'user_id',
        'refresh_token_hash',
        'ip_address',
        'user_agent',
        'is_revoked',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'is_revoked' => 'boolean',
            'expires_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isValid(): bool
    {
        return ! $this->is_revoked && $this->expires_at->isFuture();
    }
}
