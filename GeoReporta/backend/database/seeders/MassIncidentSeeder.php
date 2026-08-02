<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domains\IncidentCategories\Models\IncidentCategory;
use App\Domains\Incidents\Enums\IncidentStatus;
use App\Domains\Incidents\Models\Incident;
use App\Domains\Locations\Models\Location;
use App\Domains\Notifications\Enums\NotificationType;
use App\Domains\Organizations\Models\Organization;
use App\Domains\Roles\Enums\UserRole;
use App\Domains\Users\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Generates a large, realistic dataset for demo and performance testing:
 * 1000 incidents with a coherent lifecycle — assignments (responsable /
 * apoyo), status history, approval decisions, threaded comments and
 * pending-approval notifications.
 *
 * Usage:
 *   php artisan db:seed --class=MassIncidentSeeder
 *
 * Prerequisites (all seeded by DatabaseSeeder): locations, organizations,
 * users (UserSeeder also creates the citizen reporters) and the leaf
 * incident categories.
 *
 * Consistency rules encoded here mirror the domain services, so the data
 * survives the DB CHECK constraints and looks like real usage:
 *   - `pending`      → no assignment, no claim, no resolution date.
 *   - `in_progress`  → responsable assigned + `claimed_by`; may carry a
 *                      previous rejection (rejected_by/at + reason).
 *   - `resolved`     → responsable assigned, `resolution_date` set and a
 *                      pending-approval notification for the org admins.
 *   - `closed`       → approved by an org admin (`approved_by`/`approved_at`).
 * `approved_*` and `rejected_*` are never set on the same row
 * (`chk_incidents_decision_xor`).
 *
 * Rows are written with bulk inserts, so no model events / DB UPDATE
 * triggers fire: every history row and notification is written explicitly.
 */
class MassIncidentSeeder extends Seeder
{
    private const int TOTAL = 1000;

    /** Fixed seed so consecutive runs on a fresh DB produce the same dataset. */
    private const int RANDOM_SEED = 20260731;

    /** Incidents are spread over this many days back from "now". */
    private const int HISTORY_DAYS = 180;

    /**
     * City center coordinates [latitude, longitude] plus the share of
     * incidents each city receives (weights sum to 100).
     *
     * Only the first five cities have organizations (see OrganizationSeeder);
     * incidents in the remaining ones stay unrouted (`organization_id` null,
     * status `pending`), which is exactly what an un-triaged report looks like.
     *
     * @var array<string, array{lat: float, lng: float, weight: int}>
     */
    private const CITIES = [
        'EC-17-01' => ['lat' => -0.2295, 'lng' => -78.5249, 'weight' => 22], // Quito
        'EC-09-01' => ['lat' => -2.1894, 'lng' => -79.8891, 'weight' => 20], // Guayaquil
        'EC-01-01' => ['lat' => -2.9001, 'lng' => -79.0059, 'weight' => 14], // Cuenca
        'EC-18-01' => ['lat' => -1.2491, 'lng' => -78.6269, 'weight' => 11], // Ambato
        'EC-11-01' => ['lat' => -3.9931, 'lng' => -79.2042, 'weight' => 11], // Loja
        'EC-24-01' => ['lat' => -2.2662, 'lng' => -80.8581, 'weight' => 5],  // Santa Elena
        'EC-05-01' => ['lat' => -0.9352, 'lng' => -78.6154, 'weight' => 3],  // Latacunga
        'EC-06-01' => ['lat' => -1.6706, 'lng' => -78.6470, 'weight' => 3],  // Riobamba
        'EC-13-01' => ['lat' => -1.0546, 'lng' => -80.4525, 'weight' => 3],  // Portoviejo
        'EC-07-01' => ['lat' => -3.2672, 'lng' => -79.9608, 'weight' => 3],  // Machala
        'EC-10-01' => ['lat' => 0.3515, 'lng' => -78.1292, 'weight' => 3],   // Ibarra
        'EC-08-01' => ['lat' => 0.9683, 'lng' => -79.6539, 'weight' => 2],   // Esmeraldas
    ];

    /**
     * Street names per city, used to build believable titles.
     *
     * @var array<string, list<string>>
     */
    private const STREETS = [
        'EC-17-01' => ['Av. Amazonas', 'Av. 10 de Agosto', 'Av. Naciones Unidas', 'Calle Juan León Mera', 'Av. Eloy Alfaro', 'Av. 6 de Diciembre'],
        'EC-09-01' => ['Av. 9 de Octubre', 'Av. Francisco de Orellana', 'Malecón Simón Bolívar', 'Av. Las Américas', 'Calle Chimborazo'],
        'EC-01-01' => ['Av. Solano', 'Calle Larga', 'Av. Remigio Crespo', 'Av. Doce de Abril', 'Calle Gran Colombia'],
        'EC-18-01' => ['Av. Cevallos', 'Av. Los Shyris', 'Calle Bolívar', 'Av. Atahualpa'],
        'EC-11-01' => ['Av. Universitaria', 'Calle Bolívar', 'Av. Manuel Agustín Aguirre', 'Calle Sucre'],
        'EC-24-01' => ['Av. Eleodoro Solórzano', 'Calle Guayaquil', 'Av. Sixto Durán Ballén'],
        'EC-05-01' => ['Av. Amazonas', 'Calle Quito', 'Av. Unidad Nacional'],
        'EC-06-01' => ['Av. Daniel León Borja', 'Calle Primera Constituyente', 'Av. Lizarzaburu'],
        'EC-13-01' => ['Av. Manabí', 'Calle Ricaurte', 'Av. Universitaria'],
        'EC-07-01' => ['Av. 25 de Junio', 'Av. Las Palmeras', 'Calle Guayas'],
        'EC-10-01' => ['Av. Mariano Acosta', 'Calle Sucre', 'Av. Teodoro Gómez'],
        'EC-08-01' => ['Av. Libertad', 'Calle Bolívar', 'Av. Malecón'],
    ];

