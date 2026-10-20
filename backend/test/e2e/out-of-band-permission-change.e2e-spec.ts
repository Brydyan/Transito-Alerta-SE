import request from 'supertest';

import { TestEnvironment } from '../support/test-environment';

/**
 * 2026-10-20 — ¿qué pasa con los caches cuando el cambio viene de AFUERA de la app?
 *
 * ## El hueco
 *
 * `perm:v3:*` y `menu:v1:*` tienen TTL de 1 h y sólo se invalidan cuando la
 * APLICACIÓN lo pide (`AuthContextService.invalidatePermissionCache`). Una
 * migración que hace `UPDATE users SET permissions = ...` —como la 0038— no
 * llama a nadie: la fila cambia en la DB y el Redis sigue con el snapshot
 * viejo durante hasta una hora.
 *
 * Por eso aplicar la 0038 en staging hubo que hacer `FLUSHALL` a mano.
 *
 * ## La dirección que importa
 *
 * La ventana es simétrica, pero sólo una es riesgo: revocar. Si una migración
 * (o un DBA, o un script de arranque) quita un permiso, el usuario conserva
 * el acceso hasta el TTL. granting lo contrario sólo causa un 403 tardío.
 *
 * ## Sobre el diseño original
 *
 * `roles.service.ts:45-47` describe que `permission_version` existe "so a stale
 * cached Redis blob can be told apart from a fresh one", y las migraciones
 * 0026/0027/0028/0037 bumpean `permission_version` con el comentario de que
 * eso invalida `perm:v3:*`. **Nunca se implementó**: la clave es
 * `perm:v3:uid:{userId}` (`auth-context.service.ts:136`), sin `pv`. grep de
 * `permissionVersion` en `backend/src` devuelve sólo el lugar que lo bumpea.
 *
 * Este spec caracteriza la ventana. Si algún día se implementa la clave con
 * `pv`, esta aserción pasa a ser la que falla — y eso es lo correcto: el
 * cambio llega con su propio test.
 */

describe('E2E — cambios de permisos fuera de la aplicación', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await TestEnvironment.start();
  }, 120_000);

  afterAll(async () => {
    await env?.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
  });

  it('un permiso REVOCADO por SQL sigue sirviéndose desde caché hasta el TTL', async () => {
    const user = await env.provisionUser(['READ incidents', 'READ dashboard'], {
      roleName: 'operator_org',
    });

    // 1. Calentar caché.
    const before = await request(env.httpServer)
      .get('/api/menus/my')
      .set({ Authorization: `Bearer ${user.accessToken}` })
      .expect(200);
    expect(JSON.stringify(before.body)).toContain('Lista de Incidencias');

    // 2. Revocar `READ incidents` por SQL — el mismo camino que una migración.
    //    No hay `invalidatePermissionCache` en este flujo: nadie lo llama.
    await env.pg.query(`UPDATE users SET permissions = '[]'::jsonb WHERE id = $1`, [
      user.userId,
    ]);

    // 3. Lo que el usuario sigue viendo.
    const after = await request(env.httpServer)
      .get('/api/menus/my')
      .set({ Authorization: `Bearer ${user.accessToken}` })
      .expect(200);

    // CARACTERIZA LA VENTANA, no la afirma como deseado: hoy el menú sale
    // idéntico porque `menu:v1:*` sigue cacheado.
    expect(JSON.stringify(after.body)).toBe(JSON.stringify(before.body));

    // Y el endpoint protegido tampoco cambia de respuesta, por el mismo motivo.
    const incidents = await request(env.httpServer)
      .get('/api/incidents')
      .set({ Authorization: `Bearer ${user.accessToken}` });
    expect(incidents.status).toBe(200); // debería ser 403 con `permissions = []`
  });

  it('PERO si bumpea permission_version, el cambio se refleja al instante', async () => {
    // Esto es lo que arregla la clave con `pv` (`perm:v3:uid:{id}:pv{n}`).
    // Cualquier cosa que bumpee el valor produce una clave distinta, así que
    // la siguiente request resuelve contra la DB sin esperar el TTL.
    //
    // Es la forma en que `RolesService.assignRole/update/delete` ya revocan
    // permisos: bumpean `permission_version` Y llaman a
    // `invalidatePermissionCache`. Con `pv` en la clave, el segundo paso pasa
    // a ser redundante — si algo bumpea y olvida purgar, el sistema se
    // recupera igual.
    const user = await env.provisionUser(['READ incidents'], {
      roleName: 'operator_org',
    });

    await request(env.httpServer)
      .get('/api/incidents')
      .set({ Authorization: `Bearer ${user.accessToken}` })
      .expect(200);

    await env.pg.query(
      `UPDATE users SET permissions = '[]'::jsonb, permission_version = permission_version + 1
        WHERE id = $1`,
      [user.userId],
    );

    // Sin FLUSHALL, sin esperar el TTL, sin llamar a invalidatePermissionCache.
    await request(env.httpServer)
      .get('/api/incidents')
      .set({ Authorization: `Bearer ${user.accessToken}` })
      .expect(403);
  });

  it('tras expirar la caché, el cambio por SQL sí se refleja', async () => {
    const user = await env.provisionUser(['READ incidents', 'READ dashboard'], {
      roleName: 'operator_org',
    });

    await request(env.httpServer)
      .get('/api/menus/my')
      .set({ Authorization: `Bearer ${user.accessToken}` })
      .expect(200);

    await env.pg.query(`UPDATE users SET permissions = '[]'::jsonb WHERE id = $1`, [
      user.userId,
    ]);

    // Simular el paso del TTL borrando las claves a mano — lo que el operador
    // hace con FLUSHALL después de aplicar una migración. La clave de
    // permisos lleva el sufijo `:pv{n}` desde el 2026-10-20; sin él el borrado
    // es un no-op silencioso.
    const pv = await env.pg.query<{ permission_version: number | null }>(
      `SELECT permission_version FROM users WHERE id = $1`,
      [user.userId],
    );
    const suffix = pv.rows[0].permission_version ?? 1;
    await env.redisCache.del(`perm:v3:uid:${user.userId}:pv${suffix}`);
    await env.redisCache.del(`menu:v1:user:${user.userId}`);

    const incidents = await request(env.httpServer)
      .get('/api/incidents')
      .set({ Authorization: `Bearer ${user.accessToken}` })
      .expect(403);

    expect(incidents.status).toBe(403);
  });
});