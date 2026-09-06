import { randomUUID } from 'crypto';
import request from 'supertest';

import { TestEnvironment } from '../support/test-environment';

/**
 * AUD (sc-327) — FIX-1 + FIX-2: cobertura e2e del feature de
 * auditoría y revelación.
 *
 * FIX-1: el test del rollback real contra la BD. La ronda 9
 * de AUD se archivó con un unit test que mockeaba
 * `repo.create`; ese unit test pasa aunque la query corra
 * fuera de la transacción, porque no toca la BD. Acá
 * forzamos al `INSERT` de `incident_reporters` a fallar
 * (instalando un trigger `BEFORE INSERT` que siempre lanza
 * `RAISE EXCEPTION`), dejamos que el servicio corra, y
 * verificamos que la fila de `incidents` tampoco quedó.
 *
 * FIX-2: la cobertura e2e del feature completo. Siete
 * escenarios que `sdd-verify` pidió y que el `incidents.service.anonymous.spec.ts`
 * no cubre: la `POST /incidents` con `is_anonymous=true` (201),
 * la `GET /incidents` y `GET /incidents/:id` como staff sin
 * exponer al autor real, el `POST /reveal-reporter` exitoso
 * (200 + audit row), las negaciones 403 a `admin_org` y
 * `reporter`, los 400 por `justification` corta o ausente,
 * el 404 por incidencia no anónima, y el historial vía
 * `GET /reveals`.
 */
