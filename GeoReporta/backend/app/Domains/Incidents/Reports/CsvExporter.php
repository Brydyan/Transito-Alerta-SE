<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Reports;

use App\Domains\Incidents\Models\Incident;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Streams a CSV with the same column shape as the dashboard. We prepend a
 * UTF-8 BOM so Excel on Windows opens the file with the correct encoding
 * instead of mojibaking the Spanish accented characters.
 */
final class CsvExporter implements ReportExporter
{
    public function contentType(): string
    {
        return 'text/csv; charset=UTF-8';
    }

    public function filename(string $base): string
    {
        return "{$base}.csv";
    }

    public function maxRows(): int
    {
        return 10000;
    }

    public function export(iterable $incidents, array $columns, array $meta = []): StreamedResponse
    {
        $filename = $this->filename((string) ($meta['base'] ?? 'incidencias'));

        $stream = static function () use ($incidents, $columns): void {
            $out = fopen('php://output', 'w');

            // UTF-8 BOM — Excel needs it to detect encoding correctly.
            fwrite($out, "\xEF\xBB\xBF");

            fputcsv($out, $columns);

            foreach ($incidents as $incident) {
                /** @var Incident $incident */
                fputcsv($out, self::rowFor($incident));
            }

            fclose($out);
        };

        return new StreamedResponse($stream, 200, [
            'Content-Type' => $this->contentType(),
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
            'Cache-Control' => 'no-store, no-cache, must-revalidate',
            'Pragma' => 'no-cache',
        ]);
    }

    /**
     * @return array<int, string>
     */
    private static function rowFor(Incident $inc): array
    {
        return [
            (string) $inc->id,
            (string) $inc->title,
            (string) ($inc->status?->value ?? ''),
            (string) ($inc->priority?->value ?? ''),
            (string) ($inc->category?->name ?? ''),
            (string) ($inc->organization?->name ?? ''),
            (string) ($inc->location?->name ?? ''),
            $inc->user
                ? trim((string) ($inc->user->first_name ?? '').' '.(string) ($inc->user->last_name ?? ''))
                : '',
            $inc->created_at?->format('d/m/Y H:i') ?? '',
            $inc->resolution_date?->format('d/m/Y H:i') ?? '',
        ];
    }
}
