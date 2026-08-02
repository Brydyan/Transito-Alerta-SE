<?php

namespace App\Domains\Menus\Models;

use Illuminate\Database\Eloquent\Relations\Pivot;

class MenuPermission extends Pivot
{
    protected $table = 'menu_permission';

    protected $primaryKey = 'menu_permission_id';

    public $timestamps = true;
}
