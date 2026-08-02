# TAREA 09: Optimizar Tablas y Componentes para Móvil

**Asignado a:** Yandris Miguel Rivera Torres  
**Duración estimada:** 2-3 horas  
**Prioridad:** 🟠 ALTO  
**Dependencia:** TAREA 08 (debe completarse primero)

---

## 📋 Descripción

Las tablas (`.gr-table`) y componentes principales (feed, dashboard, listados) están diseñados para desktop. En móvil < 576px, son ilegibles. Deben ajustarse:
- Tablas: scroll horizontal + columnas ocultas
- Feed: tarjetas compactas
- Dashboard: gráficos responsivos
- Componentes: padding/margin reducido

---

## 🎯 Objetivo

1. Tablas responsivas: scroll en móvil, columnas ocultas < 576px
2. Feed de incidencias: tarjetas apiladas, info comprimida
3. Dashboard: gráficos ajustan ancho, no overflow
4. Componentes (modal, card): padding fluido

---

## ✅ Criterios de Aceptación

- [ ] `.gr-table` scrolleable sin horizontal overflow página
- [ ] Columnas 5+ ocultas en `@media (max-width: 576px)`
- [ ] Feed tarjetas apiladas 1 columna < 576px
- [ ] Dashboard gráficos ancho 100% en móvil
- [ ] Modales respetan viewport (max-width: 90vw)
- [ ] Cards padding ajustable: `clamp(12px, 3vw, 24px)`
- [ ] Tested en 360px, 576px, 992px

---

## 🔧 Cómo Resolver

### COMPONENTE 1: Tablas Responsivas

**Archivo a editar:** `frontend/css/mobile-responsive.css` (agregar al final)

**Código:**

```css
/* ═════════════════════════════════════════════════
   TABLAS RESPONSIVAS
   ═════════════════════════════════════════════════ */

/* Base: tabla scrolleable en móvil */
.gr-table-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch; /* Smooth iOS */
  border-radius: clamp(8px, 2vw, 14px);
}

.gr-table {
  font-size: clamp(12px, 2.5vw, 13px);
  min-width: 100%;
}

.gr-table thead th {
  font-size: clamp(10px, 2vw, 11px);
  padding: clamp(10px, 1.5vw, 16px) clamp(6px, 1vw, 12px);
  white-space: nowrap; /* Evita wrapping en header */
}

.gr-table tbody td {
  padding: clamp(8px, 1.5vw, 13px) clamp(6px, 1vw, 12px);
}

/* En móvil: esconder columnas no-críticas (5+) */
@media (max-width: 576px) {
  /* Mostrar solo primeras 4 columnas */
  .gr-table th:nth-child(n+5),
  .gr-table td:nth-child(n+5) {
    display: none;
  }

  /* Reducir tamaño fuente más */
  .gr-table {
    font-size: 11px;
  }

  .gr-table thead th {
    font-size: 9px;
    padding: 8px 4px;
  }

  .gr-table tbody td {
    padding: 6px 4px;
  }

  /* Agregar hint: "scroll para más" */
  .gr-table-wrap::after {
    content: "← Desliza para ver más →";
    display: block;
    font-size: 10px;
    color: #999;
    text-align: center;
    padding: 6px 0;
  }
}

/* En desktop: ancho normal */
@media (min-width: 992px) {
  .gr-table th:nth-child(n+5),
  .gr-table td:nth-child(n+5) {
    display: table-cell; /* Mostrar todas */
  }
}

/* Striped rows visible en móvil */
.gr-table tbody tr:nth-child(even) {
  background: #fafbfd;
}

.gr-table tbody tr:hover {
  background: #f5f7ff;
}
```

### COMPONENTE 2: Feed Responsivo

**Archivo:** `frontend/app/feed/feed.component.css` (crear o actualizar)

**Código:**

```css
/* ═════════════════════════════════════════════════
   FEED RESPONSIVO
   ═════════════════════════════════════════════════ */

.feed-container {
  display: grid;
  grid-template-columns: 1fr; /* Mobile: 1 col */
  gap: clamp(12px, 3vw, 16px);
  padding: clamp(12px, 4vw, 24px);
}

/* Tablet: 2 columnas */
@media (min-width: 576px) {
  .feed-container {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Desktop: 3 columnas */
@media (min-width: 992px) {
  .feed-container {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* Tarjeta individual */
.feed-card {
  border-radius: clamp(8px, 2vw, 12px);
  padding: clamp(12px, 3vw, 16px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: transform 0.2s, box-shadow 0.2s;
}

.feed-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

/* Título tarjeta */
.feed-card__title {
  font-size: clamp(14px, 4vw, 16px);
  font-weight: 600;
  margin: 0 0 8px;
  line-height: 1.3;
}

/* Descripción */
.feed-card__desc {
  font-size: clamp(12px, 2.5vw, 13px);
  color: #666;
  margin: 0 0 10px;
  line-height: 1.4;
}

/* Status badge */
.feed-card__status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: clamp(10px, 2vw, 11px);
  padding: 4px 8px;
  border-radius: 12px;
  font-weight: 600;
}

/* Meta (fecha, ubicación) */
.feed-card__meta {
  font-size: clamp(9px, 2vw, 10px);
  color: #999;
  margin-top: 8px;
}

/* En móvil: esconder avatar grande */
@media (max-width: 480px) {
  .feed-card__avatar {
    width: 32px !important;
    height: 32px !important;
  }

  .feed-card__desc {
    display: -webkit-box;
    -webkit-line-clamp: 2; /* Max 2 líneas */
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}
```

