<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http\Rules;

use Closure;
use Illuminate\Contracts\Validation\DataAwareRule;
use Illuminate\Contracts\Validation\ValidationRule;
use MatanYadaev\EloquentSpatial\Objects\Point;

class GeomShapeRule implements DataAwareRule, ValidationRule
{
    protected array $data = [];

    public function passes(string $attribute, mixed $value): bool
    {
        if ($value === null || $value instanceof Point) {
            return true;
        }

        $geom = is_string($value) ? json_decode($value, true) : $value;

        return is_array($geom)
            && array_key_exists('type', $geom)
            && array_key_exists('coordinates', $geom);
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! $this->passes($attribute, $value)) {
            $fail($this->message());
        }
    }

    public function setData(array $data): static
    {
        $this->data = $data;

        return $this;
    }

    public function message(): string
    {
        return trans('validation.custom.geom.shape');
    }
}
