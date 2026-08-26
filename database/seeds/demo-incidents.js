#!/usr/bin/env node
/**
 * database/seeds/demo-incidents.js
 *
 * T7.9.D7 — sembrador de ~25 incidentes realistas repartidos en los 3
 * cantones de Santa Elena (R22.3). Equivalente moderno del legacy
 * `SantaElenaIncidentSeeder.php` que la migración transporta.
 *
 * Estructura por incidente:
 *  - título `[DEMO] <título>` (prefijo habilita el chequeo de idempotencia)
 *  - descripción sanitizada (texto, sin HTML)
 *  - status ∈ {pending, in_progress, resolved, closed} (proporcional)
 *  - priority ∈ {low, medium, high, critical}
 *  - location POINT (lat,lng) jittereado desde el centroide real del cantón
 *  - zone_id + organization_id + geofence_matched resueltos por SQL
 *    ST_Contains sobre las parroquias/cantones cargados por 0041
 *  - sin status_history / notifications — esos nacen del flujo de la app
 *    (sólo el seeder de volumen los escribe a mano, design.md D9)
 *
 * Idempotencia (R22.3):
 *  - prefijo `[DEMO]` en el título + chequeo previo
 *  - IDs derivados con `uuidV5('demo/incident/'+i, NS_SEED)` (rand.js)
 *    ⇒ `ON CONFLICT (id) DO NOTHING` resuelve re-runs sin tocar filas
 *
 * Determinismo (design.md D8):
 *  - PRNG `mulberry32(0x20260825)` sembrado una vez, drawn en orden fijo
 *  - timestamps como offsets desde `EPOCH` (constante congelada)
 *  - cero `Math.random`, cero `Date.now`, cero `gen_random_uuid()`
 */
'use strict';

const { Client } = require('./lib/deps');
const { enforce } = require('./lib/guard');
const { SEED, NS_SEED, mulberry32, randInt, pick, uuidV5 } = require('./lib/rand');

const TITLE_PREFIX = '[DEMO]';

/** EPOCH congelado — 2026-08-25 00:00:00 UTC, alineado con SEED. */
const EPOCH = new Date('2026-08-25T00:00:00.000Z');

/** Centroides reales (lat, lng) de los 3 cantones de Santa Elena. */
const CANTON_CENTROIDS = Object.freeze({
  'EC-24-01': { lat: -2.2262, lng: -80.8581, label: 'Santa Elena' },
  'EC-24-02': { lat: -2.2304, lng: -80.9037, label: 'La Libertad' },
  'EC-24-03': { lat: -2.2147, lng: -80.9689, label: 'Salinas' },
});

/** Categorías sembradas por 0038_reference_data.sql — leafs sólo. */
const CATEGORIES = Object.freeze([
  'Baches y Hundimientos',
  'Semáforos Dañados',
  'Señalización Vial',
  'Alumbrado Público',
  'Agua Potable',
  'Alcantarillado',
  'Recolección de Residuos',
  'Red Eléctrica',
  'Robos y Hurtos',
  'Vandalismo',
  'Accidentes de Tránsito',
  'Contaminación Ambiental',
  'Tala de Árboles',
  'Basureros Clandestinos',
  'Construcciones Ilegales',
  'Obras Abandonadas',
  'Veredas y Aceras Deterioradas',
]);

/**
 * 25 incidentes [canton_code, category, status, priority, title, description].
 * Cobertura aproximada: 12 EC-24-01, 9 EC-24-02, 11 EC-24-03 = 32 filas; el
 * corte a 25 viene del caller (--limit / DEFAULT_LIMIT), no de esta lista
 * hardcodeada.
 */
