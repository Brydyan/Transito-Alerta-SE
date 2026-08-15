# 🎨 Frontend — Stack Tecnológico

**Migración de GeoReporta (Vanilla JS) → Transito-Alerta-SE (Angular PWA)**

---

## 📊 Comparativa: De Vanilla JS a Angular

| Aspecto | GeoReporta (Origen) | Transito-Alerta-SE (Destino) | Razón |
|--------|-------------------|--------------------------|-------|
| **Lenguaje** | JavaScript (ES6+) | TypeScript + Angular v17+ | Type safety, structural framework, PWA nativo |
| **Framework** | Vanilla JS + Vite | Angular v17+ (standalone components) | Arquitectura modular empresarial, RxJS observables |
| **Bundler** | Vite | Vite (con ng serve) | HMR rápido, build optimizado automático |
| **Styling** | CSS puro + Bootstrap | Tailwind CSS 3+ | Utility-first, PWA responsive, dark mode |
| **State Management** | Plain JS objects | RxJS BehaviorSubject + Services | Reactive, unidireccional, testing friendly |
| **Offline Storage** | localStorage | IndexedDB (idb) + Service Worker | Persistencia estructurada, sync automático |
| **Maps** | Leaflet 1.9+ | Leaflet + Angular wrapper | Mantenimiento consistente con GeoReporta |
| **Charts** | C3.js | Apache ECharts o Plotly | Moderno, reactivo, menos dependencias |
| **Image Compression** | File API | HTML5 Canvas API (nativo Angular) | WebP <200KB en cliente antes de HTTP |
| **PWA** | No / Manual | @angular/pwa + Workbox | Manifest, Service Worker, Add to Home Screen automático |
| **Testing** | Vitest + Playwright | Jest + Jest Preset Angular + Playwright | Unit + E2E, 70%+ coverage |
| **Build** | Vite build | ng build --configuration production | Optimización automática, code splitting |

---

## 🛠️ Stack Detallado

### Core Framework
```json
{
  "name": "transito-alerta-pwa",
  "version": "1.0.0",
  "engine": "node >= 20.0.0",
  "main_dependencies": {
    "@angular/core": "^17.0.0",
    "@angular/common": "^17.0.0",
    "@angular/forms": "^17.0.0",
    "@angular/platform-browser": "^17.0.0",
    "@angular/router": "^17.0.0",
    "@angular/pwa": "^17.0.0",
    "rxjs": "^7.8.0",
    "typescript": "^5.2.0",
    "zone.js": "^0.14.0"
  }
}
```

### Librerías Clave

#### 🎯 Framework & UI
- **`@angular/core`** — Core framework
- **`@angular/common`** — CommonModule, directives
- **`@angular/forms`** — ReactiveFormsModule, form validation
- **`@angular/router`** — Routing, lazy loading modules
- **`@angular/platform-browser`** — DOM rendering
- **`tailwindcss`** — Utility-first CSS (v3.0+)

#### 📍 Maps & Geolocation
- **`leaflet`** — Mapas interactivos (OpenStreetMap)
- **`leaflet-draw`** — Herramientas dibujo en mapa (opcional)
- **`@turf/helpers`** — Utilidades geoespaciales (de GeoReporta)
- **`@turf/boolean-point-in-polygon`** — Validación geofence cliente

#### 📊 Visualización de Datos
- **`echarts`** — Charts interactivos, heatmaps
- **`ngx-echarts`** — Wrapper Angular para ECharts
- O: **`plotly.js`** / **`chart.js`** (alternativas ligeras)

#### 💾 Persistencia Offline
- **`idb`** — IndexedDB wrapper para PWA
- **`@angular/pwa`** — Service Worker, manifest, install prompt
- **`workbox-window`** — Controlar Service Worker desde app

#### 🔐 HTTP & Auth
- **`@angular/common/http`** — HttpClientModule
- **`@angular/platform-browser/animations`** — Para interceptores
- JWT token management (custom service)
- Device UUID generation (nativo browser)

#### 📱 Media & Compression
- **`canvas-toBlob`** — Polyfill para Canvas.toBlob()
- **`idb-keyval`** — Key-value store simple (alternativa IndexedDB)

