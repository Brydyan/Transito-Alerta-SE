# 🟢 TAREAS FRONTEND — Integrante 1 (Andy)
**Especialista: Frontend / UI / JavaScript · HTML + Bootstrap 5**

**Basadas en E1+E2+E3+E4 · Fecha: 16 de julio de 2026**

---

## 📋 Resumen de Tareas Frontend

| Prioridad | Tarea | Defecto/RF | Estado | Est. |
|---|---|---|---|---|
| 🔴 Crítico | BUG-005: Escape XSS en renderizado | innerHTML sin escape | ⏳ | 2h |
| 🟠 Alto | BUG-001: Completar listados (post-BD fix) | Listados no cargaban | ⏳ | 1.5h |
| 🟡 Medio | Completar casos no ejecutados | CP-01-03-F, CP-08-03-F, etc. | ⏳ | 2h |
| 🟡 Medio | Validar responsive en tablet/móvil | RNF-08 | ⏳ | 1h |
| 🟢 Bajo | Optimizar performance dashboard | RNF-02 | ⏳ | 1h |

**Total Estimado:** ~7.5 horas  
**Responsable:** Integrante 1 (Andy Bryan Alejandro Vera)

---

## 🔴 TAREA-F01: Escape XSS en Renderizado (Parte Frontend de BUG-005)

**Ver detalles completos en:** TASKS-CRITICAL-E4.md → TASK-002 (Frontend section)

**Resumen:**
- Reemplazar `innerHTML` por `textContent` en títulos/descripciones
- Crear helper `htmlEscape()` para casos donde se necesita HTML pero con escape
- Auditar todas las interpolaciones de datos dinámicos

### Archivos Críticos a Auditar

```bash
grep -r "innerHTML" frontend/app --include="*.js" | grep -E "titulo|title|description|descripcion"
```

**Ubicaciones Probables:**

1. **feed.component.js** (línea 124)
   ```javascript
   // ANTES (vulnerable):
   const feedItem = `<div class="incident-card">
     <h3>${incident.title}</h3>
     <p>${incident.description}</p>
   </div>`;
   container.innerHTML = feedItem;
   
   // DESPUÉS (seguro - Opción A: solo texto):
   const card = document.createElement('div');
   card.className = 'incident-card';
   const title = document.createElement('h3');
   title.textContent = incident.title;  // ← textContent (no innerHTML)
   const desc = document.createElement('p');
   desc.textContent = incident.description;
   card.appendChild(title);
   card.appendChild(desc);
   container.appendChild(card);
   
   // DESPUÉS (seguro - Opción B: con helper escape):
   const feedItem = `<div class="incident-card">
     <h3>${htmlEscape(incident.title)}</h3>
     <p>${htmlEscape(incident.description)}</p>
   </div>`;
   container.innerHTML = feedItem;  // Ahora es seguro
   ```

2. **incidencias.index.component.js** (línea 86)
   ```javascript
   // Similar: reemplazar innerHTML con textContent
   ```

3. **incident-detail.component.js**
   ```javascript
   // Si existe, auditar similar
   ```

### Implementación

- [ ] **F01.1:** Crear helper de escape en `frontend/app/utils/sanitize.js`
  ```javascript
  export function htmlEscape(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
  }
  ```

- [ ] **F01.2:** Auditar feed.component.js (línea 124)
  ```javascript
  // Opción A: reemplazar innerHTML por appendChild + textContent
  // O Opción B: usar htmlEscape() helper
  ```

- [ ] **F01.3:** Auditar incidencias.index.component.js (línea 86)

- [ ] **F01.4:** Auditar comentarios renderizado (si aplica)

- [ ] **F01.5:** Verificar que NO quedan interpolaciones `${variable}` directas en innerHTML

- [ ] **F01.6:** Test CP-10-03-F
  ```javascript
  // Crear incidencia con XSS payload
  // Verificar que <script> se muestra como texto, NO ejecuta
  // Abrir consola → No debe haber errores
  ```

### Validación

```javascript
// Test manual en consola:
// 1. Crear incidencia con title="<img src=x onerror=alert('xss')>"
// 2. Recargar página
// 3. Visualizar feed
// ✅ Esperado: Se muestra como texto, no ejecuta alert
// ❌ Fallido: Se ejecuta el alert
```

---

## 🟠 TAREA-F02: Completar Listados Post-BUG-001 Fix

