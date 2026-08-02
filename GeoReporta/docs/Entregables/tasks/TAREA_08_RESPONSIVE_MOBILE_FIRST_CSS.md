# TAREA 08: Implementar Mobile-First Responsive CSS

**Asignado a:** Andy Alejandro Vera  
**Duración estimada:** 3-4 horas  
**Prioridad:** 🔴 CRÍTICO  
**Dependencia:** Ninguna (independiente)

---

## 📋 Descripción

El proyecto usa clases CSS custom (`.gr-*`, `.ici-*`) diseñadas para desktop. Falta implementar media queries y escalado fluido con `clamp()` para que el sistema sea responsive en móvil (320px → 480px → 768px → 1200px).

**Impacto actual:** Sistema ILEGIBLE en móviles < 480px.

---

## 🎯 Objetivo

Crear archivo `mobile-responsive.css` que:
1. Escale tipografía fluidamente (no breakpoints fijos)
2. Ajuste padding/margin por viewport
3. Apile elementos en móvil (botones, filtros)
4. Ensure inputs ≥ 16px (prevenir iOS auto-zoom)
5. Optimize tap targets (mínimo 44x44px)

---

## ✅ Criterios de Aceptación

- [ ] Archivo `frontend/css/mobile-responsive.css` creado
- [ ] Agregado a `index.html` ANTES de cerrar `</head>`
- [ ] Títulos escalan fluidamente con `clamp(18px, 5vw, 23px)`
- [ ] Padding ajusta: `clamp(12px, 4vw, 28px)`
- [ ] Todos inputs: `font-size: 16px` (mínimo)
- [ ] Botones: `min-height: 44px` (tap target)
- [ ] Tested en 3 breakpoints: 360px, 768px, 1200px
- [ ] No hay overflow horizontal en 320px viewport

---

## 🔧 Cómo Resolver

### PASO 1: Crear archivo CSS

Ubicación: `frontend/css/mobile-responsive.css`

**Contenido mínimo (estructura):**

```css
/* Mobile-First Responsive Improvements */

/* ─── 1. TYPOGRAPHY ─── */
.gr-page__title {
  font-size: clamp(18px, 5vw, 23px);
  line-height: 1.3;
}

.gr-breadcrumb {
  font-size: clamp(11px, 2.5vw, 13px);
}

/* ─── 2. FORMS ─── */
.form-control,
.form-select,
.ici-input,
.ici-textarea {
  font-size: 16px; /* iOS no auto-zoom */
  min-height: clamp(40px, 10vw, 42px);
}

/* ─── 3. BUTTONS ─── */
.btn,
.gr-btn-primary {
  min-height: 44px; /* WCAG tap target */
}

@media (max-width: 576px) {
  .btn {
    width: 100%;
    margin-bottom: 8px;
  }
}

/* ─── 4. PAGE LAYOUT ─── */
.gr-page {
  padding: clamp(12px, 4vw, 28px);
}

/* ─── 5. TABLES ─── */
.gr-table {
  font-size: clamp(12px, 2.5vw, 13px);
}

/* ─── 6. MAPS ─── */
.ici-map,
#map {
  height: clamp(200px, 50vh, 400px);
}

@media (max-width: 480px) {
  .ici-map {
    height: clamp(150px, 35vh, 250px);
  }
}

/* ─── 7. RESPONSIVE GRID ─── */
.form-fields {
  display: grid;
  grid-template-columns: 1fr;
  gap: clamp(12px, 2vw, 16px);
}

@media (min-width: 768px) {
  .form-fields {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* ─── 8. FILTERS ─── */
.gr-filters {
  flex-direction: column;
}

@media (min-width: 576px) {
  .gr-filters {
    flex-direction: row;
    flex-wrap: wrap;
  }
}

/* ─── 9. EMERGENCY < 360px ─── */
@media (max-width: 360px) {
  body { font-size: 14px; }
  .gr-page__title { font-size: 16px; }
  .btn { font-size: 12px; padding: 8px 12px; }
}
```

### PASO 2: Incluir en HTML

Editar: `frontend/index.html`

**Localizar línea:**
```html
<link href="/css/global.css" rel="stylesheet" />
```

**Agregar después:**
```html
<link href="/css/mobile-responsive.css" rel="stylesheet" />
```

**Orden correcto:**
```html
<!-- CSS -->
<link href="/css/freedash-layout.css" rel="stylesheet" />
<!-- Otros... -->
<link href="/css/global.css" rel="stylesheet" />
<link href="/css/mobile-responsive.css" rel="stylesheet" /> <!-- ← AGREGAR AQUÍ -->
</head>
```

