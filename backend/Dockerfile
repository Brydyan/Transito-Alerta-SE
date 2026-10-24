FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
# pnpm trata `backend/` como su propio workspace, por eso los 3 archivos
# viven en `backend/` y no en la raíz. El contexto de build es la raíz del
# repo (ver compose.yaml), por eso el `COPY` los toma desde `backend/`.
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
RUN CI=true pnpm install --frozen-lockfile

FROM node:22-alpine AS build
# pnpm necesita que package.json esté en el CWD. Como vive en backend/
# (no en la raíz del repo), corremos el build desde /app/backend para
# que `pnpm run build` encuentre /app/backend/package.json. Esto evita
# el error "No package.json found in /app" que daba con WORKDIR=/app.
WORKDIR /app/backend
RUN corepack enable
# node_modules del stage deps va a la ubicación que pnpm espera relativo
# a WORKDIR (no a la raíz del WORKDIR anterior).
COPY --from=deps /app/node_modules /app/backend/node_modules
# Copia el resto de backend/ (filtrado por backend/.dockerignore: sin
# node_modules, dist, *.spec.ts, etc.). Trae src/, scripts/, tsconfig,
# nest-cli.json, etc. a /app/backend/.
COPY backend/ /app/backend/
# scripts/rebuild-feed.ts importa '../../database/seeds/lib/guard' — con
# WORKDIR=/app/backend eso resuelve a /app/database/seeds/lib/guard, así
# que hay que traer esos archivos. El resto de database/ no se incluye
# (ver .dockerignore en la raíz).
COPY database/seeds/lib /app/database/seeds/lib
RUN CI=true pnpm run build

FROM node:22-alpine AS production
WORKDIR /app/backend
RUN corepack enable
COPY --chown=node:node backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./

# 2026-10-20 — el `chown -R node:node /app/backend` que cerraba este stage
# costaba 25 MINUTOS de los 26 del build: recorría `node_modules` entero
# (cientos de miles de archivos) escribiendo un cambio por archivo. El
# context de Docker es la raíz del repo y el `data-root` vive en un
# virtiofs, donde `dd` mide 62 MB/s contra 1,2 GB/s del disco local — 19x
# menos. El patrón es O(archivos) y el disco amplifica cada archivo.
#
# Lo que hace esto en su lugar, todo O(1) o integrado en una sola pasada
# de E/S que ya estaba haciendo el COPY:
#
#   1. `chown node:node /app/backend` sin `-R`: un solo inode, el
#      directorio. Da a `node` permiso de escritura ahí.
#   2. `pnpm install` corre como `node`, así que lo crea con el dueño
#      correcto desde el principio. Nada que corregir después.
#   3. El `dist` llega con `--chown`, que es parte de la copia.
#
# El resultado es idéntico — el proceso sigue corriendo como `node`, sin
# privilegios — pero el build pasa de 26 minutos a menos de 4.
RUN chown node:node /app/backend
USER node
RUN CI=true pnpm install --frozen-lockfile --prod
# dist ahora vive en /app/backend/dist (porque el build stage corre
# desde /app/backend), no en /app/dist.
COPY --from=build --chown=node:node /app/backend/dist /app/backend/dist
EXPOSE 3001
CMD ["node", "dist/src/main.js"]
