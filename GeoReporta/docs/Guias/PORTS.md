# Port Allocation

When running this project alongside other Docker-based projects on the same host, port collisions can occur — especially for S3-compatible storage (RustFS) which several sister projects use.

This document defines the **port allocation convention** used by this project's Docker Compose stack and the sister projects that share RustFS.

## Sister projects that share RustFS

| Project | Path | Default S3 API | Default S3 Console | Postgres | Backend | Frontend |
|---|---|---|---|---|---|---|
| **sistema-incidencias-georreferenciadas** (THIS) | `~/Documentos/GitHub/sistema-incidencias-georreferenciadas` | 9000 | 9001 | 5432 | 8000 | 3000 |
| JASRAPO-BACKEND | `~/Documentos/GitHub/JASRAPO-BACKEND` | 9100 | 9101 | 5433 | 3002 | 8081 |
| FlowTory | `~/Documentos/GitHub/FlowTory` | 9200 | 9201 | 5434 | 3000 | 4000 |

If you run two stacks simultaneously, set `RUSTFS_API_PORT` and `RUSTFS_CONSOLE_PORT` accordingly in the `.env` of whichever stack you're bringing up last (or whichever you don't mind changing).

## Naming convention

Allocate ports in **100-blocks** per project, leaving room for related tooling:

- Base block (`:0xxx`): main app services (frontend, backend)
- DB block (`:54xx`): postgres (5432 reserved for primary)
- Cache/queue block (`:63xx`): redis (6379 reserved for primary)
- Storage block (`:90xx`): RustFS API
- Storage console (`:90xx+1`): one above the API port

## Adjusting your project's ports

In this project, edit `.env`:

```bash
# Defaults — only change if conflicting with another project
RUSTFS_API_PORT=9000
RUSTFS_CONSOLE_PORT=9001
```

Then `docker compose up -d` will pick up the new mapping.

## Pre-check: are my ports free?

Before `docker compose up -d`, run the helper script:

```bash
./scripts/check-port-collision.sh
```

This compares your `.env` ports against:
- Currently listening sockets (`ss -tlnp`)
- Other running Docker compose stacks with published ports (`docker ps`)

If something is reported, decide who keeps the port and who relocates.

## Why port collisions happen

The most common cause is **Docker leaving zombie processes** (especially `containerd-shim` + `docker-proxy` from a `force removed` or crashed container). The kernel still sees the host port as bound, but the container is gone. Docker cannot clean these up — only the kernel can, and that requires root.

Symptoms:
- `docker compose up -d` fails with `ports are not available: ... bind: address already in use`
- `docker ps` shows NO container with that port, but `ss -tlnp` shows it bound
- `ps aux | grep docker-proxy` reveals orphaned procs from `root`

Recovery:
```bash
# kill the orphaned shim + docker-proxy with sudo
sudo ss -tlnp 'sport = :<PORT>'  # find PID
sudo kill -9 <PID>
docker container prune -f
docker compose up -d
```
