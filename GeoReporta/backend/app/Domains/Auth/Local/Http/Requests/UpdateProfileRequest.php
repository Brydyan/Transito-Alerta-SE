<?php

declare(strict_types=1);

namespace App\Domains\Auth\Local\Http\Requests;

use App\Storage\ImageRules;
use App\Support\PhoneRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $rules = [
            'first_name' => ['sometimes', 'string', 'max:100'],
            'last_name' => ['sometimes', 'string', 'max:100'],
            'phone' => PhoneRules::rules(sometimes: true),
            'password' => ['sometimes', 'nullable', 'string', 'min:8'],
        ];

        // Multipart: avatar as file upload — validated against the same
        // D10 limits (ImageRules) every other image-upload endpoint uses
        // (image-persistence-polymorphic WU7 cutover).
        if ($this->hasFile('avatar')) {
            $rules['avatar'] = ['required', ...ImageRules::avatarFileRules()];
        } else {
            // JSON: avatar as legacy { urls: [...] } object
            $rules['avatar'] = ['sometimes', 'array'];
            $rules['avatar.urls'] = Rule::when(
                $this->has('avatar.urls'),
                ['array', 'max:5'],
            );
            $rules['avatar.urls.*'] = Rule::when(
                $this->has('avatar.urls'),
                ['string', 'url'],
            );
        }

        return $rules;
    }

    public function messages(): array
    {
        return [
            'phone.regex' => PhoneRules::MESSAGE,
            'avatar.required' => 'Debes subir una imagen de avatar.',
            'avatar.image' => 'El archivo debe ser una imagen válida.',
            'avatar.mimes' => 'Solo se permiten imágenes en formato JPG, PNG, GIF o WebP.',
            'avatar.max' => 'La imagen no puede superar los '.(ImageRules::MAX_SIZE_KB / 1024).' MB.',
        ];
    }
}
