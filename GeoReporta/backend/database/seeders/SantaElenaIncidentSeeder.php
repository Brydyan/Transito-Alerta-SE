<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Enums\IncidentPriority;
use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Users\Models\User;
use Illuminate\Database\Seeder;
use MatanYadaev\EloquentSpatial\Objects\Point;

/**
 * Santa Elena province-specific incident seed.
 *
 * Generates ~25 realistic incidents distributed across the three coastal
 * cantons of the Santa Elena peninsula (EC-24):
 *
 *   - EC-24-01  Santa Elena  (cabecera provincial, centro peninsular)
 *   - EC-24-02  La Libertad  (puerto pesquero, más al oeste)
 *   - EC-24-03  Salinas      (balneario / punta costera suroeste)
 *
 * Coordinates are real WGS84 centroids of each canton, then jittered so
 * points cluster naturally around landmarks (malecones, vías principales,
 * playas) instead of stacking on a single pixel.
 *
 * Idempotent on (title) — re-running this seeder does NOT duplicate rows.
 * If you want a fresh dataset, pass `--fresh` to `db:wipe` first, or use
 * the Incident model directly to delete the previous batch by title prefix.
 *
 * Usage:
 *   php artisan db:seed --class=SantaElenaIncidentSeeder
 */
class SantaElenaIncidentSeeder extends Seeder
{
    /**
     * Real centroid coordinates [lat, lng] per canton.
     * Verified against OpenStreetMap and Google Maps for the 3 cantons
     * of the Santa Elena province (Península de Santa Elena, Ecuador).
     */
    private const CANTON_COORDS = [
        'EC-24-01' => [-2.2262, -80.8581], // Santa Elena — cabecera provincial
        'EC-24-02' => [-2.2304, -80.9037], // La Libertad — puerto pesquero
        'EC-24-03' => [-2.2147, -80.9689], // Salinas — balneario / punta
    ];