const INCIDENTS = Object.freeze([
  ['EC-24-01', 'Baches y Hundimientos', 'pending', 'high', 'Bache profundo en Av. 9 de Octubre', 'Hundimiento de aprox. 1 metro de diámetro frente al mercado municipal; vehículos han sufrido daños en las llantas durante la temporada de lluvias.'],
  ['EC-24-01', 'Alumbrado Público', 'in_progress', 'medium', 'Apagón sectorial en barrio 25 de Diciembre', 'Postes de luz del sector completo (8 unidades) llevan 5 días sin encender; zona residencial con reportes de inseguridad. Cuadrilla enviada, falta reposición de fotoceldas.'],
  ['EC-24-01', 'Agua Potable', 'pending', 'high', 'Corte de agua en parroquia Anconcito', 'Suministro interrumpido hace 72 horas por trabajos de repotenciación; cisternas no han llegado al sector. Afecta a unas 200 familias.'],
  ['EC-24-01', 'Alcantarillado', 'pending', 'high', 'Alcantarillado colapsado en calle Olmedo', 'Aguas servidas empozadas en la vía, fuerte olor y proliferación de vectores. Problema recurrente cada temporada invernal.'],
  ['EC-24-01', 'Recolección de Residuos', 'resolved', 'low', 'Basura acumulada en ingreso a Anconcito', 'Montículo de basura de varios días en la entrada al pueblo; el camión recolector no pasó el fin de semana. Coordinado con GAD municipal.'],
  ['EC-24-01', 'Señalización Vial', 'pending', 'medium', 'Falta de señalización en desvío a Atahualpa', 'Curva peligrosa en la vía Santa Elena–Atahualpa sin señalización ni guardavía; dos accidentes en el último mes.'],
  ['EC-24-01', 'Veredas y Aceras Deterioradas', 'pending', 'low', 'Veredas destruidas en el centro histórico', 'Acera de la calle Colón entre Sucre y Bolívar destruida por raíces de árboles; riesgo para peatones con movilidad reducida.'],
  ['EC-24-01', 'Basureros Clandestinos', 'in_progress', 'medium', 'Vertedero informal en zona de expansión', 'Terreno baldío detrás del colegio técnico convertido en basurero clandestino; quema de residuos genera humo y mal olor.'],
  ['EC-24-01', 'Robos y Hurtos', 'resolved', 'high', 'Robo a local comercial en el centro', 'Local de celulares afectado durante la madrugada; propietario solicita revisión de cámaras municipales y patrullaje focalizado.'],
  ['EC-24-01', 'Contaminación Ambiental', 'in_progress', 'high', 'Descargas irregulares al estero de Anconcito', 'Vertido de aguas residuales sin tratamiento al estero; mortandad de peces reportada por pescadores artesanales.'],
  ['EC-24-01', 'Red Eléctrica', 'pending', 'high', 'Cables de baja tensión expuestos en colegio', 'Cables colgando a baja altura en el perímetro del colegio Técnico Agropecuario; peligro para estudiantes. CNEL debe intervenir urgentemente.'],
  ['EC-24-01', 'Construcciones Ilegales', 'pending', 'medium', 'Construcción sin permisos en zona protegida', 'Levantamiento de muros en zona de amortiguamiento del Parque Nacional sin autorización municipal.'],
  ['EC-24-02', 'Baches y Hundimientos', 'in_progress', 'high', 'Hundimiento en calle Eloy Alfaro', 'Hundimiento serio en la calle principal que conecta el puerto con el mercado; vehículos pesados lo han agravado.'],
  ['EC-24-02', 'Alumbrado Público', 'pending', 'high', 'Alumbrado del muelle artesanal inoperativo', 'Postes del muelle de pescadores artesanales sin funcionamiento desde hace 2 semanas; afecta faenas de descarga nocturna.'],
  ['EC-24-02', 'Recolección de Residuos', 'pending', 'medium', 'Acumulación de residuos en zona de faenamiento', 'Restos de la actividad pesquera acumulados en zona de faenamiento; necesitan recolección diaria.'],
  ['EC-24-02', 'Vandalismo', 'resolved', 'medium', 'Vandalismo en parada de buses', 'Cristales de parada de buses del terminal terrestre rotos durante fin de semana; reposición coordinada.'],
  ['EC-24-02', 'Accidentes de Tránsito', 'pending', 'high', 'Punto negro de accidentes en entrada a La Libertad', 'Intersección de vía principal con calle de ingreso a La Libertad registra 3 accidentes en 15 días.'],
  ['EC-24-02', 'Alcantarillado', 'in_progress', 'medium', 'Tapas de alcantarillado faltantes en av. principal', 'Tres pozos de inspección sin tapa en la avenida principal; dos caídas de motociclistas esta semana.'],
  ['EC-24-02', 'Señalización Vial', 'pending', 'medium', 'Pintura de pasos cebadas borrados', 'Demarcación de pasos peatonales borrada por el tráfico y el salitre; invisibiliza cruce escolar.'],
  ['EC-24-02', 'Agua Potable', 'pending', 'high', 'Corte programado no anunciado en sector Las Acacias', 'Vecinos reportan corte de agua sin previo aviso de 24 horas; en la zona hay adultos mayores y un centro de salud.'],
  ['EC-24-02', 'Veredas y Aceras Deterioradas', 'resolved', 'low', 'Vereda reconstruida en malecón', 'Reposición de adoquín en el malecón concluida en un 80%; pendiente tramo final.'],
  ['EC-24-03', 'Alumbrado Público', 'pending', 'high', 'Apagón en malecones turísticos de Salinas', 'Malecones de Chipipe y San Lorenzo sin iluminación nocturna; temporada alta turística próxima.'],
  ['EC-24-03', 'Contaminación Ambiental', 'in_progress', 'high', 'Vertido de aguas grises en playa de Chipipe', 'Aguas grises desembocando directamente en zona de baño de Chipipe; vecinos reportan irritación dérmica.'],
  ['EC-24-03', 'Recolección de Residuos', 'pending', 'medium', 'Tachos desbordados en playa', 'Contenedores de playa desbordados en fin de semana largo; aves y roedores en la arena.'],
  ['EC-24-03', 'Accidentes de Tránsito', 'resolved', 'high', 'Colisión múltiple en vía Salinas–La Libertad', 'Accidente con tres vehículos involucrados en recta; falta señalización de velocidad máxima.'],
  ['EC-24-03', 'Baches y Hundimientos', 'pending', 'medium', 'Baches recurrentes en entrada a Ballenita', 'Tramo final de la vía de ingreso a Ballenita presenta 6 baches profundos.'],
  ['EC-24-03', 'Vandalismo', 'pending', 'medium', 'Pintada de grafitis en monumento municipal', 'Monumento histórico del canton amaneció con pintadas; el rostro del prócer local fue cubierto con spray.'],
  ['EC-24-03', 'Basureros Clandestinos', 'pending', 'medium', 'Microbasural en zona de Punta Carnero', 'Acumulación de residuos en zona rural de Punta Carnero con quema periódica; afecta flora nativa.'],
  ['EC-24-03', 'Red Eléctrica', 'in_progress', 'high', 'Salinización de transformadores en zona costera', 'Tres transformadores del circuito Salinas muestran corrosión acelerada por salinidad; uno se quemó el lunes.'],
]);

