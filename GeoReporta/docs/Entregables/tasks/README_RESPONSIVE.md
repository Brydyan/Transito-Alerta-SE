# 📱 Tareas de Responsive Design

Implementación de mobile-first responsive design para mejorar la experiencia de usuario en dispositivos móviles.

---

## 🎯 Visión General

**Problema:** Sistema actual es desktop-only, ilegible en móviles < 480px.

**Solución:** Implementar 3 tareas en paralelo/secuencial:

```
TAREA 08 (Andy)              TAREA 09 (Yandris)            TAREA 10 (Alisson)
──────────────────────       ──────────────────────        ──────────────────────
Mobile-First CSS             Responsive Components        Testing & Validation
(3-4 horas)                  (2-3 horas)                   (2-3 horas)
Prerrequisito: Ninguno       Prerrequisito: T08            Prerrequisito: T08+T09

📄 Create CSS               📐 Update Components           ✅ Test all viewports
• clamp() scaling           • Tables responsive            • 360px, 480px, 768px, 1200px
• Media queries             • Feed grid                    • Screenshot evidence
• Tap targets (44px)        • Dashboard responsive         • Bug report
• Inputs 16px (iOS)         • Modals max-width             • Reporte markdown
```

---

## 📋 Tareas Detalladas

### TAREA 08: Mobile-First Responsive CSS (Andy)

**Archivo:** `TAREA_08_RESPONSIVE_MOBILE_FIRST_CSS.md`

**Objetivo:** Crear `frontend/css/mobile-responsive.css`

**Alcance:**
- ✅ Tipografía escalable con `clamp()`
- ✅ Padding/margin responsivos
- ✅ Inputs mínimo 16px (iOS)
- ✅ Botones mínimo 44x44px (tap target)
- ✅ Media queries 6 breakpoints
- ✅ Grids responsive (1col → 2col → 3col)
- ✅ Maps altura ajustable

**Entrega:** 
- Archivo `mobile-responsive.css` creado
- Incluido en `index.html`
- Testeado en 4 viewports

**Estimación:** 3-4 horas

---

### TAREA 09: Responsive Tablas y Componentes (Yandris)

**Archivo:** `TAREA_09_RESPONSIVE_TABLAS_COMPONENTES.md`

**Objetivo:** Optimizar componentes principales

**Alcance:**
- ✅ Tablas: scroll horizontal + columnas ocultas
- ✅ Feed: grid responsive (1 → 2 → 3 col)
- ✅ Dashboard: gráficos ajustables
- ✅ Modales: max-width 90vw
- ✅ Cards: padding fluido
- ✅ Sidebar: offcanvas en móvil

**Entrega:**
- CSS updates en componentes
- Nuevas media queries
- Tested en Chrome DevTools

**Estimación:** 2-3 horas

---

### TAREA 10: Testing Responsive (Alisson)

**Archivo:** `TAREA_10_TESTING_RESPONSIVE_DISPOSITIVOS.md`

**Objetivo:** Validar responsive en múltiples dispositivos

**Alcance:**
- ✅ Testing 4 viewports: 360px, 480px, 768px, 1200px
- ✅ Checklist componentes (tabla, form, feed, dashboard)
- ✅ Screenshots evidencia
- ✅ Bug report categorizado
- ✅ Reporte markdown: `RESPONSIVE_TEST_REPORT.md`
- ✅ Evidencia visual para documento técnico

**Entrega:**
- `docs/Entregables/RESPONSIVE_TEST_REPORT.md`
- Screenshots en `docs/screenshots/responsive/`
- Bugs registrados con pasos reproducir

**Estimación:** 2-3 horas

---

## 🔀 Flujo de Dependencias

```
TAREA 08 (INDEPENDIENTE)
   ↓
   └─→ TAREA 09 (necesita T08)
        ↓
        └─→ TAREA 10 (necesita T08+T09)
```

**Timeline recomendado:**

| Día | Andy (T08) | Yandris (T09) | Alisson (T10) |
|-----|-----------|--------------|--------------|
| 1   | Crear CSS | Esperar T08  | Esperar T08+T09 |
| 2   | Terminar CSS | Start T09 | Esperar T09 |
| 3   | Review/Fix | Terminar T09 | Start testing |
| 4   | Merge | Review/Fix | Finish testing |

**Paralelización:** T09 puede empezar 4h después de T08 iniciada.

---

## 📊 Checklist Integración

**Antes de empezar:**
- [ ] Clonar repositorio `develop` branch
- [ ] Instalar dependencias (`npm install`)
- [ ] Levantar frontend: `npm run dev` o `php -S localhost:3000`
- [ ] Verificar funcionamiento actual
- [ ] Abrir Chrome DevTools (F12)

**Durante trabajo:**
- [ ] Crear branch feature: `git checkout -b responsive/mobile-first`
- [ ] Commit frecuente: `git commit -m "feat(responsive): agregar clamp() tipografía"`
- [ ] Push a rama: `git push origin responsive/mobile-first`

**Antes de PR:**
- [ ] Todo testeado en DevTools
- [ ] Sin horizontal scroll en 320px
- [ ] Todos componentes en checklist ✅
- [ ] Commit message claro
- [ ] Screenshots agregadas

**Merge:**
- [ ] Esperar review de compañeros
- [ ] Resolver comentarios
- [ ] Merge a `develop`
- [ ] Delete branch feature

---

## 🧪 Testing Quick Start

**Abrir DevTools responsive:**
```
F12 → Ctrl+Shift+M (Windows)
F12 → Cmd+Shift+M (Mac)
```

