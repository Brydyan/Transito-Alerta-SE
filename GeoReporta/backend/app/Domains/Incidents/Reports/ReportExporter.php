<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Reports;

use App\Domains\Incidents\Models\Incident;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Contract for the format-specific exporters behind
 * `GET /api/incidencias/export?format=...`.
 *
 * Implementations stream the response body so we never materialise a 10k-row
 * CSV/XLSX/PDF in memory. Each exporter declares its own hard row cap via
 * `maxRows()` because PDF (Dompdf) tolerates far less than CSV/XLSX before
 * exhausting the worker.
 */
interface ReportExporter
{
    /**
     * MIME type to send on the `Content-Type` header.
     */
    public function contentType(): string;

    /**
     * Filename (with extension) for the `Content-Disposition` header.
     */
    public function filename(string $base): string;

    /**
     * Hard cap on rows this exporter can safely render in one response.
     * Used by the controller to truncate + log a warning when the dataset
     * is larger than what we want to ship.
     */
    public function maxRows(): int;

    /**
     * Stream the export. The closure runs inside Symfony's StreamedResponse
     * so the browser starts downloading as soon as the first byte hits the
     * socket — no full materialisation in PHP memory.
     *
     * @param  iterable<Incident>  $incidents
     * @param  array<int, string>  $columns  Localised column headers
     * @param  array<string, mixed>  $meta  Free-form metadata (e.g. base filename, filters)
     */
    public function export(iterable $incidents, array $columns, array $meta = []): StreamedResponse;
}