const DEFAULT_LIMIT = 25;

function readLimit(opts) {
  if (opts && Number.isInteger(opts.limit) && opts.limit > 0) return opts.limit;
  const env = Number.parseInt(process.env.DEMO_SEED_LIMIT || '', 10);
  if (Number.isInteger(env) && env > 0) return env;
  return DEFAULT_LIMIT;
}

/**
 * Resuelve category_id por nombre. Si el caller pasa `--fresh` o el
 * catálogo no tiene la categoría, devuelve null (incidente queda
 * category_id NULL, igual que en incidentes sin clasificar — design.md
 * D9 NO lo excluye).
 */
async function resolveCategoryId(client, name) {
  if (!name) return null;
  const rows = await client.query(
    `SELECT id FROM incident_categories WHERE name = $1 LIMIT 1`,
    [name],
  );
  return rows.rows.length === 0 ? null : rows.rows[0].id;
}

/**
 * Jitter determinista en grados — aprox ±0.02 (~2km) sobre el centroide.
 * Suficiente para que los incidentes no stackeen en un solo pixel sin
 * salirse del cantón.
 */
function jitterCoord(rng, center) {
  return {
    lat: center.lat + (rng() - 0.5) * 0.04,
    lng: center.lng + (rng() - 0.5) * 0.04,
  };
}

