<?php

declare(strict_types=1);

namespace App\Domains\IncidentCategories\Http\Requests;

use App\Domains\IncidentCategories\Models\IncidentCategory;
use Illuminate\Foundation\Http\FormRequest;

class UpdateIncidentCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        $category = IncidentCategory::find($this->route('incident_category'));
        if ($category === null) {
            return false;
        }

        return $this->user()?->can('update', $category) ?? false;
    }

    public function rules(): array
    {
        return [
            'name' => 'sometimes|string|max:100',
            'parent_id' => 'nullable|integer|exists:incident_categories,id',
        ];
    }

    public function messages(): array
    {
        return [
            'parent_id.exists' => 'La categoría padre seleccionada no existe.',
        ];
    }
}
