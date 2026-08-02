# Postmortem — Primer Deploy a Producción con Docker Swarm

Registro de todo lo que pasó llevando `deploy.yml` a producción por primera
vez, en el server compartido (`twintailserver`, single-node Swarm, también
corre jasrapo/quizis/electordata/filegator). Cada bug real, cómo se detectó
y cómo se arregló.

## 1. Bootstrap de Swarm

**Síntoma:** `docker swarm init` tiraba `could not choose an IP address to
advertise since this system has multiple addresses`.

**Causa:** la interfaz de red tenía 2 direcciones IPv6 (privacy extensions
rotando), Docker no podía elegir una sola.

**Fix:** como es single-node (nunca va a haber un nodo B real), usar
loopback:
```bash
docker swarm init --advertise-addr 127.0.0.1
```

## 2. CI: chequeo de Swarm activo con bug de substring

**Síntoma:** el workflow de deploy pasaba el chequeo "Swarm activo" aunque
Swarm estuviera inactivo en ese runner, y explotaba después con un error
crudo de Docker en vez del mensaje claro esperado.

**Causa:** `docker info --format '{{.Swarm.LocalNodeState}}' | grep -q
active` hace match por substring — la palabra `"inactive"` **contiene**
`"active"`, así que el grep daba positivo en los dos casos.

**Fix:** comparación exacta en `.github/workflows/deploy.yml`:
```bash
if [ "$(docker info --format '{{.Swarm.LocalNodeState}}')" != "active" ]; then
```

## 3. `.env` no se lee automático en `docker stack deploy`

**Síntoma:** interpolación de `${VAR}` fallando / variables requeridas
(`:?`) tirando error de "variable missing" al desplegar.

**Causa:** `docker stack deploy` no soporta `.env` files (feature exclusiva
de `docker compose`). Sí interpola `${VAR}` desde el entorno real del
proceso.

**Fix:** exportar el `.env` al shell antes de desplegar:
```bash
set -a; source .env; set +a
docker stack deploy -c deploy.yml incidencias-stack
```
(en `fish`, envolver todo en `bash -c '...'` porque `set -a`/`source` es
sintaxis bash, no fish).

## 4. Pre-renderizar con `docker compose config` rompe tipos

**Intento:** para evitar el problema del punto 3, se probó
`docker compose -f deploy.yml config > rendered.yml` y desplegar el
archivo ya resuelto.

**Síntoma:** `services.rustfs.deploy.resources.limits.cpus must be a
string` y después `services.grafana.ports.0.published must be a integer`.

**Causa:** el render de `docker compose config` reescribe `cpus: "0.5"`
como float sin comillas, y expande los `ports:` de formato corto a
long-form con `published` tipado como string — el parser de
`docker stack deploy` rechaza ambos con tipos estrictos distintos a los
que Compose tolera.

**Fix:** abandonar el pre-render. Exportar `.env` (punto 3) y desplegar
`deploy.yml` tal cual, sin pasar por el round-trip de `compose config`.
Se sacó el límite de `cpus` de `rustfs` en `deploy.yml` para evitar el
primer problema de raíz.

## 5. `.env` con bugs de formato bash

Dos bugs distintos en el mismo archivo, ambos rompiendo `source .env`:

- **Línea partida:** `FIREBASE_CREDENTIALS=` en una línea y el path en la
  siguiente (el editor cortó una línea larga al pegar). Bash interpretaba
  la segunda línea como un comando a ejecutar → `No such file or directory`.
- **Espacio después del `=`:** `FIREBASE_CREDENTIALS= /var/www/...json`
  — en bash, `VAR= valor` (con espacio) es `VAR=` vacío + intento de
  ejecutar `valor` como comando.

**Fix:** ambos se corrigieron a una sola línea, sin espacio:
`FIREBASE_CREDENTIALS=/var/www/backend/storage/....json`.

## 6. Colisión de puertos con otros proyectos del server

