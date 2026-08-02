<?php

declare(strict_types=1);

use App\Domains\Roles\Models\Role;
use App\Domains\Roles\Repositories\EloquentRoleRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('returns a name-ordered id/name catalog', function (): void {
    Role::firstOrCreate(['name' => 'usuario']);
    Role::firstOrCreate(['name' => 'admin_sistema']);

    $catalog = new EloquentRoleRepository()->catalog();

    expect($catalog->pluck('name')->all())->toBe(['admin_sistema', 'usuario']);
    expect($catalog->first())->toHaveKeys(['id', 'name']);
});