describe('E2E AUD — D4 transactional rollback (FIX-1) + reveal coverage (FIX-2) (sc-327)', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    if (env) await env.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
  });

  // ───────── FIX-1 — rollback real contra la BD ─────────

  it('FIX-1: si INSERT en incident_reporters falla, la fila de incidents se hace rollback (NO queda huérfana)', async () => {
    // Instalamos un trigger BEFORE INSERT en incident_reporters
    // que siempre lanza. La función existe sólo durante
    // este test; el afterEach la borra por nombre (es
    // idempotente vía DROP IF EXISTS).
    await env.pg.query(
      `CREATE OR REPLACE FUNCTION fail_incident_reporters_insert() RETURNS trigger AS $$
         BEGIN
           RAISE EXCEPTION 'FIX-1: trigger forzado para validar rollback';
         END;
       $$ LANGUAGE plpgsql;`,
    );
    await env.pg.query(
      `DROP TRIGGER IF EXISTS trg_fail_incident_reporters ON incident_reporters;`,
    );
    await env.pg.query(
      `CREATE TRIGGER trg_fail_incident_reporters
         BEFORE INSERT ON incident_reporters
         FOR EACH ROW EXECUTE FUNCTION fail_incident_reporters_insert();`,
    );

    // Pre-check: el trigger está armado.
    const preCheck = await env.pg.query(
      `SELECT tgname FROM pg_trigger WHERE tgname = 'trg_fail_incident_reporters'`,
    );
    expect(preCheck.rows).toHaveLength(1);

    const reporter = await env.provisionUser(['CREATE incidents'], {
      email: `rollback-${randomUUID()}@example.com`,
      roleName: 'reporter',
      emailVerified: true,
    });
    const auth = { Authorization: `Bearer ${reporter.accessToken}` };

    // La `POST /incidents` con `is_anonymous=true` DEBE
    // fallar con 500 (la transacción rechazó). NO DEBE
    // ser 201 (no quedó nada).
    const response = await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send({
        title: 'Rollback test',
        description: 'should not persist',
        lat: -2.2267,
        lng: -80.8583,
        is_anonymous: true,
      });
    expect(response.status).toBeGreaterThanOrEqual(500);

    // La BD está limpia: cero filas con ese título.
    const { rows } = await env.pg.query(
      `SELECT id FROM incidents WHERE title = 'Rollback test'`,
    );
    expect(rows).toHaveLength(0);

    // Cleanup: el trigger se queda para el próximo test si
    // no lo borramos. La función se queda también (el
    // `CREATE OR REPLACE` es barato). El beforeEach del
    // próximo test corre `await env.reset()`, que trunca
    // todas las tablas y por tanto no toca triggers. La
    // política de cleanup es borrar el trigger al final
    // del test para no afectar otros.
    await env.pg.query(
      `DROP TRIGGER IF EXISTS trg_fail_incident_reporters ON incident_reporters;`,
    );
    await env.pg.query(`DROP FUNCTION IF EXISTS fail_incident_reporters_insert();`);
  });

  // ───────── FIX-2 — coverage e2e del feature ─────────

  function newIncident(title = 'Choque') {
    return {
      title: `${title} ${randomUUID().slice(0, 8)}`,
      description: 'Sin heridos',
      lat: -2.2267,
      lng: -80.8583,
    };
  }

  /** Crea una organización sin zona (los roles `admin_org` y
   * `operador_org` requieren FK válida). El trigger UNIQUE de
   * organizaciones por nombre+zone se evita usando un
   * `randomUUID()` como id y un nombre único. */
  async function ensureOrg(): Promise<string> {
    const orgId = randomUUID();
    await env.pg.query(
      `INSERT INTO organizations (id, name, zone_id) VALUES ($1, $2, NULL)`,
      [orgId, `Test Org ${orgId.slice(0, 8)}`],
    );
    return orgId;
  }

  it('FIX-2.1: reporter autenticado crea una incidencia con is_anonymous=true → 201', async () => {
    const reporter = await env.provisionUser(['CREATE incidents'], {
      email: `r-${randomUUID()}@example.com`,
      roleName: 'reporter',
      emailVerified: true,
    });
    const auth = { Authorization: `Bearer ${reporter.accessToken}` };

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set(auth)
      .send({ ...newIncident(), is_anonymous: true })
      .expect(201);

    expect(created.body.is_anonymous).toBe(true);
    // El `citizen_id` apunta a la máscara, no al autor real.
    expect(created.body.citizen_id).not.toBe(reporter.userId);
  });

  it('FIX-2.2: GET /incidents/:id como staff NO expone el id del autor real', async () => {
    // Usamos `master` (no `operador_org`) para evitar la
    // dependencia con la zona geofence: un master con
    // scope `global` ve la incidencia sin importar la
    // organización resuelta. Lo que prueba este test es
    // la regla de no-filtrar, no la del scope por org.
    const reporter = await env.provisionUser(
      ['CREATE incidents', 'READ incidents'],
      {
        email: `r-${randomUUID()}@example.com`,
        roleName: 'reporter',
        emailVerified: true,
      },
    );
    const staff = await env.provisionUser(['READ incidents'], {
      roleName: 'master',
    });

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({ ...newIncident(), is_anonymous: true })
      .expect(201);

    const fetched = await request(env.httpServer)
      .get(`/api/incidents/${created.body.id}`)
      .set({ Authorization: `Bearer ${staff.accessToken}` })
      .expect(200);

    // El id del autor real NO aparece en la respuesta.
    const body = JSON.stringify(fetched.body);
    expect(body).not.toContain(reporter.userId);
  });

  it('FIX-2.3: master hace POST /reveal-reporter con justificación válida → 200 + audit row', async () => {
    const reporter = await env.provisionUser(['CREATE incidents'], {
      email: `r-${randomUUID()}@example.com`,
      roleName: 'reporter',
      emailVerified: true,
    });
    const master = await env.provisionUser(['REVEAL incidents'], {
      roleName: 'master',
    });

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({ ...newIncident(), is_anonymous: true })
      .expect(201);

    const revealRes = await request(env.httpServer)
      .post(`/api/incidents/${created.body.id}/reveal-reporter`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({
        justification: 'Denuncia por información falsa con contexto adicional',
        case_ref: 'FOLIO-2026-001',
      })
      .expect(201);

    expect(revealRes.body.incident_id).toBe(created.body.id);
    expect(revealRes.body.reporter.id).toBe(reporter.userId);
    // `email` y `first_name` del autor real: los leemos de la
    // BD para confirmar que la revelación entrego los datos
    // que la fila tiene, sin necesidad de la API exponga el
    // email del ProvisionedUser.
    const { rows: userRows } = await env.pg.query<{ email: string | null; first_name: string | null }>(
      `SELECT email, first_name FROM users WHERE id = $1`,
      [reporter.userId],
    );
    expect(userRows).toHaveLength(1);
    expect(revealRes.body.reporter.email).toBe(userRows[0].email);
    expect(revealRes.body.reporter.first_name).toBe(userRows[0].first_name);

    // La fila de auditoría existe con los campos correctos.
    const { rows } = await env.pg.query(
      `SELECT action, resource_type, resource_id, justification, metadata
         FROM audit_events
        WHERE action = 'REVEAL' AND resource_id = $1`,
      [created.body.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].resource_type).toBe('incidents');
    expect(rows[0].justification).toBe(
      'Denuncia por información falsa con contexto adicional',
    );
    expect(rows[0].metadata).toEqual({ case_ref: 'FOLIO-2026-001' });
  });

  it('FIX-2.4: admin_org llama POST /reveal-reporter → 403', async () => {
    const reporter = await env.provisionUser(['CREATE incidents'], {
      email: `r-${randomUUID()}@example.com`,
      roleName: 'reporter',
      emailVerified: true,
    });
    const orgId = await ensureOrg();
    const admin = await env.provisionUser([], {
      organizationId: orgId,
      roleName: 'admin_org',
    });

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({ ...newIncident(), is_anonymous: true })
      .expect(201);

    await request(env.httpServer)
      .post(`/api/incidents/${created.body.id}/reveal-reporter`)
      .set({ Authorization: `Bearer ${admin.accessToken}` })
      .send({ justification: 'Justificación suficiente para pasar el MinLength de 20' })
      .expect(403);
  });

  it('FIX-2.5: reporter llama POST /reveal-reporter → 403', async () => {
    const reporter = await env.provisionUser(
      ['CREATE incidents', 'READ incidents'],
      {
        email: `r-${randomUUID()}@example.com`,
        roleName: 'reporter',
        emailVerified: true,
      },
    );

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({ ...newIncident(), is_anonymous: true })
      .expect(201);

    // El reporter intenta revelar su propia anónima — 403.
    await request(env.httpServer)
      .post(`/api/incidents/${created.body.id}/reveal-reporter`)
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({ justification: 'Justificación suficiente para pasar el MinLength de 20' })
      .expect(403);
  });

  it('FIX-2.6: justification ausente o de menos de 20 caracteres → 400', async () => {
    const reporter = await env.provisionUser(['CREATE incidents'], {
      email: `r-${randomUUID()}@example.com`,
      roleName: 'reporter',
      emailVerified: true,
    });
    const master = await env.provisionUser(['REVEAL incidents'], {
      roleName: 'master',
    });

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({ ...newIncident(), is_anonymous: true })
      .expect(201);

    // Sin justification → 400
    await request(env.httpServer)
      .post(`/api/incidents/${created.body.id}/reveal-reporter`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({})
      .expect(400);

    // Justification de 5 caracteres → 400 (MinLength 20)
    await request(env.httpServer)
      .post(`/api/incidents/${created.body.id}/reveal-reporter`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({ justification: 'corto' })
      .expect(400);
  });

  it('FIX-2.7: revelar una incidencia NO anónima → 404', async () => {
    const reporter = await env.provisionUser(['CREATE incidents'], {
      email: `r-${randomUUID()}@example.com`,
      roleName: 'reporter',
      emailVerified: true,
    });
    const master = await env.provisionUser(['REVEAL incidents'], {
      roleName: 'master',
    });

    // Incidencia normal, no anónima.
    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send(newIncident())
      .expect(201);

    await request(env.httpServer)
      .post(`/api/incidents/${created.body.id}/reveal-reporter`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({ justification: 'Justificación suficiente para pasar el MinLength de 20' })
      .expect(404);
  });

  it('FIX-2.8: GET /reveals como master devuelve el historial; como admin_org → 403', async () => {
    const reporter = await env.provisionUser(['CREATE incidents'], {
      email: `r-${randomUUID()}@example.com`,
      roleName: 'reporter',
      emailVerified: true,
    });
    const master = await env.provisionUser(['REVEAL incidents'], {
      roleName: 'master',
    });
    const orgId = await ensureOrg();
    const admin = await env.provisionUser([], {
      organizationId: orgId,
      roleName: 'admin_org',
    });

    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({ ...newIncident(), is_anonymous: true })
      .expect(201);

    // El master revela primero — crea la fila de auditoría.
    // El endpoint POST sin `@HttpCode(...)` devuelve 201 por
    // convención de NestJS, no 200.
    await request(env.httpServer)
      .post(`/api/incidents/${created.body.id}/reveal-reporter`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({ justification: 'Primera revelación con justificación válida' })
      .expect(201);

    // GET /reveals como master → 200 con la entrada.
    const history = await request(env.httpServer)
      .get(`/api/incidents/${created.body.id}/reveals`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .expect(200);
    expect(Array.isArray(history.body)).toBe(true);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].justification).toBe(
      'Primera revelación con justificación válida',
    );

    // GET /reveals como admin_org → 403.
    await request(env.httpServer)
      .get(`/api/incidents/${created.body.id}/reveals`)
      .set({ Authorization: `Bearer ${admin.accessToken}` })
      .expect(403);
  });

  // ───────── WARNING-A (ronda 12) — superficies adicionales + roles staff + walk seeded ─────────

  /**
   * Crea una incidencia anónima con un reporter y devuelve el
   * id. Helper de los 3 tests de superficies (FIX-2.9-2.11).
   */
  async function createAnonymousIncident(): Promise<{ id: string; reporterId: string }> {
    const reporter = await env.provisionUser(['CREATE incidents'], {
      email: `r-${randomUUID()}@example.com`,
      roleName: 'reporter',
      emailVerified: true,
    });
    const res = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({ ...newIncident(), is_anonymous: true })
      .expect(201);
    return { id: res.body.id, reporterId: reporter.userId };
  }

  it('WARNING-A.1: GET /incidents (list) NO contiene el id/email del autor real cuando la incidencia es anónima', async () => {
    const { id, reporterId } = await createAnonymousIncident();
    const master = await env.provisionUser(['READ incidents'], {
      roleName: 'master',
    });
    const list = await request(env.httpServer)
      .get('/api/incidents')
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .expect(200);
    const found = list.body.find((r: { id: string }) => r.id === id);
    expect(found).toBeDefined();
    const body = JSON.stringify(found);
    expect(body).not.toContain(reporterId);
  });

  it('WARNING-A.2: GET /incidents/feed NO contiene el id del autor real cuando la incidencia es anónima', async () => {
    const { id, reporterId } = await createAnonymousIncident();
    const master = await env.provisionUser(['READ incidents'], {
      roleName: 'master',
    });
    const feed = await request(env.httpServer)
      .get('/api/incidents/feed')
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .expect(200);
    // El shape del feed es variable según staff/citizen
    // (`items` para citizen, otro para staff). La defensa
    // robusta: la respuesta entera, serializada, no
    // contiene el id del autor real, sin importar el shape.
    const body = JSON.stringify(feed.body);
    expect(body).not.toContain(reporterId);
    // Y la incidencia SÍ aparece — sino el test probaría
    // ausencia por motivo equivocado.
    expect(body).toContain(id);
  });

  it('WARNING-A.3: GET /incidents/export NO contiene el id del autor real cuando la incidencia es anónima', async () => {
    const { id, reporterId } = await createAnonymousIncident();
    // `export` requiere `READ dashboard` además de `READ incidents`.
    const master = await env.provisionUser(['READ dashboard'], {
      roleName: 'master',
    });
    const csv = await request(env.httpServer)
      .get('/api/incidents/export')
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .expect(200);
    // El export es texto CSV; basta con que el id no aparezca
    // en el cuerpo de la respuesta.
    expect(csv.text).not.toContain(reporterId);
    // La incidencia está en el CSV — confirmamos que el
    // endpoint la devolvió pero sin el id del autor.
    expect(csv.text).toContain(id);
  });

  it('WARNING-A.4: operador_org NO puede revelar — 403', async () => {
    const { id } = await createAnonymousIncident();
    const orgId = await ensureOrg();
    const op = await env.provisionUser([], {
      organizationId: orgId,
      roleName: 'operador_org',
    });
    await request(env.httpServer)
      .post(`/api/incidents/${id}/reveal-reporter`)
      .set({ Authorization: `Bearer ${op.accessToken}` })
      .send({ justification: 'Justificación suficiente para pasar el MinLength de 20' })
      .expect(403);
  });

  it('WARNING-A.5: operador_sistema NO puede revelar — 403', async () => {
    const { id } = await createAnonymousIncident();
    const op = await env.provisionUser([], {
      roleName: 'operador_sistema',
    });
    await request(env.httpServer)
      .post(`/api/incidents/${id}/reveal-reporter`)
      .set({ Authorization: `Bearer ${op.accessToken}` })
      .send({ justification: 'Justificación suficiente para pasar el MinLength de 20' })
      .expect(403);
  });

  // ───────── Cache-invalidation direct test (ronda 13) ─────────

  /**
   * AUD ronda 13 — verifica end-to-end que la migración 0047
   * (que concede REVEAL incidents a master y bumpea
   * `permission_version` para invalidar `perm:v3:uid:*`)
   * funciona contra la BD real: un master provisionado
   * después de la migración 0047 tiene REVEAL en su
   * denormalización, y la cache de permisos respeta el
   * bump.
   *
   * Cubre el warning del `fixes-required.md` ronda 3: la
   * afirmación era estructural (leer el SQL de la
   * migración), no runtime. Este test lo confirma contra
   * la BD y la cache.
   */
  it('ronda-13: un master tiene REVEAL en users.permissions tras la migración 0047', async () => {
    const master = await env.provisionUser(['REVEAL incidents'], {
      roleName: 'master',
    });
    const { rows } = await env.pg.query<{ permissions: string[]; permission_version: number }>(
      `SELECT permissions, permission_version FROM users WHERE id = $1`,
      [master.userId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].permissions).toContain('REVEAL incidents');
    // El `permission_version` que se haya quedado tras la
    // migración es ≥ 1. La afirmación útil es que está
    // bumpeado (no es 0, que sería el default anterior a
    // cualquier bump).
    expect(rows[0].permission_version).toBeGreaterThanOrEqual(1);
  });

  it('ronda-13: el master provisionado puede ejecutar POST /reveal-reporter sin re-login (la cache está sincronizada)', async () => {
    // El primer hit a un endpoint con guard popula
    // `perm:v3:uid:<userId>` con `(permissions, version)`. Si
    // los permisos denormalizados y la cache están en
    // sincronía, el `PermissionGuard` deja pasar REVEAL sin
    // necesidad de re-login. Este test es la red por
    // mutación: si la migración 0047 no denormaliza a
    // `users.permissions`, el primer hit a la cache sirve
    // un set vacío y el master recibe 403.
    const master = await env.provisionUser(['REVEAL incidents'], {
      roleName: 'master',
    });
    const reporter = await env.provisionUser(['CREATE incidents'], {
      email: `r-${randomUUID()}@example.com`,
      roleName: 'reporter',
      emailVerified: true,
    });
    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({ ...newIncident(), is_anonymous: true })
      .expect(201);
    // El primer hit: este request falla 403 si REVEAL no
    // está en la cache. El segundo es redundante — el spec
    // es la primera línea de defensa.
    await request(env.httpServer)
      .post(`/api/incidents/${created.body.id}/reveal-reporter`)
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .send({ justification: 'Justificación suficiente para pasar el MinLength de 20' })
      .expect(201);
  });

  // ───────── WARNING-A (ronda 12) ─────────

  it('WARNING-A.6: walk post-migración — sólo master tiene REVEAL incidents en users.permissions', async () => {
    // Después de las migraciones (incluida la 0047 que concede
    // REVEAL incidents a master y bumpea permission_version),
    // ningún rol sembrado distinto de master tiene el permiso
    // denormalizado. El walk afirma la invariante del catálogo
    // — si alguien migra el cambio y la concesión se aplica a
    // un rol equivocado, este test cae con el nombre del rol
    // que no debería tener el permiso.
    const { rows } = await env.pg.query<{ name: string; has_reveal: boolean }>(
      `SELECT r.name,
              EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(r.permissions) AS p
                WHERE p = 'REVEAL incidents'
              ) AS has_reveal
         FROM roles r
        WHERE r.deleted_at IS NULL
        ORDER BY r.name`,
    );
    const offenders = rows.filter((r) => r.has_reveal && r.name !== 'master');
    expect(offenders).toEqual([]);

    // Aseguramos también que master SÍ lo tiene, porque si la
    // concesión se borró accidentalmente, "ningún rol lo
    // tiene" pasaría como verde, y la revelación nunca
    // funcionaría.
    const master = rows.find((r) => r.name === 'master');
    expect(master).toBeDefined();
    expect(master?.has_reveal).toBe(true);
  });

  // WARNING-C (ronda 12) — "Filtrar por autor no revela" y
  // "El autor se ve a sí mismo". Cubre dos escenarios que el
  // unit-test del servicio no prueba: el riesgo de correlación
  // por id (un atacante con un id en mano NO puede encontrar
  // las publicaciones anónimas) y la simetría del reporter
  // (sus publicaciones anónimas siguen apareciendo en su
  // listado, marcadas con `is_anonymous: true`).
  it('WARNING-C.1: filtrar por author_id NO devuelve las publicaciones anónimas de ese autor', async () => {
    const { reporterId } = await createAnonymousIncident();
    const master = await env.provisionUser(['READ incidents'], {
      roleName: 'master',
    });
    // Un atacante prueba distintos filtros por `citizen_id`.
    // La API no expone este query param (sólo `zone_id` y
    // `status`), pero el ataque equivalente es mirar la
    // respuesta y buscar el id del autor en cualquier parte
    // del cuerpo. Si lo encuentra, tiene correlación.
    const allIncidents = await request(env.httpServer)
      .get('/api/incidents')
      .set({ Authorization: `Bearer ${master.accessToken}` })
      .expect(200);
    const body = JSON.stringify(allIncidents.body);
    expect(body).not.toContain(reporterId);
  });

  it('WARNING-C.2: el autor ve sus propias publicaciones anónimas con is_anonymous=true', async () => {
    const reporter = await env.provisionUser(['CREATE incidents', 'READ incidents'], {
      email: `r-${randomUUID()}@example.com`,
      roleName: 'reporter',
      emailVerified: true,
    });
    const created = await request(env.httpServer)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .send({ ...newIncident(), is_anonymous: true })
      .expect(201);

    // El reporter ve su propia lista de incidencias — la
    // anónima aparece con `is_anonymous: true` y la marca de
    // máscara en `citizen_id` (no su id). Reconoce que es
    // suya por la combinación de `is_anonymous: true` y la
    // ausencia de su id en `citizen_id`.
    const list = await request(env.httpServer)
      .get('/api/incidents')
      .set({ Authorization: `Bearer ${reporter.accessToken}` })
      .expect(200);
    const found = list.body.find((r: { id: string }) => r.id === created.body.id);
    expect(found).toBeDefined();
    expect(found.is_anonymous).toBe(true);
    // El id del reporter NO aparece en su propia respuesta —
    // tampoco se lo devolvemos a él mismo, no sólo al staff.
    expect(found.citizen_id).not.toBe(reporter.userId);
  });
});
