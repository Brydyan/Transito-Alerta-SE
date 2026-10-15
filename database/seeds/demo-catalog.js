#!/usr/bin/env node
/**
 * database/seeds/demo-catalog.js
 *
 * Sembrador del catálogo operativo de "CTE - Santa Elena":
 *   - 5 categorías raíz de incidentes
 *   - 13 subcategorías con prioridad por defecto
 *   - 11 departamentos ligados a la organización
 *   - vínculos M:N department_incident_categories (subcategoría ↔ dept)
 *
 * Idempotencia:
 *   - incident_categories: IDs v5 deterministas → ON CONFLICT (id) DO NOTHING.
 *   - departments:         UNIQUE(organization_id, name) →
 *                          ON CONFLICT (organization_id, name) DO NOTHING;
 *                          IDs recuperados vía SELECT después del upsert.
 *   - department_incident_categories: ON CONFLICT (department_id, incident_category_id) DO NOTHING.
 *
 * Seguridad:
 *   - lib/guard.js aborta contra host no-local o NODE_ENV=production
 *     salvo doble override (--force + SEED_ALLOW_PRODUCTION=1).
 *
 * Uso:
 *   node database/seeds/demo-catalog.js
 *   node database/seeds/demo-catalog.js --force   # staging/remoto
 */
'use strict';

try {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../backend/.env') });
} catch (_) {}

const { Client } = require('./lib/deps');
const { enforce } = require('./lib/guard');
const { uuidV5 } = require('./lib/rand');

// Frozen namespace for this seed — distinct from NS_SEED (incidents/demo).
// DO NOT change: regenerating breaks idempotency (ON CONFLICT id).
const NS_CATALOG = 'c3a1e2f0-7b48-5d9e-8c2a-4f1b6d0e3a85';

// ─── Priority mapping (Spanish label → DB value) ────────────────────────────
const PRIORITY = {
  'Crítica': 'critical',
  'Alta':    'high',
  'Media':   'medium',
  'Baja':    'low',
};

// ─── Catalog definition ──────────────────────────────────────────────────────
//
// Each category entry:
//   { name, description, subs: [{ name, description, priority, departments: [] }] }
//
// `departments` lists the department names that intervene in that subcategory
// (M:N link written to department_incident_categories).

