# Proposal: ANON — Cerrar el reporte sin sesión

## Intent

Decisión de producto del equipo, 2026-09-02, en respuesta a la pregunta *«¿el reporte sin
sesión sobrevive, y con qué límites?»*:

> **No.** El ciudadano pasa a ser el `reporter` autenticado, con la opción de publicar de
> forma anónima.

Esta fase ejecuta esa decisión, y existe por una razón concreta: **sin ella, todo lo que
AUD construye es decorativo.**

```
Sin sesión (device_uuid='anonymous') → identidad COMPARTIDA → jamás rastreable
Logueado + publicación anónima       → identidad sellada    → rastreable
```

Si el camino sin sesión sigue abierto, quien quiera publicar información falsa sin
consecuencias simplemente no inicia sesión. Sellar la autoría del camino autenticado
mientras el otro queda abierto es **la regla aplicada en un camino y no en el vecino** —
el patrón que el roadmap ya identifica como recurrente en este proyecto, con tres
instancias registradas.

## Lo que se revierte

Esta fase revierte una decisión tomada el 2026-08-29 y documentada en F4:

> *«Reporte anónimo y de emergencia sin sesión. **Reincorporado al alcance**: se había
> descartado por falta de mock, pero el backend ya lo soporta por completo y no exponerlo
> deja construida una capacidad clave sin puerta de entrada.»*

El razonamiento era correcto con la información de entonces. Lo que cambió es el
requisito: el equipo quiere poder **sancionar la información falsa**, y esa capacidad es
incompatible con una identidad compartida por todos los anónimos.

## Alcance quirúrgico: qué se cierra y qué no

Distinción verificada en el código, y de ella depende que esta fase sea pequeña:

```
{device_uuid} como forma de credencial   → SE MANTIENE
device_uuid === 'anonymous'              → SE CIERRA
```

`exactly-one-credential.validator.ts:24` lo dice: *«`{device_uuid}` alone MUST remain
valid — every one of the 122 pre-existing e2e tests sends exactly that shape»*. Tocar la
forma de credencial rompería 122 tests y no es lo que la decisión de producto pide.

Lo que se cierra es **la rama del techo anónimo** en `AuthService.getPermissions`, no el
camino de credencial por dispositivo.

## Scope

### In Scope
- `anonymousPermissions` queda vacío: la identidad anónima no puede leer ni crear nada
- El login con `device_uuid = 'anonymous'` se rechaza explícitamente
- Los permisos de la fila máscara en `users.permissions` se vacían en migración
- La fila `users` con `device_uuid = 'anonymous'` **sobrevive**: AUD la recicla como
  máscara de publicación (ver AUD `design.md` D1 y D6)
- Actualizar F4: `B.2.11`, `B.2.12` y `B.2.13` dejan de describir el flujo sin sesión

### Out of Scope
- **Eliminar la forma de credencial `{device_uuid}`.** 122 tests e2e dependen de ella y
  la decisión de producto no lo pide
- **Borrar la fila máscara.** AUD la necesita
- Revertir la migración `0008_anonymous_read_comments.sql`. Su efecto se anula con una
  migración nueva; reescribir el historial de migraciones aplicadas no es el mecanismo
- Cualquier cambio en el techo de `reporter`

## Capabilities

- `anonymous-access` (modifica comportamiento existente)

## Dependencias

**Debe ir DESPUÉS de REG.** No es preferencia, es secuencia: si se cierra el reporte sin
sesión antes de que el ciudadano pueda registrarse, queda una ventana en la que **nadie
puede reportar nada**. Primero la puerta nueva, después se cierra la vieja.

**Debe ir ANTES de AUD**, porque AUD asume la máscara ya libre de uso como identidad de
autenticación.

```
REG ──► ANON ──► AUD ──► F4
```

## Riesgo asumido, explícito

Cerrar el reporte sin sesión **sube la fricción para reportar una emergencia**. Quien
presencia un accidente y no tiene cuenta ya no puede avisar en ese momento.

Es una pérdida real y la decisión de producto la acepta a cambio de trazabilidad. Se deja
escrita acá porque el día que alguien pregunte «¿por qué hay que registrarse para avisar
de un choque?», la respuesta debe ser localizable — y porque si el cliente decide que la
fricción no compensa, este documento es el punto de partida para reabrirlo, no un
descubrimiento desde cero.

Mitigación anotada, fuera de alcance: registro exprés desde el propio asistente, de modo
que el ciudadano complete el reporte y cree la cuenta en el mismo flujo.