### PASO 3: Usar `clamp()` en lugar de breakpoints

**Ventaja:** Escalado fluido, no saltos en breakpoints.

```css
/* ❌ VIEJO - Saltos bruscos */
.gr-page__title {
  font-size: 23px;
}
@media (max-width: 768px) {
  .gr-page__title {
    font-size: 18px;
  }
}

/* ✅ NUEVO - Escalado fluido */
.gr-page__title {
  font-size: clamp(18px, 5vw, 23px);
  /* 
    - 18px = tamaño mínimo (en 320px)
    - 5vw = escalado con viewport (cada 100px = cambio 5px)
    - 23px = tamaño máximo (en 1200px+)
  */
}
```

### PASO 4: Breakpoints clave a usar

```css
/* Teléfono pequeño (iPhone SE, Galaxy A10) */
@media (max-width: 360px) { }

/* Teléfono mediano (iPhone 12, Pixel 4) */
@media (max-width: 480px) { }

/* Teléfono grande + tablet vertical (iPad Mini) */
@media (max-width: 576px) { }

/* Tablet horizontal */
@media (min-width: 768px) { }

/* Desktop pequeño */
@media (min-width: 992px) { }

/* Desktop grande */
@media (min-width: 1200px) { }
```

### PASO 5: Inputs → 16px minimum

**Problema:** iOS Safari auto-amplía si font < 16px (mala UX)

```css
input,
textarea,
select,
.form-control,
.ici-input {
  font-size: 16px !important; /* Fuerza mínimo */
}

/* Pero en desktop, puede ser más compacto */
@media (min-width: 992px) {
  input,
  textarea,
  select {
    font-size: 14px; /* Desktop: OK ir a 14px */
  }
}
```

### PASO 6: Botones → 44x44px (tap target)

```css
button,
a[role="button"],
.btn,
.gr-btn-primary {
  min-height: 44px;
  min-width: 44px;
  padding: 12px 16px;
}

/* En móvil, hacer más grande */
@media (max-width: 576px) {
  .btn {
    min-height: 48px;
    min-width: 100%;
  }
}
```

### PASO 7: Apiler componentes en móvil

**Filtros:**
```css
.gr-filters {
  display: flex;
  flex-direction: column; /* Mobile: columna */
  gap: 12px;
}

@media (min-width: 576px) {
  .gr-filters {
    flex-direction: row;
    flex-wrap: wrap;
  }
}
```

**Grid 2-columnas → 1-columna:**
```css
.form-fields {
  display: grid;
  grid-template-columns: 1fr; /* Mobile: 1 col */
  gap: 16px;
}

@media (min-width: 768px) {
  .form-fields {
    grid-template-columns: repeat(2, 1fr); /* Desktop: 2 col */
  }
}
```

### PASO 8: Verificar en DevTools

**Chrome DevTools:**
1. Abrir DevTools (F12)
2. Click icono móvil (Ctrl+Shift+M)
3. Select viewport: **360px, 375px, 425px, 768px, 1200px**
4. Verificar:
   - ✅ Títulos legibles
   - ✅ Inputs 16px
   - ✅ Botones clicables
   - ✅ No horizontal scroll
   - ✅ Layouts apilados < 576px

---

## 🧪 Verificación

**Comando para testear:**
```bash
# Abrir en navegador con DevTools mobile
# Chrome: Inspect > Device Toolbar > Select device

# Testear en dispositivos reales si es posible
# iPhone SE (375px), Pixel 4 (412px), iPad (768px)
```

**Checklist:**
- [ ] Sin horizontal scroll en 320px
- [ ] Títulos legibles en 360px
- [ ] Inputs no auto-zoom en iOS
- [ ] Botones clicables (min 44px)
- [ ] Filtros apilados < 576px
- [ ] Tablas scrolleables pero legibles
- [ ] Maps ajustan altura (no 50vh)

---

## 📝 Notas

- `clamp()` es soporte: Chrome 79+, Safari 14+, Firefox 75+
- Si navegador viejo, fallback: media queries específicos
- Testear en DevTools (suficiente para integrador)
- No tocar `style.min.css` (FreeDash compilado)

---

## 🔗 Referencias

- MDN clamp(): https://developer.mozilla.org/en-US/docs/Web/CSS/clamp()
- WCAG Tap Targets: https://www.w3.org/WAI/WCAG21/Understanding/target-size.html
- iOS 16px rule: https://developer.apple.com/forums/thread/688104
