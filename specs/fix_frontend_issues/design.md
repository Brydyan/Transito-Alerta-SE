# Design for fix_frontend_issues

## Arquitectura y Modularización
Para reducir la complejidad cognitiva de componentes como `api.js` o `incidencia-form.component.js`, se aplicará la técnica "Extract Function". El código complejo dentro de un bucle o condicional masivo se extraerá a pequeñas funciones helper puras o privadas al módulo.

## Estándares de Refactor
1. **S3776 (Cognitive Complexity)**: Se evaluarán los flujos `if/else`, anidaciones profundas, y se aplanarán (early return) o se delegará la lógica a funciones más cortas.
2. **S6582 (Optional Chaining)**: En donde haya comprobaciones del tipo `if (obj && obj.prop)`, se reemplazará por `obj?.prop`.
3. **S1854 (Useless Assignments)**: Eliminar variables que se declaran pero nunca se leen antes de ser sobreescritas.
4. **S6660 y S6671**: Sustituir comparaciones o flujos inseguros/incorrectos detectados.
5. **Web:S6819, S6853, S5256**: Cambiar `<div role="status">` por `<output>`, revisar atributos `alt`, `label`, y roles de tablas HTML para que sean válidos en términos de accesibilidad.

## Verificación
Después de aplicar los cambios archivo por archivo, se usarán pruebas de linting o manuales en UI si es posible, y finalmente se correrá el chequeo de sonar.
