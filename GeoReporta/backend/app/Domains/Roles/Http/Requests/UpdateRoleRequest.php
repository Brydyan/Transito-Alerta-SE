<?php

declare(strict_types=1);

namespace App\Domains\Roles\Http\Requests;

use App\Domains\Roles\Models\Role;
use Illuminate\Foundation\Http\FormRequest;

class UpdateRoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        $targetRole = Role::find($this->route('role'));
        if ($targetRole === null) {
            return false;
        }

        return $this->user()?->can('update', $targetRole) ?? false;
    }

    public function rules(): array
    {
        return [
            'name' => "sometimes|string|max:25|unique:roles,name,{$this->route('role')}",
        ];
    }

    public function messages(): array
    {
        return [
            'name.unique' => 'Este rol ya existe',
        ];
    }
}
