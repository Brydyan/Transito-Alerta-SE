<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Reporte de incidencias</title>
    <style>
        @page { margin: 18mm 14mm; }
        body { font-family: DejaVu Sans, Helvetica, Arial, sans-serif; color: #1f2937; font-size: 10px; }
        h1 { font-size: 18px; margin: 0 0 4px 0; }
        .meta { color: #6b7280; font-size: 9px; margin-bottom: 12px; }
        .filters { margin-bottom: 10px; }
        .filters span { display: inline-block; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 3px; padding: 2px 6px; margin-right: 4px; font-size: 9px; }
        table { width: 100%; border-collapse: collapse; }
        thead th { background: #f9fafb; border-bottom: 1.5px solid #1f2937; padding: 6px 4px; text-align: left; font-weight: bold; font-size: 9px; text-transform: uppercase; letter-spacing: 0.4px; }
        tbody td { border-bottom: 1px solid #e5e7eb; padding: 5px 4px; vertical-align: top; }
        tbody tr:nth-child(even) td { background: #fafafa; }
        .footer { margin-top: 12px; color: #6b7280; font-size: 8px; text-align: right; }
        .truncated { background: #fff7ed; border: 1px solid #fdba74; padding: 6px 10px; border-radius: 3px; margin-bottom: 8px; color: #9a3412; font-size: 9px; }
    </style>
</head>
<body>
    <h1>Reporte de incidencias</h1>
    <div class="meta">
        Generado el {{ $generatedAt }} · {{ $total }} {{ $total === 1 ? 'fila' : 'filas' }}
    </div>

    @if (!empty($filters))
        <div class="filters">
            @foreach ($filters as $f)
                <span>{{ $f }}</span>
            @endforeach
        </div>
    @endif

    @if (!empty($meta['truncated'] ?? false))
        <div class="truncated">
            El dataset original tenía {{ $meta['total_matched'] }} filas; se exportaron las primeras {{ $meta['exported'] }} (límite del formato PDF).
        </div>
    @endif

    <table>
        <thead>
            <tr>
                @foreach ($columns as $col)
                    <th>{{ $col }}</th>
                @endforeach
            </tr>
        </thead>
        <tbody>
            @foreach ($rows as $row)
                <tr>
                    @foreach ($row as $cell)
                        <td>{{ $cell }}</td>
                    @endforeach
                </tr>
            @endforeach
        </tbody>
    </table>

    <div class="footer">
        Sistema de Incidencias Georreferenciadas
    </div>
</body>
</html>