#### 🧪 Testing & QA
- **`jest`** — Test runner
- **`jest-preset-angular`** — Configuración Jest + Angular
- **`@angular/core/testing`** — TestBed, testing utilities
- **`@testing-library/angular`** — DOM testing
- **`@playwright/test`** — E2E testing

#### 📊 Observabilidad
- **`@sentry/angular`** — Error tracking centralizado
- **`ngx-logger`** — Logging en cliente (opcional)

#### 🚀 Build & DevTools
- **`vite`** — Bundler ultra rápido (alternativa a webpack)
- **`typescript`** — TypeScript compiler
- **`tailwind`** — CSS processing
- **`prettier`** — Code formatting
- **`eslint`** — Linting

---

## 📁 Estructura de Módulos

```
frontend/src/
├── app/
│   ├── core/                      # Servicios singleton, guards, interceptores
│   │   ├── services/
│   │   │   ├── incident.service.ts        # CRUD incidentes
│   │   │   ├── geolocation.service.ts     # Geolocalización HTML5
│   │   │   ├── offline-sync.service.ts    # IndexedDB sync
│   │   │   ├── image-compressor.service.ts # Canvas compression
│   │   │   ├── auth.service.ts            # JWT + Device UUID
│   │   │   ├── connection.service.ts      # Detección online/offline
│   │   │   └── notification.service.ts    # Toast/alerts
│   │   ├── interceptors/
│   │   │   ├── auth.interceptor.ts        # Inyectar JWT en requests
│   │   │   └── error.interceptor.ts       # Manejo errores global
│   │   ├── guards/
│   │   │   ├── auth.guard.ts              # Proteger rutas
│   │   │   └── unsaved-changes.guard.ts   # Confirmar cambios
│   │   ├── db/
│   │   │   └── indexed-db.service.ts      # Wrapper IndexedDB (cola offline)
│   │   └── models/
│   │       ├── incident.model.ts
│   │       ├── comment.model.ts
│   │       └── user.model.ts
│   │
│   ├── features/                   # Módulos por dominio (lazy-loaded)
│   │   ├── citizen-report/
│   │   │   ├── citizen-report.component.ts    # Formulario PWA
│   │   │   ├── citizen-report.component.html
│   │   │   ├── citizen-report.component.css
│   │   │   └── citizen-report.module.ts
│   │   │
│   │   ├── admin-dashboard/
│   │   │   ├── dashboard.component.ts         # Mapa de calor Leaflet
│   │   │   ├── incidents-list.component.ts    # Tabla filtrable
│   │   │   ├── status-filter.component.ts
│   │   │   └── admin-dashboard.module.ts
│   │   │
│   │   ├── auth/
│   │   │   ├── login.component.ts
│   │   │   └── auth.module.ts
│   │   │
│   │   └── map-view/
│   │       ├── map.component.ts             # Leaflet wrapper
│   │       └── map.module.ts
│   │
│   ├── shared/                    # Componentes reutilizables
│   │   ├── components/
│   │   │   ├── button/
│   │   │   ├── modal/
│   │   │   ├── badge/
│   │   │   ├── spinner/
│   │   │   └── header/
│   │   ├── pipes/
│   │   │   ├── distance.pipe.ts        # Convertir metros a km
│   │   │   └── priority.pipe.ts        # Prioridad a label
│   │   └── shared.module.ts
│   │
│   ├── app.component.ts           # Root component
│   ├── app.component.html
│   ├── app.routes.ts              # Routing configuration
│   └── app.config.ts              # Providers globales
│
├── assets/
│   ├── icons/                     # PWA icons (192x192, 512x512)
│   ├── images/
│   └── fonts/
│
├── styles/
│   ├── global.css                 # Global Tailwind
│   ├── variables.css              # CSS custom properties
│   └── responsive.css             # Mobile-first breakpoints
│
├── main.ts                        # Bootstrap
├── index.html                     # Entry HTML
├── manifest.webmanifest           # PWA manifest
└── ngsw-config.json              # Service Worker config
```

---

## 🔄 Migración desde GeoReporta

