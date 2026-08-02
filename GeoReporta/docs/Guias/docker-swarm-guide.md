# Guía de Docker Swarm — Sistema de Incidencias Georreferenciadas

Setup real: **un solo nodo** (el mismo VPS que corre el self-hosted runner de
GitHub Actions). Swarm se usa acá por las réplicas de `frontend`/`backend` y
el rolling update sin downtime — no por clustering multi-máquina.

## Qué necesitás

- Docker Engine con soporte Swarm (cualquier versión moderna lo trae, no
  hace falta instalar nada aparte — a diferencia de Compose, Swarm es un
  modo del propio engine).
- El archivo `.env` en la raíz del proyecto, con estas variables como
  mínimo (`deploy.yml` las marca obligatorias con `:?`, así que si falta
  alguna, `docker compose config` va a fallar explícitamente en vez de
  desplegar con un valor vacío):
  - `DB_PASSWORD`
  - `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` (credenciales de RustFS)
  - `CLOUDFLARE_TUNNEL_TOKEN`
- `backend/.env` con los secretos de Laravel/Swoole (`APP_KEY`, JWT,
  Firebase, etc. — igual que hoy con Compose, no cambia).
- Swarm mode **activado una sola vez** en la máquina (ver abajo). Esto no se
  hace automático en cada deploy — es un bootstrap de una vez, no una
  acción de rutina.

## Bootstrap inicial (una sola vez, manual)

```bash
docker swarm init
```

Si el servidor tiene varias interfaces de red y Docker no puede elegir la
IP de management sola, especificala:

```bash
docker swarm init --advertise-addr <IP-del-servidor>
```

Verificar que quedó activo:

```bash
docker info --format '{{.Swarm.LocalNodeState}}'
# → active
```

Esto es exactamente lo que el CI (`.github/workflows/deploy.yml`) chequea
antes de desplegar — si no está activo, el workflow falla con un mensaje
claro en vez de intentar auto-inicializar el cluster por vos.

## Cómo se despliega ahora (flujo real, vía CI)

1. `docker compose -f deploy.yml build` — construye `frontend`/`backend`
   localmente usando la sección `build:` de `deploy.yml` (Swarm la ignora,
   pero Compose sí la usa para armar la imagen con el tag correcto).
2. Exportar el `.env` al shell y desplegar el `deploy.yml` original, sin
   renderizar:
   ```bash
   set -a
   source .env
   set +a
   docker stack deploy -c deploy.yml incidencias-stack
   ```
   `docker stack deploy` no lee `.env` solo (feature exclusiva de
   Compose), pero sí interpola `${VAR}` contra el entorno del proceso —
   por eso el `source .env` antes.

   **No uses `docker compose -f deploy.yml config > archivo.yml` para
   pre-renderizar.** Ese round-trip reescribe `cpus: "0.5"` como float sin
   comillas y expande los `ports:` en formato corto a long-form con
   `published` tipado como string — `docker stack deploy` rechaza ambos
   con errores tipo `must be a string` / `must be a integer`. Es un choque
   conocido entre el parser de Compose y el de Swarm; desplegar el archivo
   tal cual, con las vars ya exportadas al shell, lo evita.

Podés correr esos mismos comandos a mano en el servidor si necesitás
desplegar fuera del CI.

## Comandos que vas a usar seguido

| Qué querés hacer | Comando |
|---|---|
| Ver todos los services del stack y cuántas réplicas están arriba | `docker stack services incidencias-stack` |
| Ver las tasks (containers) de un service puntual | `docker service ps incidencias-stack_backend` |
| Ver por qué una task falló (razón completa, sin truncar) | `docker service ps --no-trunc incidencias-stack_backend` |
| Logs de un service (todas las réplicas mezcladas) | `docker service logs -f incidencias-stack_backend` |
| Escalar manualmente sin editar el archivo | `docker service scale incidencias-stack_backend=3` |
| Forzar redeploy de un service (por ejemplo tras cambiar una env var) | `docker service update --force incidencias-stack_backend` |
| Actualizar solo la imagen de un service | `docker service update --image ghcr.io/sistema-incidencias/backend:latest incidencias-stack_backend` |
| Ver el estado general del cluster (nodos) | `docker node ls` |
| Bajar el stack completo | `docker stack rm incidencias-stack` |
| Ver la config ya resuelta sin desplegar (debug de variables) | `docker compose -f deploy.yml config` |

## Dashboard (Portainer)

`deploy.yml` incluye `portainer` — UI web para ver/escalar/loguear services
sin CLI. Corre pineado al nodo manager (`placement.constraints:
node.role == manager`, sin efecto real en single-node, pero correcto si
algún día se suma un worker).

- Acceso: `https://<host>:9443` (cert autofirmado, el browser va a avisar).
  También queda `9010` como puerto HTTP legacy (`PORTAINER_HTTP_PORT`), no
  el `9000` default de Portainer — ese ya lo usa `rustfs` en este stack.
- **Primer arranque:** Portainer da una ventana corta (unos minutos) para
  crear el usuario admin desde la UI. Si se pasa el tiempo, queda bloqueado
  y hay que reiniciar el container (`docker service update --force
  incidencias-stack_portainer`) para reabrir la ventana.
- Nota de seguridad: monta `/var/run/docker.sock` — quien tenga acceso a
  Portainer tiene control total del Docker engine (equivalente a root en
  el host). Ponele una contraseña de admin fuerte apenas levante, y no lo
  expongas a internet sin algo delante (Cloudflare Access, VPN, etc.).

## Diferencias con lo que ya conocés de `docker compose`

- `depends_on` **no espera health checks** en Swarm — a diferencia de
  Compose con `condition: service_healthy`. Si el orden de arranque
  importa, la app tiene que tolerar reintentar la conexión a DB/Redis
  sola (ver `docs/docker-swarm-scaling-plan.md`, sección 5).
- No hay `docker stack up`, ni `--build`. Swarm nunca construye imágenes —
  solo las corre. Por eso el paso de `docker compose -f deploy.yml build`
  antes del deploy.
- `docker stack deploy` es **idempotente**: correrlo de nuevo con el mismo
  archivo actualiza en vez de duplicar. Es la forma normal de "redeployar".
- Un service con healthcheck fallando no se cae solo — Swarm lo reinicia
  según `restart_policy`. Para ver si algo está unhealthy, `docker service
  ps` es el primer lugar donde mirar, no `docker ps`.

## Rollback rápido

Si un deploy rompe algo y el `update_config.failure_action: rollback` de
`deploy.yml` no alcanzó a revertir solo:

```bash
docker service rollback incidencias-stack_backend
docker service rollback incidencias-stack_frontend
```

Esto vuelve a la definición de service anterior (imagen, réplicas, config)
sin que tengas que re-desplegar el stack entero.