    /** Neighbourhood names appended to descriptions for extra realism. */
    private const SECTORS = [
        'La Floresta', 'San Blas', 'El Recreo', 'Los Ceibos', 'La Merced',
        'Ciudadela Bolívar', 'Barrio Central', 'La Primavera', 'El Progreso',
        'Santa Rosa', 'Las Acacias', 'San Francisco',
    ];

    /**
     * Title and description templates per leaf category name.
     * `%s` in a title is replaced by the street; categories missing from this
     * map fall back to a generic template.
     *
     * @var array<string, array{titles: list<string>, descriptions: list<string>}>
     */
    private const CATEGORY_CONTENT = [
        'Baches y Hundimientos' => [
            'titles' => ['Bache profundo en %s', 'Hundimiento del asfalto en %s', 'Calzada destruida en %s'],
            'descriptions' => [
                'El bache tiene cerca de un metro de diámetro y ya provocó daños en varios vehículos.',
                'El hundimiento crece cada vez que llueve y obliga a los autos a invadir el carril contrario.',
                'La capa asfáltica está levantada en todo el tramo; las motos son las más afectadas.',
            ],
        ],
        'Semáforos Dañados' => [
            'titles' => ['Semáforo apagado en %s', 'Semáforo en intermitente permanente en %s', 'Semáforo peatonal sin funcionar en %s'],
            'descriptions' => [
                'El semáforo lleva varios días sin encender y el cruce se volvió muy peligroso en hora pico.',
                'Queda en amarillo intermitente todo el día, nadie respeta la preferencia.',
                'El botón peatonal no responde y los adultos mayores cruzan a la suerte.',
            ],
        ],
        'Señalización Vial' => [
            'titles' => ['Señalización borrada en %s', 'Señal de pare derribada en %s', 'Falta señalización de cruce escolar en %s'],
            'descriptions' => [
                'Las líneas de la calzada están completamente borradas y no se distinguen los carriles.',
                'La señal fue derribada hace semanas y sigue tirada en la vereda.',
                'Es una zona de escuela y no hay ninguna señal que obligue a reducir la velocidad.',
            ],
        ],
        'Alumbrado Público' => [
            'titles' => ['Luminarias apagadas en %s', 'Poste de luz sin funcionar en %s', 'Tramo completamente oscuro en %s'],
            'descriptions' => [
                'Son cinco postes seguidos sin luz; el sector quedó totalmente a oscuras por las noches.',
                'La luminaria prende y se apaga sola durante toda la noche.',
                'La falta de iluminación aumentó los robos a peatones en las últimas semanas.',
            ],
        ],
        'Agua Potable' => [
            'titles' => ['Fuga de agua potable en %s', 'Corte de agua prolongado en %s', 'Tubería rota en %s'],
            'descriptions' => [
                'El agua corre por la calle desde hace días y se está desperdiciando muchísimo.',
                'Llevamos más de 48 horas sin servicio y no hemos recibido ninguna explicación.',
                'La rotura dejó un socavón junto a la vereda y el agua sale con presión.',
            ],
        ],
        'Alcantarillado' => [
            'titles' => ['Alcantarilla colapsada en %s', 'Tapa de alcantarilla faltante en %s', 'Aguas servidas en la vía en %s'],
            'descriptions' => [
                'El alcantarillado se desborda cada vez que llueve e inunda las viviendas de la esquina.',
                'La tapa fue robada y el hueco quedó abierto, es un riesgo enorme para peatones y motos.',
                'Corren aguas servidas por la calzada y el olor es insoportable.',
            ],
        ],
        'Recolección de Residuos' => [
            'titles' => ['Basura sin recolectar en %s', 'Contenedor desbordado en %s', 'Recolector no pasa por %s'],
            'descriptions' => [
                'El carro recolector no pasa hace una semana y las fundas se acumulan en la esquina.',
                'El contenedor está desbordado y los perros callejeros riegan la basura por toda la cuadra.',
                'Los desechos llevan días al sol; ya hay moscas y mal olor en todo el sector.',
            ],
        ],
        'Red Eléctrica' => [
            'titles' => ['Cables eléctricos caídos en %s', 'Transformador con chispas en %s', 'Cortes de energía frecuentes en %s'],
            'descriptions' => [
                'Los cables quedaron colgando a baja altura después del último temporal.',
                'El transformador hace ruido y suelta chispas; los vecinos tenemos miedo de un incendio.',
                'La energía se corta varias veces al día y ya dañó electrodomésticos en dos casas.',
            ],
        ],
        'Robos y Hurtos' => [
            'titles' => ['Robos frecuentes a peatones en %s', 'Hurto de accesorios de vehículos en %s', 'Asaltos en paradas de bus en %s'],
            'descriptions' => [
                'Se registran asaltos casi todas las noches en el mismo tramo, siempre en moto.',
                'Han roto vidrios de varios autos estacionados durante la madrugada.',
                'Los estudiantes son abordados al salir de clases; se necesita patrullaje.',
            ],
        ],
        'Vandalismo' => [
            'titles' => ['Mobiliario urbano destruido en %s', 'Grafitis en fachadas de %s', 'Parque infantil vandalizado en %s'],
            'descriptions' => [
                'Rompieron las bancas y los basureros del parque durante el fin de semana.',
                'Las paredes del sector amanecieron rayadas otra vez; ya es la tercera ocasión este mes.',
                'Los juegos infantiles quedaron inutilizables y con piezas metálicas sueltas.',
            ],
        ],
        'Accidentes de Tránsito' => [
            'titles' => ['Accidente de tránsito en %s', 'Choque múltiple en %s', 'Atropellamiento en %s'],
            'descriptions' => [
                'Se produjo un choque entre dos vehículos; el tráfico está detenido en ambos sentidos.',
                'Es el tercer accidente del mes en la misma intersección, la visibilidad es pésima.',
                'Un peatón fue atropellado en el cruce, se requiere control de velocidad urgente.',
            ],
        ],
        'Contaminación Ambiental' => [
            'titles' => ['Descarga de aguas contaminadas en %s', 'Quema de basura en %s', 'Humo de taller mecánico en %s'],
            'descriptions' => [
                'Se está descargando líquido con mal olor directamente al estero.',
                'Queman basura a diario y el humo entra a las viviendas cercanas.',
                'El taller trabaja sin filtros y el olor a solvente afecta a los vecinos.',
            ],
        ],
        'Tala de Árboles' => [
            'titles' => ['Tala no autorizada en %s', 'Árbol a punto de caer en %s', 'Poda mal ejecutada en %s'],
            'descriptions' => [
                'Cortaron varios árboles del parterre sin ningún aviso ni permiso visible.',
                'El árbol está inclinado sobre la vereda y sus raíces ya levantaron el adoquinado.',
                'La poda dejó ramas colgando sobre el tendido eléctrico.',
            ],
        ],
        'Basureros Clandestinos' => [
            'titles' => ['Botadero clandestino en %s', 'Escombros abandonados en %s', 'Acumulación de chatarra en %s'],
            'descriptions' => [
                'El terreno baldío se convirtió en botadero; llegan camiones a descargar en la noche.',
                'Dejaron escombros de una construcción sobre la vereda y nadie los retira.',
                'Hay chatarra acumulada que ya está criando roedores.',
            ],
        ],
        'Construcciones Ilegales' => [
            'titles' => ['Construcción sin permiso en %s', 'Ampliación irregular en %s', 'Obra invade la vereda en %s'],
            'descriptions' => [
                'Están levantando una tercera planta sin ningún permiso a la vista.',
                'La ampliación invade el retiro municipal y tapa la luz de los vecinos.',
                'El cerramiento de la obra ocupa toda la vereda y obliga a caminar por la calzada.',
            ],
        ],
        'Obras Abandonadas' => [
            'titles' => ['Obra municipal abandonada en %s', 'Zanja abierta sin señalización en %s', 'Materiales abandonados en %s'],
            'descriptions' => [
                'La obra está paralizada hace meses y dejó la calle en mal estado.',
                'La zanja quedó abierta, sin cintas ni señalización nocturna.',
                'Los materiales llevan semanas en la vía pública ocupando dos carriles.',
            ],
        ],
        'Veredas y Aceras Deterioradas' => [
            'titles' => ['Vereda destruida en %s', 'Acera intransitable en %s', 'Rampa de accesibilidad dañada en %s'],
            'descriptions' => [
                'Las baldosas están levantadas y ya se han caído varias personas.',
                'La acera está tan deteriorada que las sillas de ruedas no pueden circular.',
                'La rampa de accesibilidad se hundió y quedó con un desnivel peligroso.',
            ],
        ],
    ];

