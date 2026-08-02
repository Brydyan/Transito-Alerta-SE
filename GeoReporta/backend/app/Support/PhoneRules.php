<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Centralized validation rules and regex for phone numbers across user profiles,
 * registration, and management endpoints.
 */
final class PhoneRules
{
    /**
     * Ecuador phone regex:
     * - Starting with +593: +5939XXXXXXXX (mobile, 12 digits excl. '+') or +593[2-7]XXXXXXX (landline, 11 digits).
     * - Local starting with 0: 09XXXXXXXX (mobile, 10 digits) or 0[2-7]XXXXXXX (landline, 9 digits).
     */
    public const REGEX = '/^(?:\+593[2-9]\d{7,8}|0[2-9]\d{7,8})$/';

    /** Custom error message in Spanish. */
    public const MESSAGE = 'El teléfono debe ser un número válido de Ecuador (ej. 0991234567 o +593991234567).';

    /**
     * Common Laravel validation rules array for phone fields.
     *
     * @return array<int, string>
     */
    public static function rules(bool $sometimes = false): array
    {
        $rules = [];
        if ($sometimes) {
            $rules[] = 'sometimes';
        }
        $rules[] = 'nullable';
        $rules[] = 'string';
        $rules[] = 'regex:'.self::REGEX;

        return $rules;
    }

    /**
     * Normalizes an Ecuadorian phone number to international format +593XXXXXXXXX before storing.
     */
    public static function normalize(?string $phone): ?string
    {
        if ($phone === null || trim($phone) === '') {
            return null;
        }

        $cleaned = preg_replace('/[^\d+]/', '', trim($phone));

        return match (true) {
            str_starts_with($cleaned, '0') => '+593'.substr($cleaned, 1),
            str_starts_with($cleaned, '593') => '+'.$cleaned,
            default => $cleaned,
        };
    }
}
