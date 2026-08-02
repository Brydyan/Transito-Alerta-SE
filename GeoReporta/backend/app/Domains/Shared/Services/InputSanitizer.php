<?php

declare(strict_types=1);

namespace App\Domains\Shared\Services;

final class InputSanitizer
{
    private const ALLOWED_TAGS = '<br><strong><em><b><i><u><ul><ol><li><p>';

    public static function sanitize(mixed $value): mixed
    {
        if ($value === null) {
            return null;
        }

        if (is_string($value)) {
            return self::sanitizeString($value);
        }

        if (is_array($value)) {
            return array_map([self::class, 'sanitize'], $value);
        }

        return $value;
    }

    public static function sanitizeAsText(mixed $value): mixed
    {
        if ($value === null) {
            return null;
        }

        if (is_string($value)) {
            return strip_tags($value);
        }

        if (is_array($value)) {
            return array_map([self::class, 'sanitizeAsText'], $value);
        }

        return $value;
    }

    public static function sanitizeRequest(array $data, array $textFields, array $richFields = []): array
    {
        foreach ($textFields as $field) {
            if (isset($data[$field])) {
                $data[$field] = self::sanitizeAsText($data[$field]);
            }
        }

        foreach ($richFields as $field) {
            if (isset($data[$field])) {
                $data[$field] = self::sanitize($data[$field]);
            }
        }

        return $data;
    }

    private static function sanitizeString(string $value): string
    {
        return strip_tags($value, self::ALLOWED_TAGS);
    }
}
