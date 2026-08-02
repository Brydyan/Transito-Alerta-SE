<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Reports;

use App\Domains\Incidents\Models\Incident;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Common\Entity\Style\Style;
use OpenSpout\Writer\XLSX\Writer;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Streams a real XLSX (Office Open XML, not the legacy BIFF .xls) using
 * OpenSpout. Openspout writes one row at a time and flushes through
 * `php://output`, so 10k rows stay cheap regardless of column count.
 *
 * Note on the streaming trick: we hand a StreamedResponse an empty
 * closure and let OpenSpout wire itself to `php://output` during
 * `openToFile()`. We can't pre-create the Writer outside the closure
 * because the output buffer isn't open until the response starts.
 */
final class XlsxExporter implements ReportExporter
{
    public function contentType(): string
    {
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    public function filename(string $base): string
    {
        return "{$base}.xlsx";
    }

    public function maxRows(): int
    {
        return 10000;
    }

    public function export(iterable $incidents, array $columns, array $meta = []): StreamedResponse
    {
        $filename = $this->filename((string) ($meta['base'] ?? 'incidencias'));

        $stream = static function () use ($incidents, $columns): void {
            $writer = new Writer;
            $writer->openToFile('php://output');

            // Bold header row — Office honours it as a table-style cue.
            $headerStyle = (new Style)->withFontBold(true);
            $writer->addRow(Row::fromValuesWithStyle($columns, $headerStyle));

            foreach ($incidents as $incident) {
                /** @var Incident $incident */
                $writer->addRow(Row::fromValues(self::rowFor($incident)));
            }

            $writer->close();
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
