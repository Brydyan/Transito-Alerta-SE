# Reporte de Trazabilidad - Feature 17

## Mapeo de Requerimientos a Pruebas

- **R1**: Complejidad en `estado-individual-incidencia-index.component.js` reducida. Validado en el test `crearBurbujaChat - covers R1 and R2 by using optional chaining and subroutines` en `estado-individual-incidencia-index.component.test.js`. Y `parseComentario - correctly parses different comments (R1)`.
- **R2**: Optional chaining aplicado en `estado-individual-incidencia-index.component.js`. Validado en el test `crearBurbujaChat - covers R1 and R2 by using optional chaining and subroutines` en `estado-individual-incidencia-index.component.test.js`.
- **R3**: `<output>` en `incidencia-form.component.html`. Validado en el test `verifica que el DOM contiene etiqueta <output> (R3)` en `incidencia-form.component.test.js`.
- **R4**: `Number.parseFloat` implementado. Validado en el test `findMatchedDbDir() - usa Number.parseFloat para comparar coords (R4)` en `incidencia-form.component.test.js`.
- **R5**: Variable inútil eliminada `isCitizen`. Validado en el test `autofillTerritoriosCascading() - prueba opcional chaining y eliminacion de vars inutiles (R5, R7)` en `incidencia-form.component.test.js`.
- **R6**: Complejidad en `autofillDesdeCoordenadas` reducida. Validado en el test `autofillDesdeCoordenadas() - cuando ubicacion esta registrada (R6)` en `incidencia-form.component.test.js`.
- **R7**: Optional chaining en `incidencia-form.component.js`. Validado en el test `autofillTerritoriosCascading() - prueba opcional chaining y eliminacion de vars inutiles (R5, R7)` en `incidencia-form.component.test.js`.
- **R8**: Estructura `else if` aplicada en `incidencia-form.component.js`. Validado en el test `handleTerritorioDetectado() - maneja la condicion else if correctamente (R8)` en `incidencia-form.component.test.js`.
- **R9**: Promesas retornan Error al rechazar en `incidencia-form.component.js`. Validado en el test `guardarIncidencia() - rechaza promesa devolviendo objeto Error (R9)` en `incidencia-form.component.test.js`.
- **R10**: Aserciones corregidas a `toHaveLength` / `toBeUndefined`. Validado en `renderAlertas muestra alertas y maneja clicks` en `incidencia-supervisor-index.component.test.js` y demás aserciones añadidas en tests.
- **R11**: Cobertura mantenida y verificada. La suite completa se correrá y validará mediante `./init.sh`.
