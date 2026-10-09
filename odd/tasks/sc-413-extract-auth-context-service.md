# sc-413 — AuthContextService (Slice B de la descomposición de `auth/`)

> Objetivo: continuar la descomposición de `backend/src/modules/auth/`.
> Slice B saca de `auth.service.ts` la **resolución de permisos + la caché
> Redis** (`perm:v3:`) hacia `AuthContextService`. `AuthService` queda como
> **fachada**: conserva su API pública (los 4 métodos) delegando, así los
> consumidores no cambian.
>
> Slice A (sc-411) extrajo el acceso a datos (`AuthUserRepository`). Este es
> el 2º de 3 slices; la rama se **stackea sobre la de Slice A** porque toca
> los mismos archivos (`auth.service.ts`, `auth.module.ts`, specs).

## Estado: Slice B completo (rama `carlos_fp/sc-413/refactorauth-extract-authcontexts`, base = rama de sc-411)

- `0f16fe2` refactor(auth): extract AuthContextService from AuthService

## Contexto y decisiones

- **Borde del slice**: mover las 4 responsabilidades de permisos/caché
  (`getPermissions` device-keyed, `getPermissionsByUserId`, el grueso de
  `getAuthContextByUserId` uid-keyed, `invalidatePermissionCache`) + la
  constante `PERMISSION_CACHE_PREFIX` + el tipo `CachedAuthContext`.
- **Fachada, no reescritura de consumidores**: `invalidatePermissionCache`
  tiene **8 llamadas de producción** (`roles.service.ts` x5, `users.service.ts`
  x3) y `getAuthContextByUserId` otras 2 (`jwt.strategy.ts`,
  `realtime/events.gateway.ts`). Reescribir esos consumidores inflaba el
  blast radius; mantener los métodos en `AuthService` como delegados deja el
  radio en `auth/`.
- **Truco de constructor**: `authContext: AuthContextService` ocupa la
  **posición 3, donde estaba `cache`** ⇒ la aridad y las posiciones 4-9 no
  cambian; los specs solo intercambian el mock por una instancia real de
  `AuthContextService` construida con el **mismo** mock de caché y el mismo
  `AuthUserRepository`.
- **DI del nuevo provider**: `AuthContextService` depende de
  `CACHE_MANAGER` (global), `ConfigService` (global) y `AuthUserRepository`
  (ya provisto en `AuthModule`) → mismo patrón que el resto del módulo.
- **`getPermissionNames` / `permissionLookup?`**: NO se mueven (concern de
  catálogo UUID↔"ACTION resource", no de resolución de permisos). Quedan en
  `AuthService` → son Slice C. Dato: `auth.controller` (ln ~197) usa
  `permissions` directo, así que `getPermissionNames` parece no tener uso de
  producción hoy.

## Checklist

- [x] **B1** — Crear `auth-context.service.ts`: `PERMISSION_CACHE_PREFIX`
      (movida verbatim con su doc R4), `CachedAuthContext` (privada),
      `AuthContextService` (`@Injectable`; deps `@Inject(CACHE_MANAGER) cache`,
      `ConfigService`, `AuthUserRepository`) con `getPermissions`,
      `getPermissionsByUserId`, `getAuthContextByUserId` e
      `invalidatePermissionCache` (cuerpos verbatim, con sus comentarios de
      invariantes: no cachear misses, rama anónima uid-keyed, R7.5
      `role_deleted_at`, T3.6 D8 `deviceUuid: null`).
- [x] **B2** — `auth.service.ts`: quitar imports `Inject`/`CACHE_MANAGER`/
      `Cache`/`resolveSubjectScope`; agregar `AuthContextService`; borrar
      `PERMISSION_CACHE_PREFIX` y `CachedAuthContext`; constructor arg3
      `cache`→`authContext`; los 4 métodos pasan a delegados. `getMe` sigue
      resolviendo `permissionStrings` con `permissionLookup` (sin cambios).
- [x] **B3** — `auth.module.ts`: import + provider `AuthContextService`.
- [x] **B4** — Migrar los 5 sitios de construcción de `AuthService`:
      `auth.service.spec.ts` (4) + `auth.service.password.spec.ts` (1). El
      import de `PERMISSION_CACHE_PREFIX` en `auth.service.spec.ts` pasa a
      `./auth-context.service`.

## Gates (verificados)

- `tsc --noEmit` (desde `backend/`) → exit 0.
- `jest src/modules/auth` → 12 suites / 133 tests verdes (idéntico a Slice A).
- Suite completa → **127 suites / 1340 passed / 11 skipped** (baseline intacto).
- `eslint` sobre los 5 archivos tocados → exit 0.
- **Cobertura de la mudanza**: los describes
  `AuthService.getAuthContextByUserId` / `getPermissionsByUserId` /
  `invalidatePermissionCache` de `auth.service.spec.ts` ahora ejercen la
  lógica **movida** a través de la fachada (mismo mock de caché) → la
  extracción queda cubierta sin tests nuevos.

## Fuera de alcance (siguientes slices)

- **Slice C** — quitar las dependencias OPCIONALES (`permissionLookup?`,
  `passwordHasher?`) y alinear las specs; decidir el destino de
  `getPermissionNames` (¿mover al contexto o eliminar por no uso?).
- Consumidores finales (`jwt.strategy`, `menus`, `roles`, `users`) siguen
  usando `AuthService`; migrarlos a `AuthContextService` directo es opcional
  y posterior.
- NO tocar `auth.register.ts` ni el flujo de `changePassword`.

## Estrategia

- Stacked PR: esta rama sale de la de sc-411; el PR apunta a esa rama
  (no a `develop`) hasta que Slice A mergee, luego se retargetea.
- Conventional Commits, sin atribución de IA. PR ≤400 líneas.
- Failure & learning → Engram (topic `architecture/auth-module-decomposition`).