**Severidad:** Alto  
**Estimado:** 1.5 horas  
**Dependencias:** TASK-001 (BD) debe estar completado primero

### Contexto

En E4 v1.0, muchas vistas (-F) no se podían cargar porque el listado fallaba (BUG-001). Una vez que TASK-001 se complete:

- [ ] **F02.1:** Recargar frontend y verificar que vistas cargan
  ```
  CP-01-02-F: Listado de incidencias carga ✅
  CP-02-01-F: Listado con selector de estados (si implementado) carga ✅
  CP-04-01-F: Listado con comentarios carga ✅
  ```

- [ ] **F02.2:** Verificar que datos se renderizan correctamente
  - Títulos visibles
  - Prioridades muestran icono/color correcto
  - Ubicaciones muestran País/Ciudad
  - Estados muestran badge correcto

- [ ] **F02.3:** Validar paginación funciona (si se implementó)
  ```
  CP-01-04-F (implícita): "Página 1" muestra primeros 20
  Click "Próxima" → Página 2 carga datos siguientes
  ```

- [ ] **F02.4:** Verificar que filtros funcionan (si implementados)
  ```
  CP-01-14-F (E3 design): Filtro por estado, ubicación
  ```

### Criterio de Aceptación

```gherkin
Given: BD con 5+ incidencias
When: Cargar página /incidencias
Then: Listado carga sin error
And: Se muestran 5 incidencias con título, prioridad, ubicación
```

---

## 🟡 TAREA-F03: Completar Casos No Ejecutados (CP-01-03-F, CP-08-03-F, etc.)

**Severidad:** Medio  
**Estimado:** 2 horas  
**Casos a ejecutar:** CP-01-03-F, CP-08-03-F, CP-08-04-F, CP-08-05-F, CP-10-02-F, CP-10-04-F, CP-10-05-F

### CP-01-03-F: Campo Teléfono

**Contexto (E3):** Esperaba campo teléfono en formulario incidencia  
**Realidad (E4):** Teléfono es campo del usuario, no de incidencia  
**Acción:** Documentar como "No aplica — diseño E3 desactualizado"

- [ ] **F03.1:** Verificar que formulario "Nueva Incidencia" NO tiene campo teléfono
- [ ] **F03.2:** Si tiene teléfono, auditar: ¿Es del usuario logueado o de la incidencia?
- [ ] **F03.3:** Documentar decisión (es del usuario, no incidencia)

### CP-08-03-F a CP-08-05-F: Dashboard Filtros

**Contexto (E3):** Filtros por fecha, tipo, ciudad  
**Realidad (E4):** Dashboard base no tiene filtros  
**Acción:** Implementar o documentar como "No aplica"

**Opción A:** Implementar filtros (más trabajo, más valor)
- Agregar inputs: date-start, date-end, type-select, city-select
- Al cambiar, recargar stats con parámetros
- Re-ejecutar CP-08-03-F a CP-08-05-F (deben pasar)

**Opción B:** Documentar como "Fuera de alcance" (E3 desactualizado)

**Recomendación:** Opción B (por tiempo, pero Opción A sería mejor para demostración)

- [ ] **F03.4:** Decidir Opción A o B
- [ ] **F03.5:** Si Opción A: Implementar controles + validar
- [ ] **F03.6:** Si Opción B: Documentar en matriz E4 v2.1

### CP-10-02-F: Contador Caracteres

**Contexto:** Contador en vivo de caracteres en campo descripción  
**Acción:** Implementar o Skip

```javascript
// frontend/app/incidents/new.component.js
const descInput = document.getElementById('description');
const charCount = document.getElementById('char-count');

descInput.addEventListener('input', (e) => {
    const remaining = 500 - e.target.value.length;
    charCount.textContent = `${remaining} caracteres restantes`;
});
```

- [ ] **F03.7:** Implementar si falta, validar CP-10-02-F

---

## 🟡 TAREA-F04: Validar Responsive (RNF-08)

**Severidad:** Medio (E1 Requisito No Funcional)  
**Estimado:** 1 hora  
**Especificación:** Adaptable a desktop/tablet/móvil

### Validaciones Manuales

- [ ] **F04.1:** Desktop (1920x1080)
  - [ ] Feed carga correctamente
  - [ ] Dashboard visible, no hay scroll horizontal
  - [ ] Navbar no se quiebra

