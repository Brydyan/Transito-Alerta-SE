# Tasks

- [x] Modificar `estado-individual-incidencia-index.component.js` para extraer lógica compleja (ej. if/else anidados) en funciones auxiliares para reducir la complejidad cognitiva de la función de L354 por debajo de 15. Cubre R1.
- [x] Refactorizar `estado-individual-incidencia-index.component.js` en L391 para utilizar la sintaxis de Optional Chaining (`?.`). Cubre R2.
- [x] Modificar `incidencia-form.component.html` en L194 cambiando los elementos con `role="status"` a utilizar la etiqueta nativa `<output>`. Cubre R3.
- [x] En `incidencia-form.component.js` (L415-418), reemplazar todas las llamadas a la función global `parseFloat` por `Number.parseFloat`. Cubre R4.
- [x] En `incidencia-form.component.js` (L433), eliminar la declaración y asignación de la variable no utilizada `isCitizen`. Cubre R5.
- [x] Modificar la función en `incidencia-form.component.js` (L460) dividiendo sus responsabilidades en submétodos más pequeños, reduciendo su complejidad cognitiva de 47 a menos de 15. Cubre R6.
- [x] Refactorizar `incidencia-form.component.js` en L1042 para utilizar la sintaxis de Optional Chaining (`?.`). Cubre R7.
- [x] Ajustar la condicional en `incidencia-form.component.js` en L1240, reemplazando un `else { if(...) { ... } }` con la sintaxis simplificada `else if(...) { ... }`. Cubre R8.
- [x] En `incidencia-form.component.js` (L1254 y L1256), asegurar que cualquier rechazo a las promesas retorne `new Error(...)`. Cubre R9.
- [x] Modificar las aserciones en `incidencia-form.component.test.js` (L165, L202) utilizando métodos específicos proporcionados por la librería de pruebas (por ejemplo, `.toHaveLength()` y `.toBeUndefined()`). Cubre R10.
- [x] Modificar las aserciones en `incidencia-supervisor-index.component.test.js` (L120) para utilizar llamadas asertivas específicas (por ejemplo, `.toHaveLength()`). Cubre R10.
- [x] Ejecutar los tests y verificar que todos los cambios implementados se encuentran cubiertos por los tests. Cubre R11.
