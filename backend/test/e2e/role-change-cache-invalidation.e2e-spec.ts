import request from 'supertest';

import { RolesService } from '../../src/modules/roles/roles.service';
import { TestEnvironment } from '../support/test-environment';

/**
 * 2026-10-20 — coherencia entre el cache de permisos y el de menús tras un
 * cambio de rol.
 *
 * ## El invariante
 *
 * `AuthContextService.invalidatePermissionCache` (`auth-context.service.ts`
 * :234-240) borra SOLO el espacio `perm:v3:*`. El árbol de menú se cachea
 * aparte, bajo `menu:v1:user:{userId}`, con el MISMO TTL de 1 h
 * (`menus.service.ts:37-38`), y `invalidatePermissionCache` no lo toca.
 *
 * `MenusService` filtra las entradas por el permiso efectivo del usuario, así
 * que su cache depende de `perm:v3:*`. Un solo cache invalidado deja el otro
 * mintiendo: durante hasta una hora el sidebar puede ofrecer un botón cuyo
 * endpoint ya devuelve 403, o esconder uno que sí funciona.
 *
 * Esto importa porque el logout por cambio de rol es un flujo de SEGURIDAD:
 * revocarle un rol a alguien tiene que revocarle también la interfaz.
 *
 * ## Qué NO cubre
 *
 * Cambios aplicados fuera de la aplicación —una migración que edite
 * `roles.permissions` o `users.permissions`— no llaman a nadie, así que ambos
 * caches quedan stale. Eso incluye la 0038, y es la razón de que aplicarla
 * exigiera un `FLUSHALL` manual. Este spec cubre el camino de la app.
 */

describe('E2E — cambio de rol: permisos y menú deben invalidarse juntos', () => {
  let env: TestEnvironment;
  let rolesService: RolesService;

  beforeAll(async () => {
    env = await TestEnvironment.start();
    rolesService = env.app.get(RolesService);
  }, 120_000);

  afterAll(async () => {
    await env?.stop();
  }, 60_000);

  beforeEach(async () => {
    await env.reset();
  });

  /** El usuario con el rol vía el que Warmmj 调用 el cache de permisos. */
  async function warmCaches(userId: string, accessToken: string): Promise<void> {
    await request(env.httpServer)
      .get('/api/auth/me')
      .set({ Authorization: `Bearer ${accessToken}` })
      .expect(200);
    await request(env.httpServer)
      .get('/api/menus/my')
      .set({ Authorization: `Bearer ${accessToken}` })
      .expect(200);
  }

  /**
   * ¿Quedó alguna clave de menú cacheada para este usuario?
   *
   * Se busca en AMBAS bases de Redis (0 = streams, 1 = cache). `MenusService`
   * inyecta `REDIS_CLIENT` de `core.module` (`menus.service.ts:55-56`), que no
   * es el mismo cliente que usa `CacheModule` — y por eso el comentario de
   * `menus.service.ts:30-33` habla de "key space separado". Buscar sólo en la
   * base del cache dio 0 claves con el menú populado, así que la clave vive
   * en otro lado y buscar en una sola base miente.
   */
  async function menuKeysFor(userId: string): Promise<number> {
    const pattern = `menu:v1:user:${userId}`;
    const [onCache, onStreams] = await Promise.all([
      env.redisCache.keys(pattern),
      env.redisStreams.keys(pattern),
    ]);
    return onCache.length + onStreams.length;
  }

  /** Igual para el espacio `perm:v3:*`, por las mismas razones. */
  async function permKeysFor(userId: string): Promise<number> {
    const [onCache, onStreams] = await Promise.all([
      env.redisCache.keys(`perm:v3:*${userId}*`),
      env.redisStreams.keys(`perm:v3:*${userId}*`),
    ]);
    return onCache.length + onStreams.length;
  }

  it('soft-deleting a role clears BOTH perm:v3:* and menu:v1:* for its users', async () => {
    const user = await env.provisionUser(['READ incidents', 'READ dashboard'], {
      roleName: 'operator_org',
    });

    // Dos requests: cada uno puebla su cache.
    await warmCaches(user.userId, user.accessToken);

    expect(await permKeysFor(user.userId)).toBeGreaterThan(0);
    expect(await menuKeysFor(user.userId)).toBeGreaterThan(0);

    // El soft-delete real, por el servicio — no por SQL, para que aplique la
    // misma invalidación que un DELETE /api/roles/:id haría.
    const master = await env.provisionUser(['DELETE roles', 'UPDATE roles'], {
      roleName: 'master',
    });
    const role = await env.pg.query<{ id: string }>(
      `SELECT id FROM roles WHERE name = 'operator_org' AND deleted_at IS NULL`,
    );
    expect(role.rows).toHaveLength(1);

    await rolesService.delete(role.rows[0].id);

    // El cache de permisos SÍ se limpia — `invalidatePermissionCache` lo
    // cubre, y el rol soft-deleted concede nada
    // (`auth-context.service.ts:184-189` pone permissions a []).
    expect(await permKeysFor(user.userId)).toBe(0);

    // El de menús NO: `invalidatePermissionCache` (auth-context.service.ts
    // :234-240) sólo borra `perm:v3:*`. Esta es la aserción que falla.
    expect(await menuKeysFor(user.userId)).toBe(0);

    // Consecuencia observable: el sidebar no debe ofrecer ninguna entrada
    // accionable. NO se afirma `[]` porque los nodos de grupo (INCIDENCIAS,
    // GESTIÓN, CATÁLOGOS) no tienen `requires` en MENU_MAP y sobreviven al
    // filtro por permiso — con el rol revocado el usuario ve el encabezado
    // del grupo y nada dentro, que es exactamente lo que corresponde.
    const menu = await request(env.httpServer)
      .get('/api/menus/my')
      .set({ Authorization: `Bearer ${user.accessToken}` })
      .expect(200);

    const leaves = (menu.body as Array<{ children?: unknown[] }>).flatMap(
      (entry) => entry.children ?? [],
    );
    expect(leaves).toEqual([]);
  });
});