    /** Fallback templates for category names not covered above. */
    private const GENERIC_TITLES = ['Problema reportado en %s', 'Situación pendiente de atención en %s'];

    private const GENERIC_DESCRIPTIONS = [
        'Los vecinos del sector solicitan una inspección técnica lo antes posible.',
        'La situación se mantiene sin cambios desde hace varios días.',
    ];

    /** Comments written by citizens. */
    private const CITIZEN_COMMENTS = [
        'Ya reporté esto hace dos semanas y sigue igual.',
        '¿Podrían darle prioridad? Es peligroso para los peatones.',
        'El problema empeoró con las lluvias de ayer.',
        'Vinieron a revisar pero no hicieron nada.',
        'Solicito una inspección técnica lo antes posible.',
        'Mis vecinos también están afectados por esto.',
        '¿Hay algún número de seguimiento para este caso?',
        'Sigue igual, nadie ha venido a reparar.',
        'Esto lleva meses así, necesitamos una solución urgente.',
        'Afecta a toda la cuadra, por favor denle celeridad.',
        '¿Podrían enviar una cuadrilla esta semana?',
        'Ya pasaron 15 días y no hay novedades.',
        'Hay niños que pasan por aquí, es riesgoso.',
        'Adjunto más fotos del estado actual.',
        'El olor es insoportable, necesitamos acción ya.',
        '¿A qué hora pasarán a revisar? Necesito estar presente.',
        'Hay varios puntos afectados en la misma calle.',
        'La reparación anterior duró una semana y ya volvió a dañarse.',
        'Por favor confirmen recepción de este reporte.',
        'Los vecinos hicimos una colecta para los materiales.',
    ];

