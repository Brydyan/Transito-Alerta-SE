<?php

declare(strict_types=1);

namespace App\Domains\Comments\Http\Requests;

use App\Storage\ImageRules;
use Illuminate\Foundation\Http\FormRequest;

class StoreCommentImageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    public function rules(): array
    {
        return [
            'images' => [...['required'], ...ImageRules::galleryArrayRules(), 'min:1'],
            'images.*' => [...['required'], ...ImageRules::galleryFileRules()],
        ];
    }

    public function messages(): array
    {
        return [
            'images.required' => 'Debes subir al menos una imagen.',
            'images.max' => 'Solo podés adjuntar un máximo de '.ImageRules::MAX_FILES.' imágenes.',
            'images.*.image' => 'Cada archivo debe ser una imagen válida.',
            'images.*.mimes' => 'Solo se permiten imágenes en formato JPG, PNG, GIF o WebP.',
            'images.*.max' => 'Cada imagen no puede superar los '.(ImageRules::MAX_SIZE_KB / 1024).' MB.',
        ];
    }
}
