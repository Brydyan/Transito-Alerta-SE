# Frontend Angular → nginx, multi-stage.
#
# Antes de esto el servicio `frontend` de compose.yaml era `image: nginx:alpine`
# con `./frontend/dist/browser` montado como volumen. Nadie construía ese
# directorio en el deploy: el workflow corre `docker compose up --build`, y
# `--build` sólo construye servicios que declaran `build:`. El resultado fue
# que staging sirvió durante días un build hecho a mano el 29 de agosto, y
# ningún merge a develop cambiaba lo que veía el usuario.
#
# Con la imagen, el artefacto queda dentro y versionado por IMAGE_TAG (el sha
# del commit), así que un rollback es levantar un tag anterior en vez de
# reconstruir desde un commit viejo. Además la VM ya no necesita node ni pnpm
# instalados — no los tiene, y por eso el build manual tampoco era una salida.
#
# Contexto de build: `./frontend`, no la raíz. El .dockerignore de la raíz
# excluye `frontend/` a propósito (está afinado para el backend, que sí
# necesita context: .), y un contexto propio evita tener que tocarlo.

# ── deps ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
# pnpm-workspace.yaml va incluido: frontend/ es su propio workspace, igual
# que backend/. Sin él, pnpm resuelve hacia arriba y no encuentra el lock.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN CI=true pnpm install --frozen-lockfile

# ── build ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `ng build` escribe en dist/ y Angular emite el bundle del navegador en
# dist/browser (outputPath: "dist" en angular.json).
RUN CI=true pnpm run build

# ── production ──────────────────────────────────────────────────────────
FROM nginx:alpine AS production
# nginx.conf sigue viniendo de un montaje en compose.yaml — es configuración
# de despliegue, no artefacto de build, y así se ajusta sin reconstruir.
COPY --from=build /app/dist/browser /usr/share/nginx/html
EXPOSE 80