    /** Comments written by the assigned operators. */
    private const OPERATOR_COMMENTS = [
        'Recibimos el reporte, ya está en la programación de la cuadrilla.',
        'Realizamos la inspección técnica; se requiere material adicional.',
        'La intervención está programada para esta semana.',
        'Coordinamos con la empresa de agua potable para la reparación.',
        'Se colocó señalización preventiva mientras se ejecuta el trabajo.',
        'El caso fue derivado al área competente para su ejecución.',
        'Trabajo ejecutado, quedamos atentos a cualquier novedad.',
        'Necesitamos el detalle exacto de la dirección para continuar.',
    ];

    /** Replies used to build threaded conversations. */
    private const REPLY_COMMENTS = [
        'Gracias por la respuesta, quedamos pendientes.',
        'Confirmo que el problema persiste en el mismo punto.',
        'Perfecto, estaré en el domicilio ese día.',
        'Ya vinieron y quedó solucionado, muchas gracias.',
        'La dirección exacta es a media cuadra de la esquina.',
        'Sigue igual, por favor revisar nuevamente.',
        'Excelente gestión, se nota la mejora.',
    ];

    /** Notes attached to the status history rows. */
    private const RESOLUTION_NOTES = [
        'Trabajo ejecutado por la cuadrilla municipal.',
        'Reparación completada y verificada en sitio.',
        'Se atendió el requerimiento con el área técnica.',
        'Intervención finalizada, se retiró la señalización preventiva.',
    ];

    /** Reasons used when an admin rejects a resolution. */
    private const REJECTION_REASONS = [
        'La evidencia adjunta no demuestra que el trabajo esté terminado.',
        'El reporte fotográfico corresponde a otra ubicación, favor corregir.',
        'Falta el informe técnico de la intervención, no se puede aprobar.',
        'Los vecinos reportan que el problema continúa, revisar nuevamente.',
    ];

    public function run(): void
    {
        $existing = Incident::withTrashed()->count();

        if ($existing >= self::TOTAL) {
            $this->command?->warn(
                "MassIncidentSeeder skipped: the database already holds {$existing} incidents (>= ".self::TOTAL.').'
            );

            return;
        }

        mt_srand(self::RANDOM_SEED);

        $categories = IncidentCategory::whereDoesntHave('children')->get(['id', 'name']);
        if ($categories->isEmpty()) {
            $this->command?->error('No leaf categories found. Run IncidentCategorySeeder first.');

            return;
        }

        $locations = Location::whereIn('code', array_keys(self::CITIES))->get(['id', 'code'])->keyBy('code');
        if ($locations->isEmpty()) {
            $this->command?->error('No seeded locations found. Run EcuadorLocationSeeder first.');

            return;
        }

        $roleIds = DB::table('roles')->pluck('id', 'name');

        $citizenIds = $this->userIdsByRole($roleIds, UserRole::Usuario);
        if ($citizenIds === []) {
            $this->command?->error('No citizen users found. Run UserSeeder first.');

            return;
        }

        $orgsByLocation = Organization::query()
            ->get(['id', 'location_id'])
            ->groupBy('location_id')
            ->map(static fn ($group) => $group->pluck('id')->all())
            ->all();

        $operatorsByOrg = $this->userIdsByRoleGroupedByOrg($roleIds, UserRole::OperadorOrganizacion);
        $adminsByOrg = $this->userIdsByRoleGroupedByOrg($roleIds, UserRole::AdminOrganizacion);
        $fallbackAdminId = $this->userIdsByRole($roleIds, UserRole::AdminSistema)[0] ?? null;

        $this->command?->info('Planning '.self::TOTAL.' incidents...');
        $bar = $this->command?->getOutput()->createProgressBar(self::TOTAL);
        $bar?->start();

        $now = CarbonImmutable::now();
        $plans = [];
        $rows = [];

        for ($i = 0; $i < self::TOTAL; $i++) {
            $cityCode = $this->weightedCity();
            $location = $locations->get($cityCode);

            if ($location === null) {
                $bar?->advance();

                continue;
            }

            $orgId = $this->pickOrNull($orgsByLocation[$location->id] ?? []);
            $operatorIds = $orgId !== null ? ($operatorsByOrg[$orgId] ?? []) : [];
            $adminIds = $orgId !== null ? ($adminsByOrg[$orgId] ?? []) : [];

            $plan = $this->buildPlan(
                now: $now,
                cityCode: $cityCode,
                locationId: (int) $location->id,
                category: $categories->random(),
                organizationId: $orgId,
                citizenIds: $citizenIds,
                operatorIds: $operatorIds,
                adminIds: $adminIds,
                fallbackAdminId: $fallbackAdminId,
            );

            $plans[] = $plan;
            $rows[] = $plan['row'];

            $bar?->advance();
        }

        $bar?->finish();
        $this->command?->newLine();

        $incidentIds = $this->insertIncidents($rows);

        if (count($incidentIds) !== count($plans)) {
            $this->command?->error(
                'Inserted '.count($incidentIds).' incidents but planned '.count($plans).
                ' — aborting child records to avoid mismatched relations.'
            );

            return;
        }

        $this->command?->info(count($incidentIds).' incidents inserted.');

        $this->insertAssignments($plans, $incidentIds);
        $this->insertStatusHistory($plans, $incidentIds);
        $this->insertNotifications($plans, $incidentIds);
        $this->insertComments($plans, $incidentIds);

        $this->reportDistribution($plans);
    }

