# Design

## Archivos a Modificar

1. `frontend/js/pages/incidencias/components/estado-individual-incidencia/estado-individual-incidencia-index.component.js`
2. `frontend/js/pages/incidencias/components/lobby/form/incidencia-form.component.html`
3. `frontend/js/pages/incidencias/components/lobby/form/incidencia-form.component.js`
4. `frontend/js/pages/incidencias/components/lobby/form/incidencia-form.component.test.js`
5. `frontend/js/pages/incidencias/components/supervisor/incidencia-supervisor-index.component.test.js`

## Firmas y Estructuras Nuevas

- Para abordar el error de complejidad cognitiva (javascript:S3776), se implementarán funciones auxiliares privadas o locales que modularicen las validaciones o renderizaciones extensas, abstrayendo el código de los métodos principales de la clase (divide y vencerás).
- Sustitución estricta de `parseFloat` por `Number.parseFloat`.
- Refactorización de condicionales en cadenas lógicas `&&` hacia Optional Chaining (`?.`).
- Asegurar que todos los retornos en bloques `reject` de promesas devuelvan instancias `new Error(...)`.
- Cubrir los nuevos cambios si no se encuentran en su respectivo `*.test.json`

## Excepciones

- No hay excepciones operativas para estas correcciones, deben pasar las validaciones estáticas.

## Alternativas Descartadas

- **Ignorar los issues mediante // NOSONAR o configuraciones en el servidor de SonarQube:** Descartado con justificación. La consigna principal de esta funcionalidad (feature id=17) es corregir la deuda técnica activa sin introducir nueva; ignorarlos solo ocultaría el problema real afectando la mantenibilidad y calidad a largo plazo del código.
