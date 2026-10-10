# sc-411 — AuthUserRepository (Slice A de la descomposición de `auth/`)

> Objetivo: empezar a descomponer `backend/src/modules/auth/` (34 archivos,
> 4909 líneas) sacando el **acceso a datos** fuera de `auth.service.ts`
> (713 líneas, 10 dependencias, 14 métodos, 5 responsabilidades mezcladas:
> acceso a datos, permisos+caché Redis, identidad/sesión/JWT, password y
> wire de `/auth/me`).
>
> Slice A = "repository primero": extraer `AuthUserRepository` sin cambiar
> comportamiento. Slices B y C quedan para después.

## Estado: Slice A completo (rama `carlos_fp/sc-411/refactorauth-extract-authuserrepo`, base `origin/develop` b4d1271)

- `df39159` refactor(auth): extract AuthUserRepository from AuthService

## Contexto y decisiones

- **Diagnóstico** (Engram `architecture/auth-module-decomposition`): la
  cantidad de archivos NO es el problema (14 specs + 10 DTOs son legítimos).
  El problema es `auth.service.ts`, que mezcla 5 responsabilidades.
- **Base de rama**: sale de `origin/develop` (b4d1271, todavía con `common/`),
  NO stackeada sobre sc-410. Verificado seguro: `auth/` no referencia
  `core/`/`infra/`, y el archivo nuevo solo importa `../../entities/` → no
  agrega referencias nuevas a `common/`/`shared/`; el merge 3-way con #110
  resuelve limpio en ambos órdenes.
- **Ubicación**: el repository vive en `auth/` (no en `UsersModule`) porque
  la dependencia `Users -> Auth` ya existe en sentido inverso; importar
  `UsersModule` crearía un ciclo duro.
- **Patrón**: mismo que `PasswordResetRepository` / `PasswordResetService`
  (raw `@InjectDataSource` SQL donde hay join, `Repository<UserEntity>` para
  CRUD plano).
- **Estrategia de specs**: construir el repository REAL sobre las primitivas
  mockeadas (`new AuthUserRepository(userRepo, dataSource)`) → amplifica
  cobertura y las assertions existentes siguen valiendo (el repo delegá en
  las mismas primitivas). Solo cambian los 5 sitios de construcción.
- **Invariante (design D1)**: el describe block `login` de
  `auth.service.spec.ts` queda **byte-for-byte** sin tocar (regression gate
  del path de login).

## Checklist

- [x] **A1** — Crear `auth-user.repository.ts`: `AuthContextRow` (exportada) +
      `AuthUserRepository` (`@Injectable`) con `findByDeviceUuid`,
      `createDeviceIdentity`, `findByEmail`, `findById`, `updatePasswordHash`,
      `findAuthContextRow` (SQL `users`+`roles` movido verbatim, con sus
      comentarios T6.8.B3 / T7.2.C4).
- [x] **A2** — Refactor `auth.service.ts`: quitar imports
      `InjectDataSource`/`InjectRepository` y `DataSource`/`Repository`;
      agregar import del repository; borrar la interface `AuthContextRow`;
      constructor arg1 `userRepo`→`authUserRepo: AuthUserRepository` y quitar
      el arg `dataSource`; delegar en `login`, `loginWithPassword`,
      `changePassword`, `getMe`, `getPermissions`, `getAuthContextByUserId`.
      `UserEntity` sigue usándose en `issueSession`.
- [x] **A3** — `auth.module.ts`: import + provider `AuthUserRepository`.
- [x] **A4** — Migrar los 5 sitios de specs a `new AuthUserRepository(...)`:
      `auth.service.spec.ts` (~ln 104/552/585/801) + `auth.service.password.spec.ts`
      (ln ~90); import en ambos.

## Gates (verificados)

- `tsc --noEmit` (desde `backend/`) → exit 0.
- `jest src/modules/auth` → 12 suites / 133 tests verdes.
- Suite completa → **127 suites / 1340 passed / 11 skipped** (igual al
  baseline pristino). `image-compression.integration.spec.ts` falló en la 1ª
  corrida (caché fría/~126s) pero pasa aislado (8/8) y la suite completa
  re-corrida (caché caliente) pasa → flaky/por carga; el spec usa
  `new ImageCompressionService()` sin DI, no lo afecta este cambio.
- `eslint --fix` sobre los archivos tocados → exit 0 sin cambios.
- **DI verificado por precedente**: `AuthUserRepository` usa exactamente
  `@InjectRepository(UserEntity)` + `@InjectDataSource()`, el mismo par que
  ya usan `PasswordResetService`, `EmailVerificationService` y
  `auth.register` dentro del mismo `AuthModule` (que provee
  `TypeOrmModule.forFeature([UserEntity, RoleEntity])` + `DataSource` global).
  El e2e (`health.e2e-spec.ts`, que bootea el AppModule real) NO pudo correr:
  el entorno usa **podman** y el `globalSetup` de testcontainers falla por el
  streaming de logs. Pendiente correrlo en un entorno con Docker real:
  `pnpm test:e2e -- health.e2e-spec.ts`.

## Fuera de alcance (siguientes slices)

- **Slice B** — `auth-context.service.ts`: permisos + caché Redis (mover
  `getPermissions`/`getAuthContextByUserId`); consumidores a revisar:
  `jwt.strategy.ts`, `realtime/events.gateway.ts`, `roles.service.ts`,
  `menus.service.ts`.
- **Slice C** — quitar las dependencias OPCIONALES (`permissionLookup?`,
  `passwordHasher?`) y alinear las specs.
- NO tocar `auth.register.ts` ni el flujo de `changePassword`.

## Estrategia

- Commits aislados en esta rama, Conventional Commits.
- PR ≤400 líneas contra `develop` (stacked-to-main / chained-pr).
- Failure & learning → Engram (topic `architecture/auth-module-decomposition`).