    /**
     * Builds every derived value for one incident: the insert row plus the
     * lifecycle plan (assignments, history, comments, notifications) that the
     * child inserts consume once the incident id is known.
     *
     * @param  list<int>  $citizenIds
     * @param  list<int>  $operatorIds
     * @param  list<int>  $adminIds
     * @return array<string, mixed>
     */
    private function buildPlan(
        CarbonImmutable $now,
        string $cityCode,
        int $locationId,
        IncidentCategory $category,
        ?int $organizationId,
        array $citizenIds,
        array $operatorIds,
        array $adminIds,
        ?int $fallbackAdminId,
    ): array {
        $createdAt = $now
            ->subDays(mt_rand(0, self::HISTORY_DAYS))
            ->setTime(mt_rand(6, 22), mt_rand(0, 59), mt_rand(0, 59));

        $reporterId = $this->pick($citizenIds);
        $street = $this->pick(self::STREETS[$cityCode] ?? ['la vía pública']);
        $content = self::CATEGORY_CONTENT[$category->name] ?? [
            'titles' => self::GENERIC_TITLES,
            'descriptions' => self::GENERIC_DESCRIPTIONS,
        ];

        $title = mb_substr(sprintf($this->pick($content['titles']), $street), 0, 255);
        $description = $this->pick($content['descriptions']).' Sector '.$this->pick(self::SECTORS).'.';

        // Incidents outside an organization's coverage stay untriaged.
        $canBeWorked = $organizationId !== null && $operatorIds !== [];
        $status = $canBeWorked ? $this->weightedStatus() : IncidentStatus::Pending->value;

        $responsableId = null;
        $apoyoIds = [];
        $assignedAt = null;
        $resolvedAt = null;
        $closedAt = null;
        $rejectedAt = null;
        $rejectionReason = null;
        $adminId = $this->pickOrNull($adminIds) ?? $fallbackAdminId;

        if ($status !== IncidentStatus::Pending->value) {
            $responsableId = $this->pick($operatorIds);
            $assignedAt = $createdAt->addHours(mt_rand(2, 96));

            $apoyoPool = array_values(array_diff($operatorIds, [$responsableId]));
            if ($apoyoPool !== [] && $this->chance(35)) {
                $apoyoIds[] = $this->pick($apoyoPool);
            }
        }

        if (in_array($status, [IncidentStatus::Resolved->value, IncidentStatus::Closed->value], true)) {
            $resolvedAt = $assignedAt->addHours(mt_rand(6, 480));
        }

        if ($status === IncidentStatus::Closed->value) {
            if ($adminId === null) {
                // Nobody can approve in this organization: the incident stays
                // resolved, waiting in the approval inbox.
                $status = IncidentStatus::Resolved->value;
            } else {
                $closedAt = $resolvedAt->addHours(mt_rand(2, 120));
            }
        }

        // ~12% of the in_progress incidents come back from a rejected resolution.
        if ($status === IncidentStatus::InProgress->value && $adminId !== null && $this->chance(12)) {
            $resolvedAt = $assignedAt->addHours(mt_rand(6, 240));
            $rejectedAt = $resolvedAt->addHours(mt_rand(2, 72));
            $rejectionReason = $this->pick(self::REJECTION_REASONS);
        }

        [$lat, $lng] = [self::CITIES[$cityCode]['lat'], self::CITIES[$cityCode]['lng']];
        $lat += mt_rand(-1500, 1500) / 100000;
        $lng += mt_rand(-1500, 1500) / 100000;

        $isClosed = $status === IncidentStatus::Closed->value;
        $isRejected = $rejectedAt !== null;

        $row = [
            'title' => $title,
            'description' => $description,
            'incident_category_id' => $category->id,
            'organization_id' => $organizationId,
            'user_id' => $reporterId,
            'location_id' => $locationId,
            'status' => $status,
            'priority' => $this->weightedPriority(),
            // `resolution_date` only survives while the resolution stands:
            // a rejected resolution sends the incident back to in_progress.
            'resolution_date' => $isRejected ? null : $resolvedAt,
            'claimed_by' => $responsableId,
            'claimed_at' => $assignedAt,
            'approved_by' => $isClosed ? $adminId : null,
            'approved_at' => $isClosed && $adminId !== null ? $closedAt : null,
            'rejected_by' => $isRejected ? $adminId : null,
            'rejected_at' => $isRejected ? $rejectedAt : null,
            'rejection_reason' => $isRejected ? $rejectionReason : null,
            'created_at' => $createdAt,
            'updated_at' => $closedAt ?? $rejectedAt ?? $resolvedAt ?? $assignedAt ?? $createdAt,
        ];

        // The `geom` column only exists on PostgreSQL (see the incidents
        // migration), so it is added conditionally rather than sent as null.
        if (DB::connection()->getDriverName() === 'pgsql') {
            $row['geom'] = DB::raw(sprintf("ST_GeomFromText('POINT(%.6f %.6f)', 4326)", $lng, $lat));
        }

        return [
            'row' => $row,
            'status' => $status,
            'created_at' => $createdAt,
            'assigned_at' => $assignedAt,
            'resolved_at' => $resolvedAt,
            'closed_at' => $closedAt,
            'rejected_at' => $rejectedAt,
            'rejection_reason' => $rejectionReason,
            'reporter_id' => $reporterId,
            'responsable_id' => $responsableId,
            'apoyo_ids' => $apoyoIds,
            'admin_ids' => $adminIds,
            'admin_id' => $adminId,
            'title' => $title,
            'comments' => $this->buildCommentThreads(
                createdAt: $createdAt,
                reporterId: $reporterId,
                responsableId: $responsableId,
                citizenIds: $citizenIds,
            ),
        ];
    }