**Síntoma:** nada roto todavía, pero se detectó antes de desplegar
mirando `docker ps`: `FRONTEND_PORT` (3000), `GRAFANA_PORT` (3001) y
`RUSTFS_API_PORT`/`RUSTFS_CONSOLE_PORT` (9000/9001) por default chocaban
con `electordata_frontend`, `electordata_backend` y un `rustfs-server`
standalone de otro proyecto (JASRAPO) que ya usaba esos puertos.

**Fix:** en el `.env` de ese server:
```
FRONTEND_PORT=3006
GRAFANA_PORT=3099
RUSTFS_API_PORT=9300
RUSTFS_CONSOLE_PORT=9301
```

## 7. Healthcheck de `frontend` fallando por IPv6

**Síntoma:** `frontend` quedaba en `0/2`, crash-loop constante.
`wget http://localhost/nginx_status` devolvía `Connection refused` al
correrlo manual dentro del container, aunque nginx arrancaba bien según
los logs.

**Causa:** la imagen `nginx:alpine` intenta auto-configurar listen en
IPv6, pero `nginx.conf` (custom, no el default del paquete) solo escucha
`listen 80;` (IPv4). Si `localhost` resolvía a `::1` primero, el healthcheck
pegaba contra una dirección donde nadie escuchaba.

**Fix:** healthchecks en `deploy.yml` usando `127.0.0.1` explícito en vez
de `localhost`, tanto en `frontend` como en `backend`.

## 8. `env_file: .env` no existe en Swarm — el bug más grande

**Síntoma:** backend arrancaba pero con S3 rompiendo ("region" requerida
faltante), Postgres resolviendo a SQLite, credenciales de fábrica de
Laravel (`root`/`laravel`) en vez de las reales.

**Causa:** `deploy.yml` tenía `env_file: .env` en el service `backend`,
copiado del patrón de `docker-compose.yml`. Docker Swarm **no soporta el
campo `env_file` en absoluto** — `ServiceSpec` no tiene ese campo, Swarm lo
ignora en silencio, sin error. Todo lo que dependía únicamente de ese
mecanismo (no explícito en `environment:`) llegaba vacío o caía a los
defaults de Laravel/framework.

