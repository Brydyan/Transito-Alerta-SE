# TAREA 10: Testing Responsive en Múltiples Dispositivos

**Asignado a:** Alisson Yamel Reyes Ricardo  
**Duración estimada:** 2-3 horas  
**Prioridad:** 🟠 ALTO  
**Dependencia:** TAREA 08 + TAREA 09 (deben completarse primero)

---

## 📋 Descripción

Después de implementar CSS responsive (T08) y optimizar componentes (T09), se deben verificar en múltiples dispositivos y breakpoints. Crearemos **checklist de testing** con capturas evidencia y reporte de bugs.

---

## 🎯 Objetivo

1. Testing manual en Chrome DevTools (360px, 480px, 768px, 1200px)
2. Testing en dispositivo real si es posible (teléfono, tablet)
3. Registrar bugs/issues encontrados
4. Capturar pantallas antes/después
5. Generar reporte: `RESPONSIVE_TEST_REPORT.md`

---

## ✅ Criterios de Aceptación

- [ ] Testing completado en 4 breakpoints mínimo
- [ ] Captura de pantalla: cada viewport, principal + detalle
- [ ] Reporte markdown con hallazgos
- [ ] 100% componentes testeados (tabla, feed, form, dashboard, sidebar)
- [ ] Bugs categorizados: CRÍTICO / ALTO / MEDIO / BAJO
- [ ] Pasos para reproducir cada bug
- [ ] Evidencia: screenshots + navegador/OS version

---

## 🔧 Cómo Resolver

### PASO 1: Configurar Chrome DevTools

**Abrir DevTools:**
```
Windows/Linux: F12
Mac: Cmd + Shift + I
```

**Activar modo responsive:**
```
Windows/Linux: Ctrl + Shift + M
Mac: Cmd + Shift + M
```

**Seleccionar devices:**
- Click desplegable "Responsive" → Select device
- Opciones: iPhone SE (375px), iPhone 12 (390px), Pixel 4 (412px), iPad (768px), Desktop (1200px+)

**O tamaños personalizados:**
- Edit → Agregar: 320px x 568px, 360px x 640px, 480px x 800px, 768px x 1024px

### PASO 2: Checklist de Componentes

**Para CADA viewport (360px, 480px, 768px, 1200px):**

```markdown
## 📱 Viewport: 360px (iPhone SE)

### Typography
- [ ] Título página legible (no < 16px)
- [ ] Breadcrumb visible sin truncado
- [ ] Párrafos > 12px

### Forms & Inputs
- [ ] Input height mínimo 40px (tap)
- [ ] Font-size ≥ 16px (no iOS zoom)
- [ ] Label visible arriba
- [ ] Botones: width 100%, height ≥ 44px
- [ ] Placeholder legible

### Navegación
- [ ] Sidebar oculto (overlay mode)
- [ ] Toggle button visible + clickeable
- [ ] Topbar no desaparece
- [ ] Breadcrumb readable

### Tables
- [ ] Sin horizontal scroll PÁGINA (OK table scroll)
- [ ] Font legible (no < 11px)
- [ ] Columnas 5+ ocultas
- [ ] Scroll hint visible ("← Desliza →")

### Feed
- [ ] Tarjetas apiladas 1 columna
- [ ] Imagen ajusta ancho (no overflow)
- [ ] Descripción max 2 líneas (clamp)
- [ ] Status badge visible

### Maps
- [ ] Altura: 150-200px (no 50vh)
- [ ] Ancho: 100% viewport
- [ ] Zoom works sin touch issues
- [ ] Marcador visible

### Dashboard
- [ ] Cards 1 columna
- [ ] Gráficos ancho 100%
- [ ] Números legibles
- [ ] Sin horizontal scroll

### Modales
- [ ] Max-width 90vw
- [ ] Scrolleable si contenido > viewport
- [ ] Close button visible (44px tap)
- [ ] Backdrop visible

## ✅ RESULTADO: [PASS / FAIL]
```

