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
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
RUN CI=true pnpm install --frozen-lockfile --prod
# dist ahora vive en /app/backend/dist (porque el build stage corre
# desde /app/backend), no en /app/dist.
COPY --from=build /app/backend/dist /app/backend/dist
# 2026-10-18 — security (P7, MINIMAX_BUILDER_SECURITY_IMPLEMENTATION).
# Run as non-root user. node:22-alpine ya trae el usuario `node`
# con uid/gid 1000, así que lo reusamos en vez de crear uno nuevo
# (gid 1000 ya está ocupado por `node`, lo que hacía fallar
# `addgroup`). Después del COPY --from=build los archivos quedan
# owned by root; el `chown -R` los transfiere a `node` para que el
# proceso pueda leer dist/. Defense-in-depth: si el proceso node
# es comprometido, el atacante no hereda privilegios root dentro
# del contenedor (que en docker-compose es prácticamente root en
# el host). Cero costo runtime.
RUN chown -R node:node /app/backend
USER node
EXPOSE 3001
CMD ["node", "dist/src/main.js"]