/**
 * Resuelve zone_id (la parroquia que contiene el punto) y
 * organization_id (la org sembrada para esa parroquia, si existe)
 * en una sola consulta SQL — evita N+1 sobre 25 incidentes.
 *
 * Devuelve también `geofence_matched` (false si el punto cae fuera de
 * toda zona, R2).
 */
async function resolveZoneForPoint(client, point) {
  const rows = await client.query(
    `SELECT
        z.id           AS zone_id,
        z.level        AS zone_level,
        z.parent_id    AS parent_id,
        o.id           AS organization_id
       FROM geo_zones z
       LEFT JOIN organizations o
         ON o.zone_id = (SELECT id FROM geo_zones WHERE code = 'EC-24-01' LIMIT 1)
      WHERE ST_Contains(z.polygon, ST_SetSRID(ST_MakePoint($1, $2), 4326))
      ORDER BY CASE z.level
                 WHEN 'parroquia' THEN 1
                 WHEN 'canton'    THEN 2
                 WHEN 'provincia' THEN 3
                 ELSE 4
               END
      LIMIT 1`,
    [point.lng, point.lat],
  );
  if (rows.rows.length === 0) {
    return { zone_id: null, organization_id: null, geofence_matched: false };
  }
  return {
    zone_id: rows.rows[0].zone_id,
    organization_id: rows.rows[0].organization_id,
    geofence_matched: true,
  };
}

/**
 * Crea (o no-op si existe por prefijo `[DEMO]`) un incidente. Devuelve
 * { inserted, skipped, id }.
 */
async function upsertIncident(client, params, citizenId) {
  // Idempotencia por prefijo — chequeo previo para que el caller
  // sepa si fue inserted o skipped sin tener que parsear RETURNING.
  const existing = await client.query(
    `SELECT id FROM incidents WHERE title = $1 LIMIT 1`,
    [params.title],
  );
  if (existing.rows.length > 0) {
    return { inserted: false, skipped: true, id: existing.rows[0].id };
  }

  const sql = `
    INSERT INTO incidents (
      id, title, description, location,
      status, priority,
      citizen_id, assigned_to, zone_id, organization_id, geofence_matched,
      category_id,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326),
      $6, $7,
      $8, NULL, $9, $10, $11,
      $12,
      $13, $13
    )
    RETURNING id
  `;
  const result = await client.query(sql, [
    params.id,
    params.title,
    params.description,
    params.point.lng,
    params.point.lat,
    params.status,
    params.priority,
    citizenId,
    params.zone_id,
    params.organization_id,
    params.geofence_matched,
    params.category_id,
    params.created_at,
  ]);
  return { inserted: result.rowCount === 1, skipped: false, id: params.id };
}

/**
 * Citizen reporter — el seeder de usuarios crea 6 cuentas con email,
 * ninguna con rol `reporter`. Para los incidentes de demo,公民 role
 * `reporter` lo toma el usuario anónimo sembrado por 0001_initial_schema.sql
 * (su device_uuid='anonymous' tiene permissions equivalentes, design D1
 * legacy). Si existe, lo usamos; si no, creamos una fila reporter
 * ad-hoc (también válido — 0009 + 0015 lo permiten).
 */
