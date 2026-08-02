<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Reports;

use InvalidArgumentException;

/**
 * Resolves the right exporter from the `?format=` query parameter.
 *
 * Adding a new format is a one-liner here + a new class. The controller
 * stays untouched, which is the whole reason we used a Strategy in the
 * first place instead of a switch in the controller body.
 */
final class ReportExporterFactory
{
    /**
     * @var array<string, class-string<ReportExporter>>
     */
    private const MAP = [
        'csv' => CsvExporter::class,
        'xlsx' => XlsxExporter::class,
        'pdf' => PdfExporter::class,
    ];

    public static function make(string $format): ReportExporter
    {
        $key = strtolower($format);

        if (! isset(self::MAP[$key])) {
            throw new InvalidArgumentException(
                "Formato de exportación no soportado: {$format}. Use uno de: ".implode(', ', array_keys(self::MAP)).'.',
            );
        }

        $class = self::MAP[$key];

        return new $class;
    }

    /**
     * @return list<string>
     */
    public static function supportedFormats(): array
    {
        return array_keys(self::MAP);
    }
}
