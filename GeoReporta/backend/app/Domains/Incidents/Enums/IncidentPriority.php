<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Enums;

enum IncidentPriority: string
{
    case Low = 'low';
    case Medium = 'medium';
    case High = 'high';

    /**
     * Backing string values for every case.
     *
     * Native PHP enums only expose `cases()`; this helper returns the
     * plain string values so callers (e.g. IncidentStatsController) can
     * zero-fill aggregates without reaching into each case.
     *
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
