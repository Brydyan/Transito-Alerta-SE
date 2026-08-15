# CI y control de merges

## Estrategia de ramas

```
feature/*  ──PR──>  develop  ──PR──>  main
```

Nadie escribe directo en `develop` ni en `main`. Todo entra por PR.

---

## Workflows

### `.github/workflows/ci.yml`

Corre en cada PR hacia `develop` o `main`, y en cada push a esas ramas.

**Job `backend`** — `lint` → `typecheck` → `build` → `test`.
Instala con `--frozen-lockfile`: si el lockfile no coincide con
`package.json`, falla en vez de resolver versiones distintas en silencio.
La versión de pnpm sale de `packageManager` en `backend/package.json`, así
que CI y las máquinas del equipo no pueden divergir.

**Job `migrations`** — aplica cada `database/migrations/*.sql` en orden
numérico contra un PostGIS limpio, y después verifica el esquema resultante.

Este job existe por una razón concreta: las migraciones se aplican **a mano**
en Supabase (CC3). Nada las ejecuta automáticamente, así que sin esto un
archivo roto se descubre pegándolo en el editor SQL de producción. El job
falla si:

- una migración no aplica sobre una base vacía
- `geo_zones.polygon` no es `MULTIPOLYGON`
- el seed de Santa Elena no quedó, o alguna geometría es inválida
- un punto dentro de Santa Elena no matchea, o uno de Quito sí — **esto es lo
  que detecta un `lat`/`lng` invertido**, que no falla en ningún otro lado
- el techo del anónimo gana un `UPDATE`, `DELETE` o `ASSIGN`
- falta el `.DOWN.sql` de alguna migración
- alguna migración no está registrada en `MIGRATION_LOG.md`

### `.github/workflows/auto-redirect-pr.yml`

Reapunta a `develop` los PR abiertos contra `main`. Es una **conveniencia, no
un control**: reacciona a `opened`, `reopened` y `edited`, pero nada impide
que alguien con permisos mergee igual.

Lo que de verdad bloquea es la protección de rama. Va abajo.

---

## Protección de ramas — falta configurarla

⚠️ **Esto no vive en un archivo del repo.** Son ajustes de GitHub y requieren
permiso de admin. Sin esto, los workflows de arriba informan pero no impiden
nada.

Con `gh` autenticado:

```bash
# main — solo recibe PRs desde develop, con CI en verde y una aprobación
gh api -X PUT repos/:owner/:repo/branches/main/protection \
  -F required_status_checks[strict]=true \
  -F 'required_status_checks[contexts][]=Backend — lint, typecheck, build, test' \
  -F 'required_status_checks[contexts][]=Migrations — apply to a clean PostGIS database' \
  -F enforce_admins=true \
  -F required_pull_request_reviews[required_approving_review_count]=1 \
  -F required_pull_request_reviews[dismiss_stale_reviews]=true \
  -F restrictions=null \
  -F allow_force_pushes=false \
  -F allow_deletions=false

# develop — mismo CI, sin exigir aprobación (equipo chico, iteración rápida)
gh api -X PUT repos/:owner/:repo/branches/develop/protection \
  -F required_status_checks[strict]=true \
  -F 'required_status_checks[contexts][]=Backend — lint, typecheck, build, test' \
  -F 'required_status_checks[contexts][]=Migrations — apply to a clean PostGIS database' \
  -F enforce_admins=false \
  -F required_pull_request_reviews=null \
  -F restrictions=null \
  -F allow_force_pushes=false \
  -F allow_deletions=false
```

O por la interfaz: **Settings → Branches → Add branch protection rule**.

`enforce_admins=true` en `main` es deliberado. Si los admins pueden saltarse
la regla, la regla es una sugerencia — y en una app de emergencias el que
saltea suele ser el que va apurado.

Los nombres en `contexts` deben coincidir **exactamente** con el `name:` de
cada job en `ci.yml`. Si los cambiás allá, cambialos acá.

---

## Correr lo mismo localmente antes de abrir el PR

```bash
cd backend
pnpm install --frozen-lockfile
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm test
```

Migraciones contra una base limpia:

```bash
docker compose down -v && docker compose up -d postgres
for f in database/migrations/[0-9]*.sql; do
  docker exec -i tase-postgres psql -U postgres -d transito_alerta \
    -v ON_ERROR_STOP=1 -q < "$f" || break
done
```

---

## Lo que el CI todavía NO cubre

- **Tests de integración.** La suite es unitaria. Cinco defectos de esta
  migración pasaron con la suite en verde porque el test mockeaba justo la
  costura donde vivía el bug — dos incluso *afirmaban* el comportamiento
  roto. Es T4.1 y es el hueco más importante que queda.
- **Frontend.** No hay job; se agrega cuando exista el proyecto Angular.
- **Cobertura.** `pnpm run test:cov` existe pero no hay umbral que falle.
- **Deploy.** Nada despliega. A definir cuando haya destino.
- **`test:e2e`.** El script existe pero `test/jest-e2e.json` no.
