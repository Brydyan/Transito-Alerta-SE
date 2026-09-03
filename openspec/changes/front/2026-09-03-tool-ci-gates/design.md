# Design: TOOL — Compuertas que comprueben lo que dicen comprobar

---

## D1 — Se arregla el comando, no el `tsconfig.json`

**Decisión: toda compuerta declarada pasa a `npx tsc -b tsconfig.json --noEmit`.**

`frontend/tsconfig.json` es un *solution tsconfig*: `"files": []` más `"references"` a
`tsconfig.app.json` y `tsconfig.spec.json`. Eso **no es un error**: es el layout que
genera Angular CLI, y `-b` (build mode) es la forma correcta de recorrerlo.

**Alternativa rechazada — añadir `include` al `tsconfig.json` raíz para que `-p`
funcione.** Es lo primero que se ocurre y rompe el modelo de project references: el
archivo raíz pasaría a compilar por su cuenta archivos que sus referencias ya compilan,
con opciones distintas de las de cada proyecto (`types: ["jest"]` vale para los specs y no
para la app). Se ganaría que un comando equivocado funcione, a costa de que la
configuración deje de significar lo que dice.

El comando estaba mal; la configuración estaba bien.

---

## D2 — `"types": ["jest", "node"]`, no cinco parches por archivo

Los 14 errores salen de una única causa: `frontend/tsconfig.spec.json` declara
`"types": ["jest"]`, y cinco specs de regresión usan `node:fs`, `node:path`, `__dirname` y
`__filename` para leer archivos del repo.

Una línea los cierra todos.

**Alternativa rechazada — un `/// <reference types="node" />` o un import de tipos en cada
spec.** Cinco ediciones en vez de una, y —lo que decide— **el sexto spec que se escriba
vuelve a fallar**. El proyecto ya tiene el hábito de leer archivos desde los tests
(`contrast.regression`, `layout-tokens.regression`, `menu-map`), así que habrá un sexto.
Arreglar la causa una vez le gana a arreglar el síntoma cinco veces y esperar acordarse la
próxima.

**Alternativa rechazada — dejar de leer archivos desde los tests.** Sería tirar la técnica
que hace valiosos esos specs: `contrast.regression.spec.ts` calcula contraste real desde
`_variables.css` justamente porque lo lee.

---

## D3 — La compuerta nace en rojo, y eso se declara

Con `-b` aparecen errores reales. Uno es legítimo y ajeno a esta fase:

```
src/app/core/services/auth.service.spec.ts(227,80): error TS2345:
  Type 'string | null' is not assignable to type 'string'.
```

**Decisión: esta fase NO lo arregla, y lo deja anotado con dueño.**

Arreglarlo exige decidir si `organization_name` puede ser nulo en `InvitationPreview` —
una pregunta de modelo de dominio, no de herramientas. Meterla acá mezclaría un cambio sin
riesgo con uno que toca un contrato.

**Consecuencia aceptada y explícita:** al terminar esta fase el typecheck **falla**, y esa
es la primera vez que dice la verdad. Hay que decidir si el gate entra en CI bloqueando
desde el día uno o si se le da una ventana. Recomendación: **bloqueando**, y que cerrar el
`TS2345` sea el primer trabajo que lo consuma. Un gate con excepción temporal es un gate
con excepción permanente — el proyecto ya tiene tres instancias de esa historia.

**Alternativa rechazada — arreglar el `TS2345` acá para que el gate nazca verde.** Más
cómodo y confunde dos cosas: que la herramienta funcione, y que el código pase. La primera
es verificable hoy; la segunda es trabajo de producto.

---

## D4 — `actionlint` por contenedor, sin action de terceros

```bash
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest .github/workflows/*.yml
```

Verificado: ambos workflows pasan limpios hoy, así que el gate entra sin deuda previa.

**Alternativa rechazada — una action del marketplace.** Añade una dependencia de terceros
con acceso al repositorio para ejecutar un binario que el contenedor oficial ya provee.

Justificación de existir: `ci.yml` estuvo **inválido** desde `351eec0` por un `schedule:`
suelto a nivel raíz, y nadie lo notó porque un workflow inválido sencillamente no corre —
otra vez, la ausencia de una comprobación leyéndose igual que su éxito. `actionlint` lo
habría cazado en el PR.