### PASO 3: Tomar Screenshots

**Por cada viewport, capturar:**

1. **Full page** (scroll completo):
   ```
   DevTools → More → Capture full page screenshot
   (guardar como: 360px-full-page.png)
   ```

2. **Components específicos:**
   - Formulario
   - Tabla
   - Feed
   - Dashboard
   - Sidebar

**Estructura carpeta:**
```
docs/screenshots/responsive/
├── 360px/
│   ├── full-page.png
│   ├── form-detail.png
│   ├── table.png
│   └── feed.png
├── 480px/
│   ├── full-page.png
│   ├── dashboard.png
│   └── ...
├── 768px/
├── 1200px/
└── RESPONSIVE_TEST_REPORT.md
```

### PASO 4: Crear Reporte

**Archivo:** `docs/Entregables/RESPONSIVE_TEST_REPORT.md`

**Estructura:**

```markdown
# Reporte de Testing Responsive

**Fecha:** 14 de julio de 2026
**Testeador:** Alisson Yamel Reyes Ricardo
**Navegador:** Chrome 121.0 (DevTools)
**Dispositivos:** 360px, 480px, 768px, 1200px

---

## 📊 Resumen Ejecutivo

| Viewport | Estado | Bugs | Notas |
|----------|--------|------|-------|
| 360px    | PASS   | 0    | OK    |
| 480px    | PASS   | 1    | Forma rota |
| 768px    | PASS   | 0    | OK    |
| 1200px   | PASS   | 0    | OK    |

**Total Issues:** 1 BAJO

---

## 🔍 Hallazgos Detallados

### ✅ PASS: Viewport 360px

**Componentes testeados:**
- [x] Typography (clamp escalando)
- [x] Forms (16px inputs, 44px botones)
- [x] Navigation (sidebar overlay OK)
- [x] Tables (scroll + columnas ocultas)
- [x] Feed (1 columna, imágenes ajustadas)

**Evidencia:**
![360px full page](../screenshots/responsive/360px/full-page.png)

---

### ⚠️ ISSUE #1: Fuga de agua en form descripción (BAJO)

**Tipo:** UI/UX
**Severidad:** 🟡 BAJO
**Componente:** Form incidencias
**Viewport afectado:** 480px

**Descripción:**
El campo textarea "descripción" en form incidencias no ajusta height en móvil, causa scroll innecesario.

**Pasos reproducir:**
1. Ir a formulario crear incidencia
2. Viewport: 480px (Pixel 4)
3. Click en textarea descripción
4. Escribir texto largo

**Comportamiento actual:**
- Textarea no expande, usuario debe scroll vertical

**Comportamiento esperado:**
- Textarea debe ser `resize: vertical` con min-height: 80px

**Pasos corregir:**
```css
/* En frontend/css/mobile-responsive.css */
.ici-textarea {
  resize: vertical;
  min-height: clamp(60px, 15vw, 120px);
}
```

**Evidencia:**
![Textarea issue](../screenshots/responsive/480px/form-detail.png)

---

### ✅ PASS: Viewport 768px (Tablet)

**Componentes testeados:**
- [x] Grid: 2 columnas (form-fields)
- [x] Tables: columnas 5+ visibles
- [x] Feed: 2 columnas
- [x] Dashboard: 2 columnas

---

### ✅ PASS: Viewport 1200px (Desktop)

**Componentes testeados:**
- [x] Grid: 3 columnas
- [x] Tables: todas las columnas
- [x] Feed: 3 columnas
- [x] Dashboard: 4 columnas

---

## 📋 Matriz de Testing

| Componente | 360px | 480px | 768px | 1200px |
|-----------|-------|-------|-------|--------|
| Typography | ✅ | ✅ | ✅ | ✅ |
| Forms | ✅ | ⚠️ | ✅ | ✅ |
| Navigation | ✅ | ✅ | ✅ | ✅ |
| Tables | ✅ | ✅ | ✅ | ✅ |
| Feed | ✅ | ✅ | ✅ | ✅ |
| Dashboard | ✅ | ✅ | ✅ | ✅ |
| Maps | ✅ | ✅ | ✅ | ✅ |
| Modales | ✅ | ✅ | ✅ | ✅ |

---

## 🐛 Bugs Encontrados (Prioridad)

### 🔴 CRÍTICO
(Ninguno)

### 🟠 ALTO
(Ninguno)

### 🟡 MEDIO
(Ninguno)

### 🟢 BAJO

1. **ISSUE #1:** Textarea no expande en 480px
   - Fix: agregar `min-height: clamp(...)`
   - Archivo: `frontend/css/mobile-responsive.css`
   - Tiempo: 5 min

---

## ✨ Mejoras Sugeridas (No Bugs)

1. **Feed cards:** agregar "leer más" si descripción > 2 líneas
2. **Dashboard:** mostrar menos gráficos en < 480px (uno por vez)
3. **Sidebar:** animación suave al togglear (transición 0.3s)

---

## 📸 Evidencia Visual

### Correctamente implementado en 360px:

![360px typing](../screenshots/responsive/360px/full-page.png)
*Arriba: Typography escala bien con clamp()*

![360px form](../screenshots/responsive/360px/form-detail.png)
*Abajo: Inputs 16px, botones 44px tap target*

### Tabla responsiva:

![360px table](../screenshots/responsive/360px/table.png)
*Tabla: columnas 5+ ocultas, scroll horizontal OK*

---

## ✅ Conclusión

**Estado:** LISTO PARA PRODUCCIÓN

- Sistema es responsive en 100% de componentes
- Solo 1 issue BAJO encontrado (textarea)
- Todos breakpoints testeados: PASS
- Sin horizontal scroll accidental
- Tap targets correctos (≥ 44px)
- Typography escalable

**Acción requerida:** Corregir Issue #1 (5 min)
**Timeline:** Completado ✅

---

**Testeado por:** Alisson Yamel Reyes Ricardo  
**Fecha:** 14 de julio de 2026  
**OK para deployment:** SÍ ✅
```

