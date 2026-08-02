<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http\Rules;

use App\Domains\IncidentCategories\Models\IncidentCategory;
use Illuminate\Contracts\Validation\Rule;

class CategoryIsLeafRule implements Rule
{
    public function passes($attribute, $value): bool
    {
        $category = IncidentCategory::find($value);
        if (! $category) {
            return false;
        }

        return ! $category->children()->exists();
    }

    public function message(): string
    {
        return 'The :attribute must be a leaf category (without children).';
    }
}