### COMPONENTE 3: Dashboard Responsivo

**Archivo:** `frontend/app/dashboard/pages/dashboard/dashboard.component.css` (actualizar)

**Código:**

```css
/* ═════════════════════════════════════════════════
   DASHBOARD RESPONSIVO
   ═════════════════════════════════════════════════ */

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: clamp(12px, 3vw, 20px);
  padding: clamp(12px, 4vw, 24px);
}

/* En móvil: 1 columna */
@media (max-width: 480px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}

/* Tablet: 2 columnas */
@media (min-width: 576px) and (max-width: 991px) {
  .dashboard-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Desktop: 4 columnas */
@media (min-width: 992px) {
  .dashboard-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* Card individual */
.dashboard-card {
  background: white;
  border-radius: clamp(8px, 2vw, 12px);
  padding: clamp(14px, 3vw, 20px);
  border: 1px solid #e5e7eb;
}

.dashboard-card__title {
  font-size: clamp(12px, 3vw, 14px);
  color: #666;
  font-weight: 500;
}

.dashboard-card__value {
  font-size: clamp(20px, 6vw, 32px);
  font-weight: 700;
  margin: 8px 0;
}

/* Gráficos (C3.js, Charts) */
#chart-estados,
#chart-timeline,
.chart-container {
  width: 100%;
  height: auto;
  max-width: 100%;
}

/* C3.js: forzar responsive */
.c3 {
  width: 100% !important;
}

.c3 svg {
  max-width: 100%;
  height: auto;
}

/* En móvil: gráficos más pequeños */
@media (max-width: 576px) {
  .dashboard-card {
    padding: 12px;
  }

  .dashboard-card__value {
    font-size: 20px;
  }

  /* Gráficos: reducir altura */
  #chart-estados {
    height: 200px !important;
  }

  /* Esconder labels pequeños */
  .c3-axis-y text,
  .c3-axis-x text {
    font-size: 10px;
  }
}
```

### COMPONENTE 4: Modales y Cards

**Agregar a `frontend/css/mobile-responsive.css`:**

```css
/* ═════════════════════════════════════════════════
   MODALES, CARDS, OFFCANVAS
   ═════════════════════════════════════════════════ */

.modal-content {
  border-radius: clamp(8px, 2vw, 16px);
  max-width: 90vw; /* No más de 90% ancho viewport */
}

.modal-header,
.modal-body,
.modal-footer {
  padding: clamp(12px, 3vw, 20px);
}

@media (max-width: 480px) {
  .modal-dialog {
    margin: 10px;
  }

  .modal-content {
    border-radius: 12px;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-body {
    padding: 12px;
    font-size: 14px;
  }
}

/* Cards generales */
.card {
  border-radius: clamp(8px, 2vw, 14px);
  padding: clamp(12px, 3vw, 20px);
  margin-bottom: clamp(12px, 3vw, 16px);
}

.card-header {
  padding: clamp(10px, 2vw, 16px);
}

.card-body {
  padding: clamp(10px, 2vw, 16px);
}

/* Offcanvas (sidebar mobile) */
.offcanvas {
  border-radius: clamp(8px, 2vw, 16px);
  width: 85vw; /* 85% ancho en móvil */
  max-width: 350px;
}

@media (min-width: 768px) {
  .offcanvas {
    width: 400px; /* Más ancho en tablet */
  }
}
```

---

## 🧪 Verificación

**En Chrome DevTools:**

1. Abrir DevTools (F12)
2. Dispositivo Toolbar (Ctrl+Shift+M)
3. Probar viewports: 360px, 480px, 576px, 768px, 992px
4. Verificar:
   - [ ] Tablas: sin overflow horizontal
   - [ ] Columnas 5+: ocultas < 576px
   - [ ] Feed: 1 col móvil, 2+ tablet
   - [ ] Dashboard: gráficos ajustan ancho
   - [ ] Modales: max-width 90vw
   - [ ] Texto legible sin zoom manual

**Comando verificar CSS:**
```bash
# Verificar que CSS se cargó
curl -s http://localhost:3000 | grep "mobile-responsive"
```

---

## 📝 Notas

- No modificar `style.min.css` (FreeDash compilado)
- Usar `display: none` para esconder (no `visibility: hidden`)
- `-webkit-overflow-scrolling: touch` = smooth scroll iOS
- `-webkit-line-clamp` = truncar texto (no universal, OK para móvil)
- Testear en navegador + DevTools (suficiente)

---

## 🔗 Referencias

- CSS Grid responsive: https://web.dev/learn/css/grid/
- Media queries: https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries
- C3.js responsive: https://c3js.org/gettingstarted/generated_gists.html