    /**
     * Builds the comment threads for one incident: root comments authored by
     * citizens or the assigned operator, some of them with replies.
     *
     * @param  list<int>  $citizenIds
     * @return list<array{user_id: int, message: string, created_at: CarbonImmutable, replies: list<array{user_id: int, message: string, created_at: CarbonImmutable}>}>
     */
    private function buildCommentThreads(
        CarbonImmutable $createdAt,
        int $reporterId,
        ?int $responsableId,
        array $citizenIds,
    ): array {
        // ~55% of the incidents carry a conversation.
        if (! $this->chance(55)) {
            return [];
        }

        $threads = [];
        $cursor = $createdAt;

        foreach (range(1, mt_rand(1, 4)) as $ignored) {
            $cursor = $cursor->addHours(mt_rand(3, 72));

            $fromOperator = $responsableId !== null && $this->chance(35);
            $authorId = $fromOperator
                ? $responsableId
                : ($this->chance(50) ? $reporterId : $this->pick($citizenIds));

            $replies = [];
            if ($this->chance(40)) {
                $replyCursor = $cursor;

                foreach (range(1, mt_rand(1, 2)) as $ignoredReply) {
                    $replyCursor = $replyCursor->addHours(mt_rand(1, 36));

                    $replies[] = [
                        // A reply comes from the other side of the conversation.
                        'user_id' => $fromOperator ? $reporterId : ($responsableId ?? $this->pick($citizenIds)),
                        'message' => $this->pick(self::REPLY_COMMENTS),
                        'created_at' => $replyCursor,
                    ];
                }
            }

            $threads[] = [
                'user_id' => $authorId,
                'message' => $fromOperator
                    ? $this->pick(self::OPERATOR_COMMENTS)
                    : $this->pick(self::CITIZEN_COMMENTS),
                'created_at' => $cursor,
                'replies' => $replies,
            ];
        }

        return $threads;
    }

    /**
     * Bulk-inserts the incident rows and returns the generated ids in insert
     * order, so each id maps back to its plan by index.
     *
     * `insert()` gives no RETURNING clause, so the ids are read back from the
     * watermark taken before the write. The seeder is a single-writer script,
     * which makes this safe here (and it is guarded by the count check in run()).
     *
     * @param  list<array<string, mixed>>  $rows
     * @return list<int>
     */
    private function insertIncidents(array $rows): array
    {
        $watermark = (int) (DB::table('incidents')->max('id') ?? 0);

        foreach (array_chunk($rows, 100) as $chunk) {
            DB::table('incidents')->insert($chunk);
        }

        return DB::table('incidents')
            ->where('id', '>', $watermark)
            ->orderBy('id')
            ->pluck('id')
            ->map(static fn ($id) => (int) $id)
            ->all();
    }