- [ ] **F04.2:** Tablet (768x1024)
  - [ ] Sidebar se pliega o stack vertical
  - [ ] Incidencias listado se ve completo sin scroll horizontal
  - [ ] Botones son clickeables (≥44px altura)

- [ ] **F04.3:** Móvil (375x667 — iPhone SE)
  - [ ] Sidebar ocultado, ícono hamburguesa visible
  - [ ] Cards incidencias apilan verticalmente
  - [ ] Formularios son usables en pantalla pequeña
  - [ ] No hay scroll horizontal

### Herramienta Recomendada

```bash
# Chrome DevTools → Device Emulation
# O usar Playwright + screenshot en múltiples resoluciones
```

### Criterio de Aceptación

```gherkin
Scenario: Responsive Desktop
  Given: Viewport 1920x1080
  When: Cargar feed
  Then: Se ve completo sin scroll horizontal

Scenario: Responsive Tablet
  Given: Viewport 768x1024
  When: Cargar feed
  Then: Sidebar opcional, contenido legible

Scenario: Responsive Móvil
  Given: Viewport 375x667
  When: Cargar feed
  Then: Contenido apilado verticalmente, sin scroll X
```

---

## 🟢 TAREA-F05: Optimizar Performance Dashboard (RNF-02)

**Severidad:** Bajo  
**Estimado:** 1 hora  
**Especificación:** Dashboard carga en < 3 segundos

### Validación Actual (E4)

Dashboard carga correctamente, pero sin medición de performance.

### Mediciones Recomendadas

```javascript
// frontend/app/dashboard/dashboard.component.js
const start = performance.now();
// ... fetch datos
const end = performance.now();
console.log(`Dashboard carga: ${end - start}ms`);
```

### Optimizaciones Posibles (si es lento)

1. Cachear datos en localStorage (1 minuto TTL)
2. Lazy-load gráficos (ChartJS puede ser pesado)
3. Reducir número de consultas (combinar `/api/incidents/stats` + `/api/incidents/count`)

### Validación

```bash
# Medir con Playwright:
# 1. Cargar dashboard
# 2. Cronometrar hasta que el DOM esté renderizado
# 3. Verificar: < 3 segundos (RNF-02)
```

- [ ] **F05.1:** Medir tiempo actual de carga
- [ ] **F05.2:** Si > 3s: Identificar bottleneck (API lenta? JS lento?)
- [ ] **F05.3:** Aplicar optimización
- [ ] **F05.4:** Re-medir: ≤ 3s ✅

---

## 📅 Timeline Recomendado

| Tarea | Inicio | Duración | Fin |
|---|---|---|---|
| F01 (XSS escape) | 2026-07-18 | 2h | 2026-07-18 |
| F02 (Listados post-BD) | 2026-07-18 | 1.5h | 2026-07-18 |
| F03 (Casos incompletos) | 2026-07-19 | 2h | 2026-07-19 |
| F04 (Responsive) | 2026-07-20 | 1h | 2026-07-20 |
| F05 (Performance) | 2026-07-20 | 1h | 2026-07-20 |
| **Re-test casos** | 2026-07-21 | 2h | 2026-07-21 |
| **Buffer** | 2026-07-21 | — | 2026-07-31 |

---

## 🎯 Criterios de Aceptación Global

```gherkin
Feature: Frontend E4 Completion
  
  Scenario: BUG-005 XSS No Ejecuta
    Given: Incidencia con <script> en title
    When: Visualizar en feed
    Then: Se muestra como texto "&lt;script&gt;"
    And: Consola no tiene errores
  
  Scenario: Listados Cargan Post-BD Fix
    Given: BD con datos funcionales (TASK-001 completo)
    When: Cargar /incidencias
    Then: Listado renderiza 5+ incidencias
    And: Títulos, prioridades, ubicaciones visibles
  
  Scenario: Responsive Móvil
    Given: Viewport 375x667
    When: Cargar feed
    Then: Contenido apilado, sin scroll horizontal
    And: Botones ≥ 44px clickeables
  
  Scenario: Dashboard < 3s
    Given: Dashboard con 5+ incidencias
    When: Medir time-to-interactive
    Then: Tiempo ≤ 3 segundos
```

---

**Documento generado:** 16 de julio de 2026  
**Responsable:** Integrante 1 (Frontend/UI)  
**Siguiente:** TASKS-BD-INFRA-E4.md (Integrante 3)