### PASO 5: Testing en Dispositivo Real (Opcional)

Si tienes teléfono:

```bash
# 1. Abrir localhost en teléfono
#    En router local: 192.168.x.x:3000
#    O usar: ngrok (forward localhost)

# 2. Instalar ngrok
npm install -g ngrok

# 3. Tunelizar frontend
ngrok http 3000
# Output: https://xxxxx.ngrok.io

# 4. Abrir en teléfono
# URL: https://xxxxx.ngrok.io

# 5. Testear en navegador móvil real
#    Chrome Mobile, Safari iOS, Firefox Mobile
```

### PASO 6: Registrar en Entregables

**Commit cambios:**
```bash
git add docs/screenshots/
git add docs/Entregables/RESPONSIVE_TEST_REPORT.md
git commit -m "Test: responsive testing report (4 viewports, 1 issue bajo)"
```

---

## 🧪 Checklist Final

- [ ] 360px viewport testeado (screenshot full-page)
- [ ] 480px viewport testeado
- [ ] 768px viewport testeado
- [ ] 1200px viewport testeado
- [ ] Tabla: scroll OK, columnas ocultas OK
- [ ] Form: inputs 16px, botones 44px
- [ ] Feed: apilado correctamente
- [ ] Dashboard: gráficos responsivos
- [ ] Sidebar: toggle works
- [ ] Modales: max-width 90vw
- [ ] Reporte markdown completo
- [ ] Screenshots en carpeta docs/screenshots/responsive/
- [ ] 0 horizontal overflow accidental
- [ ] Todos componentes PASS

---

## 📝 Notas

- Chrome DevTools = suficiente para proyecto integrador
- Dispositivo real es plus (bonus points)
- Focus en los 4 breakpoints: 360, 480, 768, 1200
- Capturar screenshots es evidencia (para documento técnico)
- Issues encontrados: registrar TODOS (crítico → bajo)
