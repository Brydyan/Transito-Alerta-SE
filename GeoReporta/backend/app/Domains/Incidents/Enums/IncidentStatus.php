<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Enums;

enum IncidentStatus: string
{
    case Pending = 'pending';
    case InProgress = 'in_progress';
    case Resolved = 'resolved';
    case Closed = 'closed';

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

    /**
     * Stable key exposed to the frontend map (matches the backed value).
     *
     * The frontend codegen (`incidents:generate-frontend-constants`) emits
     * one entry per case using this method as the key so the generated
     * `status.constants.js` map keys stay aligned with `$this->value`.
     */
    public function frontendKey(): string
    {
        return $this->value;
    }

    /**
     * Spanish display label for the incident status.
     *
     * The canonical labels live here so the frontend constants file (see
     * `incidents:generate-frontend-constants`) cannot drift; the match
     * arms intentionally cover every case — adding a new case without
     * updating this method triggers a `UnhandledMatchError`.
     */
    public function label(): string
    {
        return match ($this) {
            self::Pending => 'Pendiente',
            self::InProgress => 'En proceso',
            self::Resolved => 'Resuelto',
            self::Closed => 'Cerrada',
        };
    }

    /**
     * Options array formatted for API responses.
     *
     * @return list<array{id: int, nombre: string, valor: string}>
     */
    public static function availableStatuses(): array
    {
        $id = 1;
        $statuses = [];
        foreach (self::cases() as $case) {
            $statuses[] = [
                'id' => $id++,
                'nombre' => $case->label(),
                'valor' => $case->value,
            ];
        }

        return $statuses;
    }
}