const CATALOG = Object.freeze([
  {
    name: 'Siniestros Viales',
    description:
      'Eventos imprevistos derivados de la circulación que comprometen la integridad física o generan daños materiales en la red vial.',
    subs: [
      {
        name: 'Choque simple / Rozamiento',
        description:
          'Impacto leve entre vehículos sin víctimas ni heridos, con afectación material superficial.',
        priority: PRIORITY['Media'],
        departments: ['Cuerpo de Vigilancia (Patrulla de Sector)'],
      },
      {
        name: 'Colisión con heridos o atrapados',
        description:
          'Impacto de gravedad media/alta con personas lesionadas o atrapadas en la estructura vehicular.',
        priority: PRIORITY['Crítica'],
        departments: ['UREV', 'Cuerpo de Vigilancia', 'OIAT'],
      },
      {
        name: 'Atropello / Arrollamiento',
        description:
          'Impacto directo de un móvil contra un peatón en calzada, cruce cebra o acera.',
        priority: PRIORITY['Crítica'],
        departments: ['UREV', 'Cuerpo de Vigilancia', 'OIAT'],
      },
      {
        name: 'Pérdida de carril / Volcamiento',
        description:
          'Despiste con salida de calzada, encunetamiento o vuelco sobre el eje vial.',
        priority: PRIORITY['Alta'],
        departments: ['UREV', 'Cuerpo de Vigilancia'],
      },
    ],
  },
  {
    name: 'Congestión y Movilidad',
    description:
      'Alteraciones o bloqueos en la circulación que generan saturación vehicular, demoras severas o detención del flujo.',
    subs: [
      {
        name: 'Vehículo averiado en vía',
        description:
          'Automotor detenido por falla mecánica o eléctrica obstruyendo carriles de circulación.',
        priority: PRIORITY['Media'],
        departments: ['Cuerpo de Vigilancia'],
      },
      {
        name: 'Cuello de botella / Retorno masivo',
        description:
          'Saturación de alta densidad en puntos críticos por eventos turísticos, feriados o desvíos.',
        priority: PRIORITY['Alta'],
        departments: ['Cuerpo de Vigilancia (Operaciones Viales)'],
      },
    ],
  },
  {
    name: 'Infraestructura y Vías',
    description:
      'Fallas, deterioros o elementos anómalos en el equipamiento físico vial y dispositivos de control de tránsito.',
    subs: [
      {
        name: 'Semáforo apagado / intermitente',
        description:
          'Falla del controlador, falta de energía o rotura de cabezales que anula la regulación automática.',
        priority: PRIORITY['Alta'],
        departments: ['Cuerpo de Vigilancia', 'Ingeniería de Tránsito'],
      },
      {
        name: 'Obstáculo en la calzada',
        description:
          'Presencia de árboles caídos, animales, desprendimiento de arena, rocas o carga derramada.',
        priority: PRIORITY['Alta'],
        departments: ['Cuerpo de Vigilancia', 'Coordinación Externa (MTOP / Bomberos)'],
      },
      {
        name: 'Señalética destruida / vandalizada',
        description:
          'Deterioro, choque o sustracción de paneles verticales regulatorios, preventivos o informativos.',
        priority: PRIORITY['Baja'],
        departments: ['Ingeniería de Tránsito y Señalización'],
      },
    ],
  },
  {
    name: 'Infracciones y Conducta',
    description:
      'Vulneraciones normativas flagrantes y comportamientos de riesgo que amenazan la convivencia y seguridad vial.',
    subs: [
      {
        name: 'Estacionamiento prohibido / Bloqueo',
        description:
          'Ocupación irregular de aceras, rampas de accesibilidad, hidrantes o doble columna.',
        priority: PRIORITY['Media'],
        departments: ['Cuerpo de Vigilancia'],
      },
      {
        name: 'Carreras clandestinas / Velocidad',
        description:
          'Competencias ilegales ("piques") o conducción deliberada por encima del rango moderado.',
        priority: PRIORITY['Alta'],
        departments: ['Cuerpo de Vigilancia (Grupo Operativo)'],
      },
      {
        name: 'Sospecha de embriaguez',
        description:
          'Conducción con maniobras erráticas bajo presunta influencia de alcohol o psicotrópicos.',
        priority: PRIORITY['Alta'],
        departments: ['Cuerpo de Vigilancia'],
      },
    ],
  },
  {
    name: 'Transporte Público',
    description:
      'Irregularidades operativas, contravenciones o riesgos asociados a cooperativas de pasajeros o carga comercial.',
    subs: [
      {
        name: 'Exceso de aforo / Parada indebida',
        description:
          'Embarque y desembarque en zonas no demarcadas o circulación con pasajeros en estribos.',
        priority: PRIORITY['Media'],
        departments: ['Unidad de Control de Transporte Público'],
      },
      {
        name: 'Transporte informal ("pirata")',
        description:
          'Prestación comercial de traslado de personas sin permiso de operación ni título habilitante.',
        priority: PRIORITY['Media'],
        departments: ['Unidad de Control de Transporte', 'Cuerpo de Vigilancia'],
      },
    ],
  },
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function catId(name) {
  return uuidV5(`catalog/cat/${name}`, NS_CATALOG);
}

function subId(catName, subName) {
  return uuidV5(`catalog/sub/${catName}/${subName}`, NS_CATALOG);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run(client, opts = {}) {
  const { force = false } = opts;

  // 1. Resolve org_id for "CTE - Santa Elena".
  const orgRows = await client.query(
    `SELECT id FROM organizations WHERE name = 'CTE - Santa Elena' LIMIT 1`,
  );
  if (orgRows.rowCount === 0) {
    throw new Error(
      'Organization "CTE - Santa Elena" not found. Run migrations (0023) first.',
    );
  }
  const orgId = orgRows.rows[0].id;

  // 2. Insert root categories (parent_id = NULL, priority = NULL).
  let catInserted = 0;
  for (const cat of CATALOG) {
    const id = catId(cat.name);
    const result = await client.query(
      `INSERT INTO incident_categories (id, name, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [id, cat.name, cat.description],
    );
    catInserted += result.rowCount ?? 0;
  }

  // 3. Insert subcategories (parent_id = cat.id).
  let subInserted = 0;
  for (const cat of CATALOG) {
    const parentId = catId(cat.name);
    for (const sub of cat.subs) {
      const id = subId(cat.name, sub.name);
      const result = await client.query(
        `INSERT INTO incident_categories (id, name, description, parent_id, priority)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [id, sub.name, sub.description, parentId, sub.priority],
      );
      subInserted += result.rowCount ?? 0;
    }
  }

  // 4. Collect unique department names across all subcategories.
  const deptNames = [
    ...new Set(CATALOG.flatMap((cat) => cat.subs.flatMap((sub) => sub.departments))),
  ].sort();

  // 5. Insert departments (upsert on unique org+name).
  let deptInserted = 0;
  for (const name of deptNames) {
    const result = await client.query(
      `INSERT INTO departments (name, organization_id)
       VALUES ($1, $2)
       ON CONFLICT (organization_id, name) DO NOTHING`,
      [name, orgId],
    );
    deptInserted += result.rowCount ?? 0;
  }

  // 6. Fetch all dept id→name for the org (covers pre-existing rows too).
  const deptRows = await client.query(
    `SELECT id, name FROM departments WHERE organization_id = $1 AND deleted_at IS NULL`,
    [orgId],
  );
  const deptMap = Object.fromEntries(deptRows.rows.map((r) => [r.name, r.id]));

  // 7. Insert M:N links department_incident_categories.
  let linkInserted = 0;
  for (const cat of CATALOG) {
    for (const sub of cat.subs) {
      const subCatId = subId(cat.name, sub.name);
      for (const deptName of sub.departments) {
        const deptId = deptMap[deptName];
        if (!deptId) {
          console.warn(`  [WARN] Department not found in map: "${deptName}" — skipping link`);
          continue;
        }
        const result = await client.query(
          `INSERT INTO department_incident_categories (department_id, incident_category_id)
           VALUES ($1, $2)
           ON CONFLICT (department_id, incident_category_id) DO NOTHING`,
          [deptId, subCatId],
        );
        linkInserted += result.rowCount ?? 0;
      }
    }
  }

  return { catInserted, subInserted, deptInserted, linkInserted };
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

if (require.main === module) {
  let flags;
  try {
    flags = enforce({ scriptName: 'demo-catalog.js' });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL ||
      `postgres://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'postgres'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'transito_alerta'}`,
  });
  client
    .connect()
    .then(() => run(client, { force: flags.force }))
    .then(({ catInserted, subInserted, deptInserted, linkInserted }) => {
      console.log(
        `demo-catalog: categories=${catInserted} subcategories=${subInserted} departments=${deptInserted} links=${linkInserted}`,
      );
    })
    .catch((err) => {
      console.error('demo-catalog failed:', err);
      process.exit(1);
    })
    .finally(() => client.end());
}

module.exports = { run };
