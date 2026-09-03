# Design: E2E — Usuario de pruebas y credenciales reales

Cada decisión con su alternativa rechazada.

---

## D1 — El e2e corre como `operador_org`, no como `master`

**Decisión: rol `operador_org`, con `organization_id` de «CTE - Santa Elena».**

Un e2e que entra como `master` atraviesa los guards de permiso sin que ninguno decida
nada: todo le está permitido. Recorre caminos que en producción casi nadie recorre, y
**deja de detectar exactamente la clase de defecto que este proyecto viene teniendo**.

De los defectos abiertos del roadmap:

| Regla | Implementada en | Ausente en |
|---|---|---|
| Alcance por organización | Lecturas | Escrituras |
| Tope de carga | `claim` | `assign` |

Ninguno de esos dos se manifiesta ante un `master`. Con `operador_org` los tests pasan por
los mismos guards que un usuario real, y un fallo de alcance aparece como fallo de test en
vez de como incidente.

**Alternativa rechazada — `master`.** Es lo más cómodo: nunca choca con un 403 y los
specs no tienen que pensar en permisos. Y por eso mismo no verifica nada del sistema de
permisos. Un test que no puede fallar por autorización no cubre la autorización.

**Alternativa rechazada — un rol por spec.** Más fiel a la realidad y multiplica la
superficie a mantener antes de que exista un solo escenario que lo necesite. Cuando un
spec necesite otro rol, se añade ese usuario.

---

## D2 — Usuario dedicado, no reutilizar uno de los seis sembrados

**Decisión: `e2e@tase.local`, propio.**

Dos razones, y la segunda es la que decide:

1. Los specs **mutan datos** —crean comentarios— contra staging compartido. Reutilizar
   `operador-org-1@tase.local` mezcla el ruido de CI con lo que alguien esté probando a
   mano.
2. La contraseña de los seis usuarios de demo es la que **el operador tipea**. Si CI
   dependiera de ella, rotarla —que es algo que debe poder hacerse sin ceremonia— rompería
   CI, y el fallo aparecería como «los e2e fallan» sin relación aparente con la rotación.
   Acoplar la contraseña del humano a la de la máquina convierte una operación de higiene
   en una avería.

**Alternativa rechazada — reutilizar `operador-org-1@tase.local`.** Cero trabajo de seed y
crea el acoplamiento del punto 2.

---

## D3 — La contraseña llega por entorno; el repo no la conoce

`E2E_PASSWORD` como secret de GitHub, consumido por el job y por el paso de seed. Nunca
literal en el repo, ni siquiera como valor por defecto.

**Alternativa rechazada — una contraseña de prueba conocida en el repo** (`e2e123` y
similares). Es lo habitual en proyectos con entornos privados, y acá **staging está
publicado a internet por el Tailscale Funnel**. Una credencial en claro en un repo, para
una cuenta con permisos de `operador_org` sobre una organización real, es una cuenta
regalada.

Y no aplica el argumento de «son datos de prueba»: la organización sembrada es «CTE -
Santa Elena», la misma que usa la operación.

**Corolario:** `users.js` **no** debe tener un `DEFAULT_E2E_PASSWORD` análogo al
`DEFAULT_SEED_PASSWORD` existente. Sin `E2E_PASSWORD`, el usuario e2e no se siembra.
Mejor no tenerlo que tenerlo con una contraseña pública.

---

## D4 — «No configurado» se salta; «configurado y roto» falla

Ésta es la decisión que evita repetir la historia de este change.

```
sin BASE_URL                    → se salta, con motivo declarado
BASE_URL sin E2E_PASSWORD       → FALLA, ruidosamente
BASE_URL + E2E_PASSWORD         → corre de verdad
```

Hoy todo se salta ante cualquier ausencia, y ahí es donde el defecto vivió meses: **un
test que no corre se lee igual que un test que pasa**. Pero saltarse por «este entorno no
tiene e2e» es legítimo, y saltarse por «faltó un secret» es una avería disfrazada de
decisión.

Separarlos hace que la ausencia deliberada siga siendo barata y la mala configuración
sea imposible de ignorar.

**Alternativa rechazada — saltarse en ambos casos.** Es el comportamiento actual y es la
causa de que SC-208 advirtiera sobre estos e2e sin que nadie lo notara.

**Alternativa rechazada — fallar en ambos casos.** Obligaría a configurar staging para
poder correr los tests unitarios de cualquier rama, y volvería el pipeline rojo por
defecto en cualquier fork o entorno nuevo.

---

## D5 — Cachear los navegadores de Playwright

`~/.cache/ms-playwright` no está cacheado, mientras el store de pnpm sí lo está en los
seis jobs. Cada corrida descarga Chromium entero más sus dependencias de sistema.

La clave se ata al lockfile, no a la versión de Playwright a mano: si el lockfile cambia,
la versión del navegador puede cambiar con él.

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ hashFiles('frontend/pnpm-lock.yaml') }}
```

`--with-deps` instala además paquetes de sistema por apt, que la caché **no** cubre. Se
mantiene: reinstalarlos es barato comparado con el navegador.

**Alternativa rechazada — no cachear.** Es el estado actual y era tolerable mientras el
job se saltaba entero. Con los tests corriendo de verdad, se paga en cada PR.

---

## D6 — `workers: 1` se mantiene

Los specs corren contra **staging compartido** y crean comentarios. En paralelo se
pisarían, y esa inestabilidad se leería como fallo del producto.

**Alternativa rechazada — paralelizar.** La corrida es corta; el riesgo de introducir
inestabilidad de test en un proyecto que todavía está estabilizando su despliegue no
compensa el ahorro.

La salida real —un entorno e2e con su propia base— está fuera de alcance y anotada.
