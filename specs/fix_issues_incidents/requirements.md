# Requirements

## Introducción

Esta especificación define los requerimientos para resolver todos los problemas de SonarQube identificados en el módulo de incidencias (`frontend/js/pages/incidencias/`), asegurando que no se introduzca nueva deuda técnica.

## Requerimientos

- **R1**: MIENTRAS el código de `estado-individual-incidencia-index.component.js` se ejecute, el sistema DEBE mantener una complejidad cognitiva menor a 15 en todas sus funciones (javascript:S3776, ref L354).
- **R2**: El sistema DEBE utilizar optional chaining expressions en `estado-individual-incidencia-index.component.js` en lugar de validaciones booleanas largas para evaluar accesos a propiedades (javascript:S6582, ref L391).
- **R3**: El sistema DEBE usar la etiqueta `<output>` en `incidencia-form.component.html` en lugar de `role="status"` para asegurar la accesibilidad en distintos dispositivos (Web:S6819, ref L194).
- **R4**: El sistema DEBE utilizar `Number.parseFloat` en vez de la función global `parseFloat` en `incidencia-form.component.js` para realizar conversiones numéricas de manera estricta (javascript:S7773, ref L415-418).
- **R5**: SI se declara una variable en `incidencia-form.component.js`, ENTONCES el sistema DEBE utilizarla en subsecuentes líneas; en caso contrario, se debe eliminar la declaración de variables inútiles como `isCitizen` (javascript:S1481, javascript:S1854, ref L433).
- **R6**: MIENTRAS el código de `incidencia-form.component.js` se ejecute, el sistema DEBE mantener una complejidad cognitiva menor o igual a 15 dividiendo las funciones excesivamente complejas (javascript:S3776, ref L460).
- **R7**: El sistema DEBE usar optional chaining expressions en `incidencia-form.component.js` para realizar validaciones concisas y seguras de propiedades anidadas (javascript:S6582, ref L1042).
- **R8**: SI un bloque `else` contiene únicamente una instrucción `if` en `incidencia-form.component.js`, ENTONCES el sistema DEBE fusionarlos utilizando una estructura `else if` (javascript:S6660, ref L1240).
- **R9**: CUANDO una promesa falla y se rechaza en `incidencia-form.component.js`, el sistema DEBE retornar un objeto instanciado de tipo `Error` como motivo del rechazo (javascript:S6671, ref L1254, L1256).
- **R10**: El sistema DEBE implementar aserciones específicas (por ejemplo, `toHaveLength` o `toBeUndefined`) en los archivos de prueba `incidencia-form.component.test.js` y `incidencia-supervisor-index.component.test.js` para validar los comportamientos de manera precisa (javascript:S5906, ref L165, L202, L120).
- **R11**: El sistema DEBE implementar los tests, asegurandose de cubrir los nuevos cambios si no lo están.
