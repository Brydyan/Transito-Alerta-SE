# Secret Rotation Policy — Mercure

> Introduced in Ola 1.3 of `openspec/changes/mercure-auth-hardening/`.
> Audience: backend maintainers + SRE.

## Por qué rotar

El sistema tiene dos secretos JWT de Mercure con blast radius distintos:

| Secret | Env var | Blast radius si se filtra | Frecuencia recomendada |
| --- | --- | --- | --- |
| **Publisher** | `MERCURE_PUBLISHER_JWT_SECRET` | Permite inyectar notifications **a cualquier topic** (incluido el de cualquier user). Es un server-side secret (no sale al browser), pero si un atacante obtiene acceso al container/.env, puede hacer daño hasta rotar. | **Cada 90 días** (server secret, rotación menos frecuente) |
| **Subscriber** | `MERCURE_SUBSCRIBER_JWT_SECRET` | Permite a un atacante **escuchar el stream de notifications de cualquier user** durante el TTL del cookie (30 días después de Ola 2). Es un server secret simétrico: solo el server firma, pero el secreto es el mismo que firma los cookies. | **Cada 30 días** |

> **Nota**: el cookie `mercureAuthorization` que llega al browser contiene un JWT firmado con el **subscriber secret**. Si el subscriber secret se filtra, cualquier JWT capturado tiene valor hasta que rote (no tiene revocación centralizada).

## Cuándo NO rotar

- Viernes después de las 14h (regla general del equipo).
- Durante una ventana de mantenimiento planificado del frontend (la consecuencia es que todos los operadores pierden el feed en vivo, aunque la app sigue funcionando vía fallback).
- Cuando hay una sesión de demos con stakeholders.

## Procedimiento — Publisher

```bash
# 1. Generar nuevo secreto en una consola separada (no commiteable)
NEW=$(openssl rand -hex 32)
echo $NEW

# 2. Actualizar el .env del ambiente (deploy artifact o config map)
#    MERCURE_PUBLISHER_JWT_SECRET=<NEW>

# 3. Reiniciar pods del backend. Cada instancia vuelve a construir
#    el LcobucciFactory con el nuevo secret en el próximo request.
kubectl rollout restart deploy/backend -n <env>

# 4. Smoke test: el primer publish de prueba debe funcionar.
php artisan tinker
>>> app(\Symfony\Component\Mercure\HubInterface::class)
>>> // Sin excepción = OK
```

**Migración**: por la naturaleza stateless de los tokens, **no es necesario invalidar tokens en circulación**. Los tokens viejos siguen siendo válidos hasta su `exp` (1h, Ola 1.4). Después de 1h, todos los publishers firmarán con el nuevo secret.

## Procedimiento — Subscriber (más delicado)

```bash
# 1. Generar nuevo secreto
NEW=$(openssl rand -hex 32)

# 2. Actualizar el .env
#    MERCURE_SUBSCRIBER_JWT_SECRET=<NEW>

# 3. Reiniciar pods del backend.
kubectl rollout restart deploy/backend -n <env>

# 4. IMPORTANTE: invalidar TODOS los cookies Mercure activos.
#    Como son JWTs stateless, la única forma es forzar logout a
#    todos los usuarios (lo cual también rota el refresh_token y
#    el access_token, ambos firmados con secretos separados).
#
#    Si el equipo tiene un endpoint de "force logout all":
curl -X POST https://<env>/api/admin/auth/logout-all \
  -H "Authorization: Bearer <admin-token>"

#    Si no existe, la opción manual es:
#    - Reducir el TTL del cookie Mercure a 5 minutos via
#      MERCURE_COOKIE_TTL_MIN=5 en .env, deploy. Esperar 30 días
#      (rotación normal). Esto **no es una opción rápida** —
#      solo usar si no hay forma de forzar logout all.
#
# 5. Smoke test: un login fresco emite cookie firmada con el
#    nuevo secret. El frontend debe poder suscribirse al hub.
```

**Por qué es delicado**: el subscriber secret aparece en CADA cookie Mercure activa. Mientras el secreto viejo esté en cualquier pod que valide subscriptions, los tokens viejos siguen siendo válidos. Si solo rotás el secret sin forzar logout, los usuarios **no notan la diferencia** (sus cookies viejas siguen funcionando). El blast radius es proporcional al tiempo que un atacante haya tenido acceso al secret anterior.

**Mitigación de blast radius** (Ola 2): cuando el TTL del cookie se baje de 30 días a 15 minutos, una rotación que no fuerce logout queda "auto-invalidada" en 15 minutos.

## Auditoría manual post-rotación

Para el publisher y subscriber:

1. **Logs del hub Mercure**: ¿se ven tokens con la nueva firma?
2. **403/401 en frontend**: ¿alguno o ninguno? `0 = OK`. Algunos con tokens viejos = esperable durante la ventana de migración.
3. **Tests de integración**: correr suite Auth + Notifications después de cada rotación.

## Procedimiento de emergencia (compromiso confirmado)

Si un secret se filtra públicamente (GitHub, log expuesto, etc.):

1. **Rotar inmediatamente**, sin importar el día/hora.
2. Si es subscriber, **ejecutar `logout-all`** en todas las instancias del backend.
3. Investigar el vector del leak (commit, log, S3 público) y bloquearlo antes del próximo ciclo de rotación.
4. Considerar bajar el TTL del cookie Mercure a 5 minutos por 24-48h como ventana de exposición reducida.

## Historia

| Fecha | Cambio | PR/Autor |
|---|---|---|
| 2026-07-17 | Doc creado (Ola 1.3 de mercure-auth-hardening) | — |
