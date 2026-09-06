# Archive Report — ANON: Cerrar el reporte sin sesión (sc-326)

**Archivado**: 2026-09-05
**Rondas de verify**: 2
**Veredicto final**: `pass-with-warnings` — 0 CRITICAL

---

## Qué entrega

La identidad anónima (`device_uuid = 'anonymous'`) deja de poder iniciar sesión y de
conceder permisos. El ciudadano pasa a ser el `reporter` autenticado, que entregó REG
(sc-325).

El cierre son dos capas:

- `anonymousPermissions` vacía en `auth.config.ts`
- `login()` rechaza el `device_uuid` anónimo con `ANONYMOUS_IDENTITY_CLOSED` **antes** de
  tocar la base: no crea fila, no emite token, no abre sesión

El rechazo es quirúrgico: sólo la rama `device_uuid === 'anonymous'`. La forma de
credencial `{device_uuid}` sigue viva porque la usan las identidades de dispositivo
autenticadas y las pruebas de integración.

---

## Lo que la auditoría descartó, con evidencia

**Sin puertas traseras.** Se recorrieron todos los caminos: `credential-dispatch.ts` enruta
todo login por `device_uuid` a través de `login()`; no existe ningún mecanismo `@Public()`
en el backend; `auth.register.ts` fija `deviceUuid: null` sin posibilidad de falsearlo.

**Los siete e2e reescritos son legítimos.** Se revisaron uno por uno con `git diff`. Cada
uno conserva el invariante que medía —geolocalización de organización, aceptación fuera de
zona, techo de permisos, el `ON DELETE SET NULL` de la integridad referencial— y sólo
cambia el actor: de la máscara anónima compartida a un `reporter` autenticado vía
`provisionUser()`. Ninguna aserción se recortó ni se invirtió.

Era el riesgo principal de este change: cuando una capacidad se retira, las pruebas que la
usaban de andamio se pueden «arreglar» ablandándolas.

---

## La migración 0048 no es el mecanismo

`getAuthContextByUserId` fuerza el valor de la configuración para la rama anónima, así que
el `permissions` de la fila máscara **no se lee nunca**. 0048 alinea lo que dice la base
con lo que hace el código: higiene de datos, no aplicación de la regla.

La fila **no se borra**: AUD la recicla como identidad de publicación, y borrarla rompería
claves foráneas y obligaría a recrearla con el mismo id en otra migración.

El `DOWN` restituye carácter por carácter lo que puso `0008_anonymous_read_comments.sql`.
No repite el defecto de sc-315, donde el `UP` se arregló y el `DOWN` quedó roto en el mismo
archivo.

---

## Compuertas al archivar

| | |
|---|---|
| backend lint | 0 errores, 19 warnings preexistentes |
| backend typecheck | exit 0 |
| backend build | exit 0 |
| backend unit | 100 suites / 915 tests |
| e2e | 52 suites / 448 tests, 0 fallos |
| frontend unit | 47 suites / 326 tests |
| frontend build | exit 0 |
| compuerta de migraciones de `ci.yml` | pasa |

---

## Specs actualizados fuera del delta

ANON invalidó escenarios de dos specs principales que nadie había tocado. Se corrigieron al
archivar, porque describían comportamiento que ya no existe:

- **`openspec/specs/e2e-flows/spec.md`** — los flujos FL-1 y FL-2 decían «dispositivo
  anónimo hace login». Reescritos con el `reporter` autenticado como actor, conservando lo
  que cada escenario mide. Se agregó **FL-2-05**, que fija el rechazo del login anónimo.
- **`openspec/specs/load-testing/spec.md`** — LT-S2-01 se llamaba «Lectura anónima bajo
  carga» y suponía 25k usuarios virtuales leyendo sin sesión. Anotado como deuda: **el
  guion de k6 todavía no se autentica**, y eso se descubriría el día que se corra la prueba
  de carga.

El dominio `anonymous-access` se declaró `(MODIFIED)` en el delta, pero **nunca existió
como spec propio**: el techo anónimo vivía sólo en `auth.config.ts` y en los escenarios de
`e2e-flows`. Ahora es explícito en `openspec/specs/anonymous-access/spec.md` — 22
requirements y escenarios, verificados por conteo contra el delta.

---

## Nota de despliegue — purgar el caché de permisos

`anonymousPermissions: []` vale desde que el backend arranca, pero las entradas
`perm:v3:uid:*` ya calculadas sobreviven hasta expirar. TTL del caché: 3600 s. TTL del
token de acceso: 15 min. Un token anónimo emitido justo antes del despliegue puede seguir
publicando durante esa ventana — acotada a **15 minutos** por el token.

```bash
docker compose exec -T redis sh -c \
  "redis-cli --scan --pattern 'perm:v3:uid:*' | xargs -r redis-cli del"
```

No es un defecto: es la distancia entre cuándo cambia la configuración y cuándo caduca lo
que ya se calculó. Pero sin la nota, quien despliegue no sabe que la ventana existe.

---

## Hallazgo de proceso, fuera del alcance de este change

**La compuerta de migraciones de `ci.yml` no detecta una migración que falta.**

Recorre `database/migrations/[0-9]*.sql` **en el checkout**. Mientras 0048 estuvo sin
rastrear, el comportamiento fue opuesto en cada lado:

```
local   el archivo existe, falta su fila en el log   →  FALLA
CI      el archivo no existe                          →  PASA
```

Es decir: detecta «una migración sin registrar», no «una migración ausente». Un change
puede integrarse con su código y sin su migración, en verde, y el problema aparece al
desplegar.

Merece un ticket propio: es una compuerta que ofrece una garantía que no tiene.

---

## Deuda conocida

1. **El guion de k6 no se autentica** (LT-S2-01). Anotado en el spec de carga.
2. **La exención anónima de `EmailVerifiedGuard`** —que REG agregó para que el dispositivo
   anónimo pudiera publicar— quedó sin efecto práctico ahora que el login anónimo se
   cerró. El comentario del guard ya dice que le pertenece a ANON; retirarla es limpieza
   segura, pendiente.
3. **La compuerta de migraciones**, arriba.
