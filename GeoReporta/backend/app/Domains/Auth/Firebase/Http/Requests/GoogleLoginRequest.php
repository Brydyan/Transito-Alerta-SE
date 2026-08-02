<?php

declare(strict_types=1);

namespace App\Domains\Auth\Firebase\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class GoogleLoginRequest extends FormRequest
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
            'id_token' => ['required', 'string', 'min:10', 'max:4096'],
        ];
    }
}
