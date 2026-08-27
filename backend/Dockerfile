FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
# pnpm trata `backend/` como su propio workspace, por eso los 3 archivos
# viven en `backend/` y no en la raíz. El contexto de build es la raíz del
# repo (ver compose.yaml), por eso el `COPY` los toma desde `backend/`.
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

FROM node:22-alpine AS production
WORKDIR /app
RUN corepack enable
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["node", "dist/src/main.js"]
