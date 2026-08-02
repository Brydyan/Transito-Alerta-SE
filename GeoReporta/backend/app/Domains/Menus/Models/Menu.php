<?php

namespace App\Domains\Menus\Models;

use App\Domains\Permissions\Models\Permission;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Menu extends Model
{
    use SoftDeletes;

    protected $primaryKey = 'menu_id';

    protected $fillable = [
        'parent_id',
        'name',
        'route',
        'icon',
        'active',
    ];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
        ];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Menu::class, 'parent_id', 'menu_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Menu::class, 'parent_id', 'menu_id');
    }

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'menu_permission', 'menu_id', 'permission_id')
            ->using(MenuPermission::class);
    }
}
