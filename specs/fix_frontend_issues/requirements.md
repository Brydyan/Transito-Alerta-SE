# Requirements for fix_frontend_issues

## Objetivos (Goals)
G1. Resolver todos los Code Smells y Bugs del frontend listados en `frontend_issues_list.json` que tengan severidad `MAJOR`, `CRITICAL` o `BLOCKER`.
G2. Mantener la lógica de negocio intacta asegurándose de no romper la funcionalidad existente.
G3. Reducir la complejidad cognitiva de las funciones críticas del frontend (como las que exceden el límite de SonarQube).

## Requisitos (Requirements)
R1. Se deben resolver los problemas de severidad MAJOR y CRITICAL extraídos del reporte SonarQube para los archivos Javascript, HTML y CSS del frontend.
R2. Se debe refactorizar y modularizar las funciones complejas en archivos como `core/api.js`, `estado-individual-incidencia-index.component.js`, `incidencia-form.component.js`, `app-data-table.component.js` y `user-form.component.js`.
R3. Se deben reparar los problemas de accesibilidad HTML marcados (como reemplazar roles de status, evitar inputs sin label, etc.).
R4. Se deben remover las sentencias redundantes (ej. if/else innecesarios, reasignaciones inútiles, variables no utilizadas S1854).
R5. Al finalizar, el comando de validación contra SonarQube / API de análisis debe retornar 0 fallos con severidades altas.
