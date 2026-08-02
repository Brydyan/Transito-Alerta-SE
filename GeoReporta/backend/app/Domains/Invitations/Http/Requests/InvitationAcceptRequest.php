<?php

declare(strict_types=1);

namespace App\Domains\Invitations\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class InvitationAcceptRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Public endpoint
    }

    public function rules(): array
    {
        return [
            'token' => [
                'required',
                'string',
            ],
            'password' => [
                'required',
                'string',
                'min:8',
                'regex:/[A-Z]/',   // al menos una mayúscula
                'regex:/[a-z]/',   // al menos una minúscula
                'regex:/[0-9]/',   // al menos un dígito
                'confirmed',
            ],
            'accept_terms' => [
                'required',
                'boolean',
                'accepted',
            ],
            'terms_version' => [
                'required',
                'string',
                'in:v0',
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'password.regex' => 'La contraseña debe contener al menos una mayúscula, una minúscula y un dígito.',
            'accept_terms.accepted' => 'Debés aceptar los términos y condiciones.',
            'terms_version.in' => 'La versión de los términos no es válida.',
        ];
    }
}
