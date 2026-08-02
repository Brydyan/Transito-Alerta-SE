<?php

declare(strict_types=1);

namespace App\Domains\IncidentCategories\Http\Requests;

use App\Domains\IncidentCategories\Models\IncidentCategory;
use Illuminate\Foundation\Http\FormRequest;

class StoreIncidentCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', IncidentCategory::class) ?? false;
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:100',
            'parent_id' => 'nullable|integer|exists:incident_categories,id',
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'El nombre es obligatorio.',
        ];
    }
}
