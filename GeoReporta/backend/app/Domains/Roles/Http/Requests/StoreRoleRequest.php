<?php

declare(strict_types=1);

namespace App\Domains\Roles\Http\Requests;

use App\Domains\Roles\Models\Role;
use Illuminate\Foundation\Http\FormRequest;

class StoreRoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Role::class) ?? false;
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|unique:roles|max:25',
        ];
    }

    public function messages(): array
    {
        return [
            'name.unique' => 'Este rol tiene un nombre ya asignado',
        ];
    }
}