**Viewports a probar:**
```
360px   → iPhone SE, Galaxy A10 (pequeños)
480px   → iPhone 12, Pixel 4 (medianos)
768px   → iPad Mini (tablet)
1200px+ → Desktop (monitor)
```

**Checklist minimal por viewport:**
- [ ] Texto legible (sin zoom manual)
- [ ] Inputs 16px (mínimo)
- [ ] Botones clickeables (44px+)
- [ ] Sin horizontal scroll (excepto tablas)
- [ ] Imágenes ajustadas ancho

---

## 📁 Estructura Archivos

```
frontend/
├── css/
│   ├── global.css (EXISTENTE - no modificar base)
│   ├── variables.css (EXISTENTE)
│   ├── freedash-layout.css (EXISTENTE - compilado)
│   ├── mobile-responsive.css (CREAR - T08)
│   └── [component].css (UPDATE - T09)
├── app/
│   ├── feed/feed.component.css (UPDATE - T09)
│   ├── dashboard/.../dashboard.component.css (UPDATE - T09)
│   └── incidencias/.../incidencias.form.component.css (UPDATE - T09)
└── index.html (UPDATE - agregar link mobile-responsive.css)

docs/
├── screenshots/responsive/ (CREATE - T10)
│   ├── 360px/ (screenshots folder)
│   ├── 480px/
│   ├── 768px/
│   └── 1200px/
└── Entregables/
    ├── RESPONSIVE_TEST_REPORT.md (CREATE - T10)
    └── tasks/
        ├── TAREA_08_RESPONSIVE_MOBILE_FIRST_CSS.md
        ├── TAREA_09_RESPONSIVE_TABLAS_COMPONENTES.md
        ├── TAREA_10_TESTING_RESPONSIVE_DISPOSITIVOS.md
        └── README_RESPONSIVE.md (este archivo)
```

---

## 🔗 Referencias Técnicas

- **CSS `clamp()`:** https://developer.mozilla.org/en-US/docs/Web/CSS/clamp()
- **Media Queries:** https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries
- **WCAG Tap Targets:** https://www.w3.org/WAI/WCAG21/Understanding/target-size.html
- **iOS 16px rule:** https://developer.apple.com/forums/thread/688104
- **Bootstrap 5 Grid:** https://getbootstrap.com/docs/5.0/layout/grid/

---

## 💡 Tips & Tricks

**DevTools shortcuts:**
```
F12                    → Open DevTools
Ctrl+Shift+M           → Toggle responsive mode
Ctrl+Shift+C           → Select element
Right-click → Inspect  → Inspect element
```

**CSS debugging:**
```css
/* Agregar borders temporales para ver layouts */
.gr-page {
  border: 1px solid red; /* debug */
}

/* Luego remover */
```

**Viewport testing Chrome:**
```
Ctrl+Shift+M → Click "Responsive" dropdown
→ "Edit..." → agregar custom: 320x568, 360x640, etc.
```

**Common issues:**
- Input auto-zoom iOS: agrega `font-size: 16px`
- Horizontal scroll accidental: check max-width, overflow
- Buttons no clickeables: check min-height: 44px
- Texto pequeño: usa `clamp()` o media queries

---

## 🎯 Definición de Hecho (DoD)

### T08 - HECHO cuando:
- [ ] `mobile-responsive.css` existe y es válido
- [ ] Incluido en `index.html` (orden correcto)
- [ ] Testeado en 4 viewports: 360, 480, 768, 1200px
- [ ] 0 horizontal scroll en 320px
- [ ] Todos inputs ≥ 16px
- [ ] Todos botones ≥ 44px height
- [ ] Commit con mensaje claro
- [ ] Code reviewed por compañero

### T09 - HECHO cuando:
- [ ] Componentes testeados (tabla, feed, dashboard, modal)
- [ ] Tablas: scroll + columnas ocultas en <576px
- [ ] Feed: 1col móvil, 2+ tablet, 3 desktop
- [ ] Dashboard: gráficos responsivos
- [ ] Modales: max-width 90vw
- [ ] Testeado en DevTools (completo)
- [ ] Commit mensaje describe cambios
- [ ] Code reviewed

### T10 - HECHO cuando:
- [ ] Testing completado: 4 viewports
- [ ] Screenshots en carpeta (organizadas)
- [ ] Reporte markdown generado
- [ ] Todos componentes en matriz testing ✅
- [ ] Bugs categorizados + pasos reproducir
- [ ] Evidencia visual para documento técnico
- [ ] 0 bloqueadores encontrados
- [ ] Listo para deployment

---

## 📞 Soporte

**Dudas sobre CSS:**
- Revisar MDN + referencias links
- Preguntar al grupo (Slack/Discord)
- Consultar compañeros

**Problema con DevTools:**
- Chrome: F12 → Settings → Devices → agregar custom viewport
- Firefox: F12 → Responsive Design Mode
- Safari: Develop → Enter Responsive Design Mode

**Issue en testing:**
- Registrar en issue tracker (GitHub/Trello)
- Incluir: viewport, navegador, pasos reproducir, screenshot
- Asignar a developer correspondiente

---

## 🚀 Deployment

Una vez completadas 3 tareas:

```bash
# 1. Merge a develop
git checkout develop
git merge responsive/mobile-first

# 2. Build para producción
npm run build

# 3. Verificar en browser
npm run preview  # o docker-compose up

# 4. Testing final en 4 viewports

# 5. Deploy
# (según proceso de tu proyecto)
```

---

**Fecha de inicio:** 14 de julio de 2026  
**Deadline estimado:** 18 de julio de 2026  
**Equipo:** Andy + Yandris + Alisson  
**Status:** 📋 Planificado

¡Buena suerte! 🎯
