Refactor completed for 'frontend/js/pages/incidencias/components/lobby/form/incidencia-form.component.js'.
- Replaced `filter(Boolean)[0]` pattern with `find(Boolean) || ''` in `autofillNivel3FromAddress` and `handleTerritorioNoDetectado`.
- Component tests (`incidencia-form.component.test.js`) are 100% passing.
- `init.sh` fails because WSL is not installed locally. Unrelated frontend tests are failing, but the modified component is fully green.
