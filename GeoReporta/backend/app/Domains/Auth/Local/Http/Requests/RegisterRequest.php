<?php

declare(strict_types=1);

namespace App\Domains\Auth\Local\Http\Requests;

use App\Support\PhoneRules;
use Illuminate\Foundation\Http\FormRequest;

class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'unique:users,email'],
            'phone' => PhoneRules::rules(),
            'password' => [
                'required',
                'string',
                'min:8',
                'regex:/[A-Z]/',
                'regex:/[a-z]/',
                'regex:/\d/',
            ],
            'password_confirmation' => ['required', 'string', 'same:password'],
        ];
    }

    public function messages(): array
    {
        return [
            'phone.regex' => PhoneRules::MESSAGE,
        ];
    }
}
