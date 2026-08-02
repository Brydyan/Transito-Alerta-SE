<?php

declare(strict_types=1);

namespace App\Domains\Roles\Models;

use Illuminate\Database\Eloquent\Relations\Pivot;
use Illuminate\Database\Eloquent\SoftDeletes;

class RolePermission extends Pivot
{
    use SoftDeletes;

    public $timestamps = true;

    protected $table = 'role_permission';

    protected $fillable = ['role_id', 'permission_id', 'reassigned_at'];

    protected $dates = ['deleted_at', 'reassigned_at'];
}