    /**
     * Incidents to seed. Each row is [canton_code, category_name, status,
     * priority, title, description].
     *
     * Categories chosen reflect real coastal-peninsula concerns: road
     * erosion (baches), drinking-water shortages, fishing-port lighting,
     * beach litter, vía Salinas traffic incidents, salinización de redes
     * eléctricas, malecones vandalizados, etc.
     */
    private const INCIDENTS = [
        // ── Santa Elena (cabecera) — zona urbana + acceso norte ─────────
        ['EC-24-01', 'Baches y Hundimientos',          IncidentStatus::Pending->value,     IncidentPriority::High->value,   'Bache profundo en Av. 9 de Octubre',                 'Hundimiento de aproximadamente 1 metro de diámetro frente al mercado municipal; varios vehículos han sufrido daños en las llantas. Reportado en temporada de lluvias.'],
        ['EC-24-01', 'Alumbrado Público',              IncidentStatus::InProgress->value, IncidentPriority::Medium->value, 'Apagón sectorial en barrio 25 de Diciembre',         'Postes de luz del sector completo (8 unidades) llevan 5 días sin encender; la zona es residencial y los vecinos reportan inseguridad. Cuadrilla enviada, falta reposición de fotoceldas.'],
        ['EC-24-01', 'Agua Potable',                   IncidentStatus::Pending->value,     IncidentPriority::High->value,   'Corte de agua en parroquia Anconcito',               'Suministro interrumpido hace 72 horas por trabajos de repotenciación de la planta; cisternas no han llegado al sector. Afecta a unas 200 familias.'],
        ['EC-24-01', 'Alcantarillado',                 IncidentStatus::Pending->value,     IncidentPriority::High->value,   'Alcantarillado colapsado en calle Olmedo',           'Aguas servidas empozadas en la vía, fuerte olor y proliferación de vectores. Problema recurrente cada temporada invernal — se requiere solución estructural.'],
        ['EC-24-01', 'Recolección de Residuos',        IncidentStatus::Resolved->value,   IncidentPriority::Low->value,    'Basura acumulada en ingreso a Anconcito',            'Montículo de basura de varios días en la entrada al pueblo; el camión recolector no pasó el fin de semana. Ya se coordinó con el GAD municipal para horario nocturno.'],
        ['EC-24-01', 'Señalización Vial',              IncidentStatus::Pending->value,     IncidentPriority::Medium->value, 'Falta de señalización en desvío a Atahualpa',        'Curva peligrosa en la vía Santa Elena–Atahualpa sin señalización ni guardavía; dos accidentes en el último mes. Necesita reductores de velocidad.'],
        ['EC-24-01', 'Veredas y Aceras Deterioradas',  IncidentStatus::Pending->value,     IncidentPriority::Low->value,    'Veredas destruidas en el centro histórico',          'Acera de la calle Colón entre Sucre y Bolívar completamente destruida por raíces de árboles; riesgo para peatones con movilidad reducida.'],
        ['EC-24-01', 'Basureros Clandestinos',         IncidentStatus::InProgress->value, IncidentPriority::Medium->value, 'Vertedero informal en zona de expansión',           'Terreno baldío detrás del colegio técnico convertido en basurero clandestino; quema de residuos genera humo y mal olor. Denuncian vecinos.'],
        ['EC-24-01', 'Construcciones Ilegales',        IncidentStatus::Pending->value,     IncidentPriority::Medium->value, 'Construcción sin permisos en zona protegida',         'Levantamiento de muros en zona de amortiguamiento del Parque Nacional sin autorización municipal; se sospecha afectación de cause natural.'],
        ['EC-24-01', 'Robos y Hurtos',                 IncidentStatus::Resolved->value,   IncidentPriority::High->value,    'Robo a local comercial en el centro',                'Local de celulares afectado durante la madrugada; propietario solicita revisión de cámaras municipales y patrullaje focalizado en esa cuadra. Caso derivado a Policía Nacional.'],
        ['EC-24-01', 'Contaminación Ambiental',        IncidentStatus::InProgress->value, IncidentPriority::High->value,   'Descargas irregulares al estero de Anconcito',       'Vertido de aguas residuales sin tratamiento al estero; mortandad de peces reportada por pescadores artesanales. Muestras enviadas a laboratorio ambiental.'],
        ['EC-24-01', 'Red Eléctrica',                  IncidentStatus::Pending->value,     IncidentPriority::High->value,   'Cables de baja tensión expuestos en colegio',        'Cables colgando a baja altura en el perímetro del colegio Técnico Agropecuario; peligro para estudiantes que ingresan a clases. CNEL debe intervenir urgentemente.'],

        // ── La Libertad — puerto pesquero + zona comercial ─────────────
        ['EC-24-02', 'Baches y Hundimientos',          IncidentStatus::InProgress->value, IncidentPriority::High->value,   'Hundimiento en calle Eloy Alfaro',                   'Hundimiento serio en la calle principal que conecta el puerto con el mercado; vehículos pesados lo han agravado. Señalización colocada pero requiere reparación definitiva.'],
        ['EC-24-02', 'Alumbrado Público',              IncidentStatus::Pending->value,     IncidentPriority::High->value,   'Alumbrado del muelle artesanal inoperativo',         'Postes del muelle de pescadores artesanales sin funcionamiento desde hace 2 semanas; afecta faenas de descarga nocturna.'],
        ['EC-24-02', 'Recolección de Residuos',        IncidentStatus::Pending->value,     IncidentPriority::Medium->value, 'Acumulación de residuos en zona de faenamiento',      'Restos de la actividad pesquera acumulados en zona de faenamiento; necesitan recolección diaria. Convenio con GAD pendiente.'],
        ['EC-24-02', 'Vandalismo',                     IncidentStatus::Resolved->value,   IncidentPriority::Medium->value, 'Vandalismo en parada de buses',                     'Cristales de parada de buses del terminal terrestre rotos durante fin de semana; автор: граффити con tags desconocidos. Reposición coordinada.'],
        ['EC-24-02', 'Accidentes de Tránsito',         IncidentStatus::Pending->value,     IncidentPriority::High->value,   'Punto negro de accidentes en entrada a La Libertad', 'Intersección de vía principal con calle de ingreso a La Libertad registra 3 accidentes en 15 días; requiere semáforo o reductor.'],
        ['EC-24-02', 'Alcantarillado',                 IncidentStatus::InProgress->value, IncidentPriority::Medium->value, 'Tapas de alcantarillado faltantes en av. principal',  'Tres pozos de inspección sin tapa en la avenida principal; reportado por transeúntes; dos caídas de motociclistas esta semana.'],
        ['EC-24-02', 'Señalización Vial',              IncidentStatus::Pending->value,     IncidentPriority::Medium->value, 'Pintura de pasos cebadas borrados',                  'Demarcación de pasos peatonales borrada por el tráfico y el salitre; invisibiliza cruce escolar cercano a unidad educativa.'],
        ['EC-24-02', 'Agua Potable',                   IncidentStatus::Pending->value,     IncidentPriority::High->value,   'Corte programado no anunciado en sector Las Acacias', 'Vecinos reportan corte de agua sin previo aviso de 24 horas; en la zona hay adultos mayores y un centro de salud. Pedimos mejor comunicación.'],
        ['EC-24-02', 'Veredas y Aceras Deterioradas',  IncidentStatus::Resolved->value,   IncidentPriority::Low->value,    'Vereda reconstruida en malecón',                     'Reposición de adoquín en el malecón concluida en un 80%; pendiente tramo final que requiere mobiliario urbano nuevo.'],

        // ── Salinas — balneario / zona turística ───────────────────────
        ['EC-24-03', 'Alumbrado Público',              IncidentStatus::Pending->value,     IncidentPriority::High->value,   'Apagón en malecones turísticos de Salinas',          'Malecones de Chipipe y San Lorenzo sin iluminación nocturna; temporada alta turística próxima y restaurantes reportan menos clientela por sensación de inseguridad.'],
        ['EC-24-03', 'Contaminación Ambiental',        IncidentStatus::InProgress->value, IncidentPriority::High->value,   'Vertido de aguas grises en playa de Chipipe',         'Aguas grises desembocando directamente en zona de baño de Chipipe; pruebas de laboratorio pendientes pero vecinos reportan irritación dérmica.'],
        ['EC-24-03', 'Recolección de Residuos',        IncidentStatus::Pending->value,     IncidentPriority::Medium->value, 'Tachos desbordados en playa',                        'Contenedores de playa desbordados en fin de semana largo; aves y roedores en la arena. Pedimos duplicar frecuencia en temporada alta.'],
        ['EC-24-03', 'Accidentes de Tránsito',         IncidentStatus::Resolved->value,   IncidentPriority::High->value,    'Colisión múltiple en vía Salinas–La Libertad',       'Accidente con tres vehículos involucrados en recta de la vía Salinas–La Libertad; falta señalización de velocidad máxima. Ya se pintaron reductores nuevos.'],
        ['EC-24-03', 'Baches y Hundimientos',          IncidentStatus::Pending->value,     IncidentPriority::Medium->value, 'Baches recurrentes en entrada a Ballenita',          'Tramo final de la vía de ingreso a Ballenita presenta 6 baches profundos; reparaciones anteriores duran menos de un mes. Solicitar solución con mezcla asfáltica en frío.'],
        ['EC-24-03', 'Vandalismo',                     IncidentStatus::Pending->value,     IncidentPriority::Medium->value, 'Pintada de grafitis en monumento municipal',         'Monumento histórico del canton amaneció con pintadas; el rostro del prócer local fue cubierto con spray. Se requiere limpieza especializada para no dañar la piedra.'],
        ['EC-24-03', 'Basureros Clandestinos',         IncidentStatus::Pending->value,     IncidentPriority::Medium->value, 'Microbasural en zona de Punta Carnero',              'Acumulación de residuos en zona rural de Punta Carnero con quema periódica; afectar flora nativa del Área Nacional de Recreación.'],
        ['EC-24-03', 'Red Eléctrica',                  IncidentStatus::InProgress->value, IncidentPriority::High->value,   'Salinización de transformadores en zona costera',    'Tres transformadores del circuito Salinas muestran corrosión acelerada por salinidad; uno se quemó el lunes. CNEL programa reposición, pero afecta comercio local.'],
    ];

