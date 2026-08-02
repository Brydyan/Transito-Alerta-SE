<?php

declare(strict_types=1);

namespace App\Domains\Locations\Http;

use Illuminate\Foundation\Http\FormRequest;

class CatalogLocationsRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'level' => 'sometimes|string|in:country,province,city,neighborhood',
            'parent_id' => 'sometimes|nullable|integer|exists:locations,id',
            'per_page' => 'sometimes|integer|min:1|max:500',
        ];
    }
}