**Fix:** sacar `env_file: .env` del todo y declarar **cada variable
explícita** en el bloque `environment:` de `deploy.yml`, referenciando
`${VAR}` del `.env` raíz: `APP_KEY`, `APP_ENV`, `DB_CONNECTION`,
`DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `STORAGE_ENDPOINT`,
`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_DEFAULT_REGION`/
`AWS_BUCKET`/`AWS_ENDPOINT`, `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`,
`MERCURE_PUBLISHER_JWT_SECRET`/`MERCURE_SUBSCRIBER_JWT_SECRET`,
`FIREBASE_CREDENTIALS`/`FIREBASE_PROJECT_ID`, `CORS_ALLOWED_ORIGINS`,
`SESSION_DRIVER`/`CACHE_STORE`/`QUEUE_CONNECTION`.

## 9. La causa real del crash-loop: Caddyfile + Mercure vacío

**Síntoma:** con casi todas las variables ya arregladas, el backend seguía
muriendo con `frankenphp app module: start: failed to initialize workers:
too many consecutive failures: worker public/frankenphp-worker.php has
not reached frankenphp_handle_request()`. Este error tapaba todo lo demás
— FrankenPHP solo loguea `ERROR unknown error`, sin detalle.

**Cómo se encontró:** aislando un container suelto con `docker run`
(compartiendo el network namespace de `db` vía `--network container:<id>`,
ya que la red overlay de Swarm no es "attachable" por default) se pudo ver
el stream de logs sin el ruido de Swarm reiniciando cada 4-5 segundos:

```
Error: adapting config using caddyfile: parsing caddyfile tokens for
'route': parsing caddyfile tokens for 'mercure': wrong argument count
or unexpected line ending after 'publisher_jwt'
```

**Causa:** Octane genera un Caddyfile con un directive
`mercure { publisher_jwt {env.MERCURE_PUBLISHER_JWT_SECRET} }`. Si esa
variable llega vacía, la línea queda sin argumento y Caddy (el servidor
HTTP debajo de FrankenPHP) **ni siquiera puede parsear su propia config**
— el worker nunca llega a inicializar, de ahí el error genérico de arriba.

**Fix:** pasar `MERCURE_PUBLISHER_JWT_SECRET`/`MERCURE_SUBSCRIBER_JWT_SECRET`
explícitos (parte del fix del punto 8, pero esta fue la variable puntual
que de verdad tumbaba todo el servidor, no solo un warning).

> **Resolución del problema general** (no de esta variable específica): el
> ruido genérico `ERROR unknown error` que motivó este post-mortem se
> abordó en dos etapas. La primera ([PR #101](https://github.com/Ali-Rr26/sistema-incidencias-georreferenciadas/pull/101))
> añadió una subclase que capturaba cada línea de stderr/stdout de
> FrankenPHP via `Log::channel('exceptions')` con el debug completo, así
> el log era debuggeable. La segunda ([PR #108](https://github.com/Ali-Rr26/sistema-incidencias-georreferenciadas/pull/108))
> migró el runtime a Swoole, que no comparte el bug — el handler de
> `StartSwooleCommand` no tiene el fallback `'unknown error'`. Bajo
> Swoole este crash-loop particular (causado por Caddyfile mal formado)
> ya no se manifiesta en la misma forma, pero los risks de configuración
> del paso 8 siguen siendo los mismos independientemente del driver.

## 10. Portainer

- Instalado como service dentro del stack (`deploy.yml`), pineado a
  `node.role == manager`, puerto `9443` (HTTPS) y `9010` (HTTP — se corrió
  de `9000` porque ya lo usaba `rustfs`).
- Primer arranque requiere un **setup token** sacado de los logs del
  container (`docker service logs incidencias-stack_portainer | grep
  setup_token`), no solo usuario/contraseña.
- La ventana para crear el admin inicial expira rápido — si se pasa el
  tiempo, `docker service update --force incidencias-stack_portainer`
  reinicia el container y reabre la ventana.

## Resultado final

`backend` y `frontend` en `2/2`, resto de services (`db`, `redis`,
`rustfs`, `prometheus`, `grafana`, `loki`, `promtail`, `portainer`,
`postgres_exporter`, `redis_exporter`, `cloudflared`) en `1/1` (o
`global` para `promtail`). Migraciones corriendo automático en cada boot
(`entrypoint.sh`, `php artisan migrate --force`).

## Cómo se bajó (y cómo bajarlo de nuevo)

**`docker compose down` no aplica acá.** Ese comando opera sobre el mundo
de Compose (containers sueltos etiquetados por proyecto) — Swarm tiene su
propio modelo de `services`/`tasks`, Compose ni se entera de que existen.
Si lo corrés en esta carpeta, no encuentra nada relacionado al stack (y si
hay un `docker-compose.yml` de dev en el mismo directorio, podés terminar
bajando/tocando ESE por error).

Lo correcto:

```bash
# Bajar el stack completo (todos los services, redes, nada de volúmenes)
docker stack rm incidencias-stack

# Escalar a 0 un service puntual sin bajar el resto (lo que se usó para debuggear backend)
docker service scale incidencias-stack_backend=0

# Volver a levantar todo desde el archivo actual
bash -c 'set -a; source .env; set +a; docker stack deploy -c deploy.yml incidencias-stack'
```

Los volúmenes (`db_data`, `redis_data`, `rustfs_data`, `grafana_data`,
`portainer_data`) **no se borran** con `docker stack rm` — sobreviven a
que bajes y vuelvas a levantar el stack. Para borrarlos de verdad hace
falta `docker volume rm` explícito, aparte.