    /** Marker so we can detect duplicates across re-runs. */
    private const TITLE_PREFIX = '[SantaElena]';

    public function run(): void
    {
        $categories = IncidentCategory::whereDoesntHave('children')
            ->get()
            ->keyBy('name');

        $locations = Location::whereIn('code', array_keys(self::CANTON_COORDS))
            ->get()
            ->keyBy('code');

        $users = User::all()->keyBy('email');

        // Order: more specific → more generic. Pick one that exists in DB.
        $reporterPool = [
            $users->get('admin@sistema.com'),
            $users->get('operador@sistema.com'),
            $users->get('usuario@test.com'),
            $users->get('ciudadano.test@incidencias.com'),
        ];

        if ($reporterPool === [null, null, null, null]) {
            $this->command?->error('No users found. Run UserSeeder first.');

            return;
        }

        $created = 0;
        $skipped = 0;

        foreach (self::INCIDENTS as [$cantonCode, $categoryName, $status, $priority, $title, $description]) {
            $category = $categories->get($categoryName);
            $location = $locations->get($cantonCode);

            if (! $category || ! $location) {
                $this->command?->warn("Skipping — missing category=[{$categoryName}] or location=[{$cantonCode}]");

                continue;
            }

            // Idempotency key — re-runs do NOT duplicate rows.
            $uniqueTitle = sprintf('%s %s — %s', self::TITLE_PREFIX, $cantonCode, $title);

            if (Incident::where('title', $uniqueTitle)->exists()) {
                $skipped++;

                continue;
            }

            // Real centroid of the canton, then jitter ~±1.5 km so points
            // don't all stack on the city hall. 1500/100000 = ±0.015 degrees
            // ≈ ±1.6 km at the equator — enough to scatter naturally
            // without leaving the canton.
            [$lat, $lng] = self::CANTON_COORDS[$cantonCode];
            $latOffset = random_int(-1500, 1500) / 100000;
            $lngOffset = random_int(-1500, 1500) / 100000;

            // Distribute reporters so a single user isn't credited for everything.
            $reporter = collect($reporterPool)
                ->filter()
                ->random();

            Incident::create([
                'incident_category_id' => $category->id,
                'user_id' => $reporter->id,
                'location_id' => $location->id,
                // organization_id stays null — no GAD assigned to Santa Elena yet.
                'title' => $uniqueTitle,
                'description' => $description,
                'status' => $status,
                'priority' => $priority,
                'resolution_date' => $status === IncidentStatus::Resolved->value
                    ? now()->subDays(random_int(1, 30))
                    : null,
                'geom' => new Point($lat + $latOffset, $lng + $lngOffset, 4326),
            ]);

            $created++;
        }

        $this->command?->info(sprintf(
            'Santa Elena seed complete: %d created, %d skipped (already present).',
            $created,
            $skipped,
        ));
    }
}
