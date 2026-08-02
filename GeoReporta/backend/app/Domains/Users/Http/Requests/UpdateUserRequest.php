<?php

declare(strict_types=1);

namespace App\Domains\Users\Http\Requests;

use App\Domains\Roles\Enums\UserRole;
use App\Domains\Roles\Models\Role;
use App\Domains\Users\Models\User;
use App\Storage\ImageRules;
use App\Support\PhoneRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        if ($user === null) {
            return false;
        }

        $targetUser = $this->route('user');
        if (! $targetUser instanceof User) {
            $targetUser = User::find($targetUser);
        }

        if ($targetUser === null) {
            return false;
        }

        if (! $user->can('update', $targetUser)) {
            return false;
        }

        if (! $user->isSystemAdmin()) {
            // Cannot assign administrative roles (admin_sistema, operador_sistema)
            if ($this->has('role_id')) {
                $roleId = $this->input('role_id');
                if (in_array((int) $roleId, [
                    Role::where('name', UserRole::AdminSistema->value)->first()?->id,
                    Role::where('name', UserRole::OperadorSistema->value)->first()?->id,
                ], true)) {
                    return false;
                }
            }

            // Must match their own organization
            if ($this->has('organization_id')) {
                $orgId = $this->input('organization_id');
                if ((int) $orgId !== $user->organization_id) {
                    return false;
                }
            }
        }

        return true;
    }

    public function rules(): array
    {
        return [
            'email' => [
                'sometimes',
                'email',
                Rule::unique('users', 'email')->ignore($this->route('user')),
            ],
            'password' => 'nullable|string|min:8',
            'role_id' => 'sometimes|integer|exists:roles,id',
            'organization_id' => 'nullable|integer|exists:organizations,id',
            'first_name' => 'sometimes|string|max:100',
            'last_name' => 'sometimes|string|max:100',
            'phone' => PhoneRules::rules(),
            // Avatar handling: the user form sends multipart when a new avatar
            // is selected, OR a `_delete_avatar=true` flag when removing the
            // existing one. Both are processed by UserController::update.
            // Validated against the same D10 limits (ImageRules) every other
            // image-upload endpoint uses (image-persistence-polymorphic WU7).
            'avatar' => ['nullable', ...ImageRules::avatarFileRules()],
            '_delete_avatar' => 'nullable|boolean',
        ];
    }

    public function messages(): array
    {
        return [
            'phone.regex' => PhoneRules::MESSAGE,
            'email.unique' => 'Este correo electrónico ya está registrado.',
            'role_id.exists' => 'El rol seleccionado no existe',
            'password.min' => 'La contraseña debe tener al menos 8 caracteres',
            'avatar.image' => 'El archivo debe ser una imagen válida.',
            'avatar.mimes' => 'Solo se permiten imágenes en formato JPG, PNG, GIF o WebP.',
            'avatar.max' => 'La imagen no puede superar los '.(ImageRules::MAX_SIZE_KB / 1024).' MB.',
        ];
    }
}
