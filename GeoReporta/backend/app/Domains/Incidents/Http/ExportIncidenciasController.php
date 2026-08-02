<?php

declare(strict_types=1);

namespace App\Domains\Incidents\Http;

use App\Domains\Incidents\Reports\ReportExporterFactory;
use App\Domains\Incidents\Services\IncidenciasReportService;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Streams an export of the dashboard's filtered incidents.
 *
 *   GET /api/incidencias/export?format=csv|xlsx|pdf
 *                                       &inicio=YYYY-MM-DD&fin=YYYY-MM-DD
 *                                       &tipo_id=&pais_id=&provincia_id=&ciudad_id=
 *
 * Same shape and filters as `GET /api/incidents/stats` — the dashboard's
 * "Exportar" button hands the user exactly the rows they're looking at.
 *
 * Permission: `dashboard.view` (the same gate that guards the stats card).
 * The controller deliberately does not introduce a separate `incidents.export`
 * permission in v1 — the dashboard is already gated and export is a
 * by-product of "you can see these rows".
 */
class ExportIncidenciasController extends Controller
{
    public function __construct(
        private readonly IncidenciasReportService $reports,
    ) {}

    public function __invoke(Request $request): StreamedResponse
    {
        if (! $request->user()?->can('dashboard.view')) {
            abort(403, 'No tienes permiso para exportar las incidencias del dashboard.');
        }

        $supportedFormats = ReportExporterFactory::supportedFormats();

        $validated = $request->validate([
            'format' => ['required', 'string', Rule::in($supportedFormats)],
            'inicio' => ['nullable', 'date_format:Y-m-d'],
            'fin' => [
                'nullable',
                'date_format:Y-m-d',
                // Cross-field check: fin >= inicio, but only when both are present.
                // `after_or_equal:inicio` is the simplest native rule and avoids
                // the Fluent/non-stringifiable trap that `Rule::when(...$rule->after(...))`
                // hits under Laravel 13's stricter validator pipeline.
                'after_or_equal:inicio',
            ],
            'tipo_id' => ['nullable', 'integer', 'exists:incident_categories,id'],
            'pais_id' => ['nullable', 'integer', 'exists:locations,id'],
            'provincia_id' => ['nullable', 'integer', 'exists:locations,id'],
            'ciudad_id' => ['nullable', 'integer', 'exists:locations,id'],
        ], [
            'inicio.date_format' => 'La fecha ingresada no es válida. Use el formato DD/MM/AAAA.',
            'fin.date_format' => 'La fecha ingresada no es válida. Use el formato DD/MM/AAAA.',
            'fin.after_or_equal' => 'La fecha fin no puede ser anterior a la fecha inicio.',
        ]);

        $format = (string) $validated['format'];
        $exporter = ReportExporterFactory::make($format);

        // Tell the user up-front if the dataset was larger than what we
        // can safely ship in this format. We do the count OUTSIDE the
        // streamed response so the JSON-ish warning is actionable, not
        // half-delivered in a partial download.
        $total = $this->reports->countFiltered($validated);
        $hardCap = $exporter->maxRows();

        $this->reports->logTruncationIfNeeded($total, $hardCap, $format);

        $filenameBase = sprintf(
            'incidencias-%s',
            now()->format('Y-m-d-His'),
        );

        $meta = [
            'base' => $filenameBase,
            'generated_at' => now()->format('d/m/Y H:i'),
            'filters' => $this->reports->describeFilters($validated),
            'total_matched' => $total,
            'exported' => min($total, $hardCap),
            'truncated' => $total > $hardCap,
        ];

        $rows = $this->reports->filteredIncidents($validated, $hardCap);

        $response = $exporter->export($rows, $this->reports->columns(), $meta);

        // Surface truncation to the browser so the dashboard can show a
        // banner ("se exportaron las primeras N de M"). We can't surface
        // it in the body (it's already streamed) so a response header is
        // the only honest channel.
        if ($total > $hardCap) {
            $response->headers->set('X-Report-Truncated', 'true');
            $response->headers->set('X-Report-Original-Total', (string) $total);
            $response->headers->set('X-Report-Exported', (string) $hardCap);
        }

        return $response;
    }
}