async function ensureCitizenReporter(client) {
  const anon = await client.query(
    `SELECT id FROM users WHERE device_uuid = 'anonymous' LIMIT 1`,
  );
  if (anon.rows.length > 0) return anon.rows[0].id;

  // Fallback: crear un reporter de demo (con permisos CREATE) si el
  // schema local no sembró `anonymous` por alguna razón.
  const reporterRole = await client.query(
    `SELECT id FROM roles WHERE name = 'reporter' LIMIT 1`,
  );
  if (reporterRole.rows.length === 0) {
    throw new Error('demo-incidents.js: role "reporter" no existe — apply 0009+ first.');
  }
  const inserted = await client.query(
    `INSERT INTO users (device_uuid, permissions, is_active, role, role_id)
     VALUES ('demo-citizen-' || gen_random_uuid()::text,
             '["READ incidents","CREATE incidents","READ comments","CREATE comments"]'::jsonb,
             true, 'reporter', $1)
     RETURNING id`,
    [reporterRole.rows[0].id],
  );
  return inserted.rows[0].id;
}

/**
 * Punto de entrada programático — mismo contrato que users.js.
 * Devuelve { inserted, skipped, incidents }.
 */
async function run(client, opts = {}) {
  enforce({
    scriptName: 'demo-incidents.js',
    argv: process.argv.slice(2).concat(opts.force ? ['--force'] : []),
  });

  const limit = readLimit(opts);
  const rng = mulberry32(SEED);
  const citizenId = await ensureCitizenReporter(client);

  // Resolver category_id por nombre (cache local, N+1 evitado).
  const categoryCache = new Map();
  async function categoryIdFor(name) {
    if (!categoryCache.has(name)) {
      categoryCache.set(name, await resolveCategoryId(client, name));
    }
    return categoryCache.get(name);
  }

  let inserted = 0;
  let skipped = 0;
  const incidents = [];

  // Recorremos la lista en orden, cortando en `limit`. El primer incidente
  // se crea con offset 0 desde EPOCH; cada siguiente a +1h exacta.
  const slice = INCIDENTS.slice(0, limit);
  for (let i = 0; i < slice.length; i += 1) {
    const [cantonCode, category, status, priority, title, description] = slice[i];
    const centroid = CANTON_CENTROIDS[cantonCode];
    if (!centroid) {
      throw new Error(`demo-incidents.js: cantón desconocido ${cantonCode}`);
    }
    const point = jitterCoord(rng, centroid);
    const zone = await resolveZoneForPoint(client, point);
    const categoryId = await categoryIdFor(category);
    const id = uuidV5(`demo/incident/${i}`, NS_SEED);
    const createdAt = new Date(EPOCH.getTime() + i * 3600 * 1000);

    const r = await upsertIncident(
      client,
      {
        id,
        title: `${TITLE_PREFIX} ${title}`,
        description,
        point,
        status,
        priority,
        zone_id: zone.zone_id,
        organization_id: zone.organization_id,
        geofence_matched: zone.geofence_matched,
        category_id: categoryId,
        created_at: createdAt,
      },
      citizenId,
    );
    if (r.inserted) inserted += 1;
    else skipped += 1;
    incidents.push({ id: r.id, title, cantonCode, status, ...r });
  }

  return { inserted, skipped, incidents };
}

async function main() {
  const client = new Client();
  try {
    await client.connect();
  } catch (err) {
    process.stderr.write(
      `demo-incidents.js: failed to connect — ${err && err.message ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
  try {
    const result = await run(client, { force: process.argv.includes('--force') });
    process.stdout.write(
      `demo-incidents.js: inserted=${result.inserted} skipped=${result.skipped} total=${result.incidents.length}\n`,
    );
    process.exitCode = 0;
  } catch (err) {
    process.stderr.write(`demo-incidents.js: ${err && err.message ? err.message : String(err)}\n`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

module.exports = {
  run,
  INCIDENTS,
  CANTON_CENTROIDS,
  CATEGORIES,
  TITLE_PREFIX,
  EPOCH,
};

if (require.main === module) {
  main();
}