### ✅ Se Mantiene
- **Leaflet.js** para mapas (consistencia con GeoReporta)
- **@turf** helpers para geofencing cliente
- **Validaciones de negocio** (geofence en cliente)
- **Layout y UX** (formularios, dashboards, filtros)

### 🔄 Se Adapta
- **JavaScript → TypeScript** (type safety)
- **Vanilla JS DOM manipulation** → Angular @Component + template binding
- **Plain state** → RxJS Observables + BehaviorSubject
- **Vite build** → ng build (aún con Vite bajo el capó en Angular 17+)
- **localStorage** → IndexedDB (cola strutucturada)
- **Vitest/Cypress** → Jest + Playwright
- **Manual PWA** → @angular/pwa automático

### ❌ Se Remplaza
- Vanilla JS → Angular framework
- Bootstrap → Tailwind CSS (utility-first)
- C3.js charts → ECharts (moderno, reativo)
- Plain CSS → Component-scoped CSS + Tailwind
- fetch API → HttpClient de Angular

### 🆕 Se Agrega
- **Offline-First PWA**: Service Worker + Workbox (automático)
- **Real-time sync**: Queue automático en IndexedDB, retry exponencial
- **Image compression**: Canvas API nativo en Angular service
- **Reactive state**: RxJS observables para geolocalización, conexión, etc.
- **Type safety**: TypeScript decorators, interfaces, generics
- **PWA Install**: Add to Home Screen nativo (manifest + service worker)
- **Dark mode**: Tailwind dark class support
- **Sentry**: Error tracking cliente + backend

---

## 📋 Requisitos

| Requisito | Versión | Razón |
|-----------|---------|-------|
| Node.js | ≥ 20.0.0 | LTS, soporta TypeScript |
| npm | ≥ 9.0 | Gestión dependencias |
| Angular CLI | 17+ | Scaffolding y build |
| TypeScript | 5.2+ | Type safety |
| Tailwind CSS | 3.0+ | Styling utility-first |
| Modern Browser | Chrome/Firefox/Safari reciente | Service Worker, IndexedDB, Canvas API |

---

## 🚀 Setup Inicial

```bash
# Crear proyecto Angular 17+
npm create @angular@latest transito-alerta-pwa

# Navegar a proyecto
cd transito-alerta-pwa

# Instalar dependencias PWA
npm install @angular/pwa leaflet echarts ngx-echarts idb @sentry/angular

# Agregar PWA
ng add @angular/pwa

# Iniciar dev server
ng serve

# Build producción
ng build --configuration production
```

---

## ✅ Acceptance Criteria

- [ ] Angular 17+ bootstrapped con standalone components
- [ ] Tailwind CSS configurado y funcionando
- [ ] @angular/pwa integrado (manifest, service worker)
- [ ] Leaflet mapas funcionando
- [ ] IndexedDB service para offline queue
- [ ] Geolocation service funcionando
- [ ] Image compression service funcionando
- [ ] Auth interceptor + token management
- [ ] Jest + jest-preset-angular configurados (70%+ coverage)
- [ ] Playwright E2E tests funcionando
- [ ] Conexión HTTP a API NestJS (http://localhost:3001/api)
- [ ] PWA installable en Chrome/mobile
- [ ] Dark mode con Tailwind soportado
- [ ] Sentry integrado para error tracking
- [ ] Offline sync con reintento automático

---

## 🔗 Referencias

- **Angular 17 Docs:** https://angular.io/docs
- **Tailwind CSS:** https://tailwindcss.com/docs
- **Leaflet.js:** https://leafletjs.com/reference.html
- **RxJS Guide:** https://rxjs.dev/api
- **IndexedDB MDN:** https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- **Service Worker API:** https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- **PWA Checklist:** https://web.dev/progressive-web-apps/

---

**Nota:** Este frontend **es una re-arquitectura completa** del Vanilla JS de GeoReporta. Aprovecha Angular v17+ para obtener una estructura empresarial, type safety con TypeScript, offline-first PWA automático, y reactividad moderna con RxJS, manteniendo la experiencia UX y los flujos de GeoReporta intactos.