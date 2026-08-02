<?php

namespace App\Domains\Permissions\Models;

use App\Domains\Menus\Models\Menu;
use App\Domains\Menus\Models\MenuPermission;
use App\Domains\Roles\Models\Role;
use App\Domains\Roles\Models\RolePermission;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Permission extends Model
{
    use SoftDeletes;

    protected $primaryKey = 'permission_id';

    protected $fillable = [
        'name',
        'description',
        'resource',
        'action',
    ];

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'role_permission', 'permission_id', 'role_id')
            ->using(RolePermission::class)
            ->withTimestamps();
    }

    public function menus(): BelongsToMany
    {
        return $this->belongsToMany(Menu::class, 'menu_permission', 'permission_id', 'menu_id')
            ->using(MenuPermission::class);
    }
}
