<?php

declare(strict_types=1);

namespace App\Domains\Comments\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreCommentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->check();
    }

    public function rules(): array
    {
        return [
            'message' => [
                'nullable',
                'string',
                'max:5000',
            ],
            'parent_id' => ['nullable', 'integer', 'exists:comments,id'],
            'image_ids' => ['nullable', 'array'],
            // References the shared polymorphic `images` table
            // (image-persistence-polymorphic, WU8) — the legacy
            // `comment_images` table this rule used to check is dropped.
            'image_ids.*' => ['integer', 'exists:images,id'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->sometimes('message', 'required', function () {
            return empty($this->input('image_ids'));
        });
    }
}