    /**
     * @param  list<array<string, mixed>>  $plans
     * @param  list<int>  $incidentIds
     */
    private function insertAssignments(array $plans, array $incidentIds): void
    {
        $rows = [];

        foreach ($plans as $index => $plan) {
            if ($plan['responsable_id'] === null) {
                continue;
            }

            $rows[] = [
                'incident_id' => $incidentIds[$index],
                'user_id' => $plan['responsable_id'],
                'assignment_role' => 'responsable',
                'created_at' => $plan['assigned_at'],
                'updated_at' => $plan['assigned_at'],
            ];

            foreach ($plan['apoyo_ids'] as $apoyoId) {
                $apoyoAssignedAt = $plan['assigned_at']->addHours(mt_rand(1, 24));

                $rows[] = [
                    'incident_id' => $incidentIds[$index],
                    'user_id' => $apoyoId,
                    'assignment_role' => 'apoyo',
                    'created_at' => $apoyoAssignedAt,
                    'updated_at' => $apoyoAssignedAt,
                ];
            }
        }

        foreach (array_chunk($rows, 200) as $chunk) {
            DB::table('assignments')->insert($chunk);
        }

        $this->command?->info(count($rows).' assignments inserted.');
    }

    /**
     * Writes the status transitions by hand: the `trg_log_incident_status`
     * trigger only fires on UPDATE, and this seeder never updates.
     *
     * @param  list<array<string, mixed>>  $plans
     * @param  list<int>  $incidentIds
     */
    private function insertStatusHistory(array $plans, array $incidentIds): void
    {
        $rows = [];

        foreach ($plans as $index => $plan) {
            $incidentId = $incidentIds[$index];

            if ($plan['assigned_at'] === null || $plan['responsable_id'] === null) {
                continue;
            }

            $rows[] = [
                'incident_id' => $incidentId,
                'user_id' => $plan['responsable_id'],
                'previous_status' => IncidentStatus::Pending->value,
                'new_status' => IncidentStatus::InProgress->value,
                'created_at' => $plan['assigned_at'],
                'notes' => 'Incidencia tomada por el operador responsable.',
            ];

            if ($plan['resolved_at'] !== null) {
                $rows[] = [
                    'incident_id' => $incidentId,
                    'user_id' => $plan['responsable_id'],
                    'previous_status' => IncidentStatus::InProgress->value,
                    'new_status' => IncidentStatus::Resolved->value,
                    'created_at' => $plan['resolved_at'],
                    'notes' => $this->pick(self::RESOLUTION_NOTES),
                ];
            }

            if ($plan['closed_at'] !== null && $plan['admin_id'] !== null) {
                $rows[] = [
                    'incident_id' => $incidentId,
                    'user_id' => $plan['admin_id'],
                    'previous_status' => IncidentStatus::Resolved->value,
                    'new_status' => IncidentStatus::Closed->value,
                    'created_at' => $plan['closed_at'],
                    'notes' => 'Resolución aprobada por el administrador.',
                ];
            }

            if ($plan['rejected_at'] !== null && $plan['admin_id'] !== null) {
                $rows[] = [
                    'incident_id' => $incidentId,
                    'user_id' => $plan['admin_id'],
                    'previous_status' => IncidentStatus::Resolved->value,
                    'new_status' => IncidentStatus::InProgress->value,
                    'created_at' => $plan['rejected_at'],
                    'notes' => $plan['rejection_reason'],
                ];
            }
        }

        foreach (array_chunk($rows, 200) as $chunk) {
            DB::table('status_history')->insert($chunk);
        }

        $this->command?->info(count($rows).' status history entries inserted.');
    }

    /**
     * Recreates the approval inbox: every resolved incident notifies the org
     * admins, and decided ones carry `processed_at` like the approval service
     * leaves them.
     *
     * @param  list<array<string, mixed>>  $plans
     * @param  list<int>  $incidentIds
     */
    private function insertNotifications(array $plans, array $incidentIds): void
    {
        $rows = [];

        foreach ($plans as $index => $plan) {
            if ($plan['resolved_at'] === null || $plan['admin_ids'] === []) {
                continue;
            }

            $incidentId = $incidentIds[$index];
            $processedAt = $plan['closed_at'] ?? $plan['rejected_at'];

            foreach ($plan['admin_ids'] as $adminId) {
                $rows[] = [
                    'user_id' => $adminId,
                    'incident_id' => $incidentId,
                    'type' => NotificationType::IncidentPendingApproval->value,
                    'message' => "La incidencia \"{$plan['title']}\" requiere tu aprobación.",
                    'data' => json_encode([
                        'status' => IncidentStatus::Resolved->value,
                        'incident_id' => $incidentId,
                    ], JSON_THROW_ON_ERROR),
                    'read' => $processedAt !== null,
                    'processed_at' => $processedAt,
                    'created_at' => $plan['resolved_at'],
                ];
            }
        }

        foreach (array_chunk($rows, 200) as $chunk) {
            DB::table('notifications')->insert($chunk);
        }

        $this->command?->info(count($rows).' pending-approval notifications inserted.');
    }

