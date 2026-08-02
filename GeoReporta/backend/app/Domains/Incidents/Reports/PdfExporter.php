<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Reports;

use App\Domains\Incidents\Models\Incident;
use Barryvdh\DomPDF\Facade\Pdf;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Generates a printable A4-landscape PDF of the dashboard's filtered
 * incidents. Dompdf builds the whole document in memory, so the cap is
 * intentionally tighter than CSV/XLSX — beyond ~2k rows the worker
 * regularly blows past 256MB. The caller (controller) already trims to
 * `maxRows()` before invoking us, so we trust the input.
 *
 * We render a single self-contained HTML document and let Dompdf stream
 * the binary output back. No external CSS/JS files — Dompdf only fetches
 * inline + data-URI assets in headless mode.
 */
final class PdfExporter implements ReportExporter
{
    public function contentType(): string
    {
        return 'application/pdf';
    }

    public function filename(string $base): string
    {
        return "{$base}.pdf";
    }

    public function maxRows(): int
    {
        return 2000;
    }

    public function export(iterable $incidents, array $columns, array $meta = []): StreamedResponse
    {
        $filename = $this->filename((string) ($meta['base'] ?? 'incidencias'));

        // Materialise the rows before opening the PDF context so Dompdf
        // sees a closed iterable (it consumes the array twice when
        // building the layout, depending on the page-break config).
        $rows = [];
        foreach ($incidents as $incident) {
            /** @var Incident $incident */
            $rows[] = self::rowFor($incident);
        }

        $generatedAt = (string) ($meta['generated_at'] ?? now()->format('d/m/Y H:i'));
        $filters = (array) ($meta['filters'] ?? []);

        $html = view('reports.incidents-pdf', [
            'columns' => $columns,
            'rows' => $rows,
            'generatedAt' => $generatedAt,
            'filters' => $filters,
            'total' => count($rows),
        ])->render();

        $stream = static function () use ($html): void {
            $pdf = Pdf::loadHTML($html)->setPaper('a4', 'landscape');
            echo $pdf->output();
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