    /**
     * Inserts root comments first, reads their ids back, then inserts the
     * replies pointing at `parent_id`.
     *
     * @param  list<array<string, mixed>>  $plans
     * @param  list<int>  $incidentIds
     */
    private function insertComments(array $plans, array $incidentIds): void
    {
        $roots = [];
        $threadIndex = [];

        foreach ($plans as $index => $plan) {
            foreach ($plan['comments'] as $thread) {
                $roots[] = [
                    'incident_id' => $incidentIds[$index],
                    'user_id' => $thread['user_id'],
                    'parent_id' => null,
                    'message' => $thread['message'],
                    'created_at' => $thread['created_at'],
                    'updated_at' => $thread['created_at'],
                ];

                $threadIndex[] = ['incident_id' => $incidentIds[$index], 'replies' => $thread['replies']];
            }
        }

        if ($roots === []) {
            $this->command?->info('0 comments inserted.');

            return;
        }

        $watermark = (int) (DB::table('comments')->max('id') ?? 0);

        foreach (array_chunk($roots, 200) as $chunk) {
            DB::table('comments')->insert($chunk);
        }

        $rootIds = DB::table('comments')
            ->where('id', '>', $watermark)
            ->orderBy('id')
            ->pluck('id')
            ->map(static fn ($id) => (int) $id)
            ->all();

        if (count($rootIds) !== count($threadIndex)) {
            $this->command?->warn('Comment id mapping mismatch — skipping replies.');

            return;
        }

        $replies = [];

        foreach ($threadIndex as $position => $thread) {
            foreach ($thread['replies'] as $reply) {
                $replies[] = [
                    'incident_id' => $thread['incident_id'],
                    'user_id' => $reply['user_id'],
                    'parent_id' => $rootIds[$position],
                    'message' => $reply['message'],
                    'created_at' => $reply['created_at'],
                    'updated_at' => $reply['created_at'],
                ];
            }
        }

        foreach (array_chunk($replies, 200) as $chunk) {
            DB::table('comments')->insert($chunk);
        }

        $this->command?->info(count($roots).' comments + '.count($replies).' replies inserted.');
    }

    /**
     * @param  list<array<string, mixed>>  $plans
     */
    private function reportDistribution(array $plans): void
    {
        $counts = [];

        foreach ($plans as $plan) {
            $counts[$plan['status']] = ($counts[$plan['status']] ?? 0) + 1;
        }

        ksort($counts);

        foreach ($counts as $status => $count) {
            $this->command?->info("  {$status}: {$count}");
        }
    }

    /**
     * @param  Collection<string, int>  $roleIds
     * @return list<int>
     */
    private function userIdsByRole($roleIds, UserRole $role): array
    {
        $roleId = $roleIds[$role->value] ?? null;

        if ($roleId === null) {
            return [];
        }

        return User::query()
            ->where('role_id', $roleId)
            ->pluck('id')
            ->map(static fn ($id) => (int) $id)
            ->all();
    }

    /**
     * @param  Collection<string, int>  $roleIds
     * @return array<int, list<int>>
     */
    private function userIdsByRoleGroupedByOrg($roleIds, UserRole $role): array
    {
        $roleId = $roleIds[$role->value] ?? null;

        if ($roleId === null) {
            return [];
        }

        return User::query()
            ->where('role_id', $roleId)
            ->whereNotNull('organization_id')
            ->get(['id', 'organization_id'])
            ->groupBy('organization_id')
            ->map(static fn ($group) => $group->pluck('id')->map(static fn ($id) => (int) $id)->all())
            ->all();
    }

    /**
     * @template T
     *
     * @param  list<T>  $items
     * @return T
     */
    private function pick(array $items): mixed
    {
        return $items[mt_rand(0, count($items) - 1)];
    }

    /**
     * @param  list<int>  $items
     */
    private function pickOrNull(array $items): ?int
    {
        return $items === [] ? null : $this->pick($items);
    }

    private function chance(int $percent): bool
    {
        return mt_rand(1, 100) <= $percent;
    }

    /**
     * Weighted city code so the big cantons concentrate most of the reports.
     */
    private function weightedCity(): string
    {
        $roll = mt_rand(1, array_sum(array_column(self::CITIES, 'weight')));
        $cumulative = 0;

        foreach (self::CITIES as $code => $city) {
            $cumulative += $city['weight'];

            if ($roll <= $cumulative) {
                return $code;
            }
        }

        return array_key_first(self::CITIES);
    }

    private function weightedStatus(): string
    {
        return $this->weighted([
            IncidentStatus::Pending->value => 20,
            IncidentStatus::InProgress->value => 28,
            IncidentStatus::Resolved->value => 25,
            IncidentStatus::Closed->value => 27,
        ]);
    }

    private function weightedPriority(): string
    {
        return $this->weighted(['low' => 25, 'medium' => 45, 'high' => 30]);
    }

    /**
     * @param  array<string, int>  $weights
     */
    private function weighted(array $weights): string
    {
        $roll = mt_rand(1, array_sum($weights));
        $cumulative = 0;

        foreach ($weights as $value => $weight) {
            $cumulative += $weight;

            if ($roll <= $cumulative) {
                return (string) $value;
            }
        }

        return (string) array_key_first($weights);
    }
}
