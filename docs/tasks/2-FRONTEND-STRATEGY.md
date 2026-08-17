# 2: Estrategia de Migración Frontend — Angular v17+ PWA

## Decisión: Migrar a Angular v17+ con Tailwind CSS + IndexedDB PWA

**Esto se alinea con `frontend/TECH_STACK.md`** — Angular PWA es el stack objetivo, no rewire de Vanilla JS.

---

## Por qué Angular v17+ (No Rewire de Vanilla JS)

### Comparación de Stack

| Aspecto | Actual (GeoReporta) | Objetivo (Transito-Alerta-SE) | Beneficio |
|--------|----------------------|---------------------------|---------|
| **Framework** | Vanilla JS + Vite | Angular 17+ (standalone) | Type safety, arquitectura modular, PWA built-in |
| **Lenguaje** | JavaScript ES6+ | TypeScript 5.2+ | Type safety completo, soporte IDE, refactoring con confianza |
| **Styling** | Bootstrap 5 | Tailwind CSS 3+ | First-utility, bundle más pequeño, dark mode nativo |
| **State** | Plain JS objects | RxJS Observables | Reactivo, unidireccional, manejo async |
| **Offline** | localStorage | IndexedDB + Service Worker | Persistencia estructurada, auto-sync, PWA install |
| **Build** | Vite | ng build (Vite bajo el hood) | Splitting optimizado, lazy loading, automático |

### Rationale

1. **Arquitectura Empresarial**: Angular proporciona estructura para 16 módulos NestJS (rutas, guards, interceptors, DI)
2. **Type Safety**: Decoradores TypeScript + RxJS observables reducen bugs en escenarios complejos de offline/sync
3. **PWA First-Class**: @angular/pwa + Workbox eliminan wiring manual de Service Worker (vs Vanilla JS DIY)
4. **Sync en Tiempo Real**: RxJS + IndexedDB maneja offline-first mejor que localStorage + fetch retry
5. **Mantenibilidad**: Composición de componentes + contenedor DI escalan mejor que Vanilla JS spaghetti conforme crece la base de código
6. **Velocity del Equipo**: Scaffold con Angular CLI, patrones familiares para nuevas contrataciones (Angular es estándar de industria)

---

## Estrategia de Implementación: Migración en 3 Fases

### Fase 5A: Scaffold Angular + Servicios Principales (Semanas 4-5)
**Esfuerzo**: 4 semanas | **Riesgo**: Bajo (sigue convenciones de Angular)

**Qué**: 
- Bootstrap proyecto Angular 17+ con componentes standalone
- Implementar servicios principales (AuthService, IncidentService, GeolocationService, OfflineSyncService)
- Wiring JWT + Device UUID auth (espejando backend auth.service.ts)
- Setup RxJS observables para llamadas HTTP y state management
- Implementar IndexedDB wrapper para cola offline (librería idb)

**Aceptación**:
- [ ] Angular app bootea, routing funciona
- [ ] Flujo de autenticación: device login → JWT en sessionStorage
- [ ] Servicio de geolocalización retorna lat/lng
- [ ] Cola IndexedDB encola incidents cuando offline, sincroniza cuando online
- [ ] HTTP interceptor inyecta JWT, maneja 401 refresh + retry
- [ ] Cobertura de unit tests 70%+ (Jest + jest-preset-angular)

### Fase 5B: Features + Componentes UI (Semanas 5-6)
**Esfuerzo**: 3 semanas | **Riesgo**: Medio (complejidad UI)

**Qué**:
- Componente citizen report (form, validación de geofencing, compresión de imagen)
- Dashboard admin (mapa Leaflet, lista de incidents, filtros, ECharts)
- Actualizaciones en tiempo real (conexión Socket.io, streams RxJS)
- Detección offline (ConnectionService con RxJS subject)
- Setup Tailwind CSS utility (dark mode, responsive)
- Integración PWA (@angular/pwa manifest + service worker)

**Aceptación**:
- [ ] Citizen puede reportar incident offline, sincroniza cuando online
- [ ] Admin ve actualizaciones en tiempo real de incidents (socket.io)
- [ ] PWA instalable (Chrome, móvil)
- [ ] Toggle de dark mode funciona
- [ ] Todos los flujos CRUD probados (Playwright e2e)
- [ ] Performance: Lighthouse score >= 90

### Fase 5C: Limpieza + Polish (Semana 7)
**Esfuerzo**: 2 semanas | **Riesgo**: Bajo (testing de integración)

**Qué**:
- Servicio de compresión de imagen (Canvas API para thumbnails <200KB)
- Manejo de error + integración Sentry
- Auditoría de accesibilidad (a11y)
- Testing de móvil (iOS Safari, Android Chrome)
- Load testing (5k usuarios concurrentes via k6)

**Aceptación**:
- [ ] Upload de imagen: tamaño antes/después de compresión registrado
- [ ] Sentry error tracking funciona (errores cliente → dashboard)
- [ ] Escaneo Axe-core accessibility < 5 violaciones
- [ ] Layout móvil: sin scroll horizontal, touch targets >= 48px
- [ ] Load test: Lighthouse performance score estable bajo 5k concurrente

---

## Deep Dive Tecnológico

### Stack Frontend (de TECH_STACK.md)

**Núcleo**:
- Angular 17+ (componentes standalone, signals, control flow)
- TypeScript 5.2+
- RxJS 7.8 (Observables para state async)
- Tailwind CSS 3.0+
- Vite (herramienta build, HMR)

**Mapas & Geo**:
- Leaflet 1.9+ (wrapper @angular)
- Turf.js (validación client-side point-in-polygon)

**Offline & PWA**:
- @angular/pwa (Service Worker, manifest)
- idb (wrapper IndexedDB)
- Workbox Window (control ciclo de vida SW)

**Charts**:
- ECharts + ngx-echarts (vs C3.js, moderno & reactivo)

**Testing**:
- Jest + jest-preset-angular (unit tests)
- @testing-library/angular (DOM testing)
- Playwright (e2e, móvil)

**HTTP & Auth**:
- HttpClient + HttpInterceptor (inyección JWT, manejo de error)
- AuthService personalizado (manejo JWT, device UUID)

**Monitoring**:
- @sentry/angular (error tracking)

---

## Camino de Migración desde GeoReporta

### ✅ Mantenido (Sin Rewrite)
- Leaflet.js mapas (igual que GeoReporta, helpers turf.js reutilizados)
- Lógica de validación de geofencing (portear a servicio Angular)
- Flujos UX (citizen report, admin dashboard, filtros)

### 🔄 Adaptado
- Vanilla JS → componentes Angular (TypeScript)
- localStorage → IndexedDB (estructurado, sync-aware)
- Plain fetch → HttpClient + Interceptors
- Manual Service Worker → @angular/pwa automatizado
- Bootstrap → Tailwind CSS (utility classes)
- C3.js → ECharts (moderno, reactivo)

### ❌ Reemplazado
- Manipulación manual de DOM Vanilla JS → plantillas @Component de Angular
- Plain state objects → RxJS BehaviorSubject / Signals
- Build Vite → ng build (Vite bajo el hood, optimizaciones build Angular)

### 🆕 Agregado
- Cola offline-first (IndexedDB + exponential backoff)
- Compresión de imagen (servicio Canvas API)
- PWA install (manifest + add-to-homescreen)
- Sync en tiempo real (RxJS Subject para geolocalización, estado de conexión)
- Dark mode (Tailwind dark:class)
- Error tracking (Sentry)

## Arquitectura de Componentes (Basada en Mockups)

### Layout Principal
```
AppComponent (root)
├── SidebarComponent (nav: Dashboard, Incidencias, Usuarios, Roles, Ubicaciones, Categorías, Organizaciones, Reportar, Perfil, Mapa)
├── HeaderComponent (notificaciones, usuario dropdown, settings)
└── RouterOutlet (rutas)
```

### Componentes por Mockup

#### Dashboard (01-01-dashboard-principal.png)
- `DashboardComponent` (page container)
  - `KpiCardsComponent` (Total, En proceso, Resueltas, Pendientes, Tiempo promedio)
  - `TopCategoriesChartComponent` (ECharts horizontal bar)
  - `RecentActivityComponent` (tabla incidents recientes con status badges)
  - `WeeklyPerformanceChartComponent` (ECharts bar chart: recibidas vs resueltas)
  - `SummaryCardsComponent` (footer cards: En Línea, Crítico, Eficiencia)

#### Lista de Incidencias (02-01-lista-de-incidencias)
- `IncidentsListComponent` (page container)
  - `IncidentsFilterComponent` (search, status dropdown, priority dropdown, filter button)
  - `IncidentsTableComponent` (sortable/filtrable: title, priority badge, status badge, location, fecha, actions)
  - `PaginationComponent` (1-10 de 14)

#### Formulario Multi-paso (09-02/03/04/05)
- `IncidentReportComponent` (page container)
  - `StepperComponent` (4 pasos: 1-Información Básica, 2-Categorización, 3-Ubicación, 4-Revisión)
    - `Step1BasicInfoComponent` (title, priority, description textarea, nota importante)
    - `Step2MediaComponent` (upload image, preview con compresión)
    - `Step3LocationComponent` (mapa Leaflet interactivo, Usar mi ubicación, Lat/Lng inputs, 3 info cards)
    - `Step4ReviewComponent` (resumen datos, botón submit)

#### Gestión de Usuarios (03-01/02)
- `UsersManagementComponent` (lista con tabla)
  - `UsersTableComponent` (CRUD actions)
  - `UserFormComponent` (crear/editar modal)

#### Gestión de Roles (04-01/02)
- `RolesManagementComponent` (lista)
  - `RolesTableComponent` (CRUD)
  - `RoleFormComponent` (crear/editar)

#### Ubicaciones (06-01/02)
- `LocationsManagementComponent` (lista)
  - `LocationsMapComponent` (Leaflet con polygons)
  - `LocationFormComponent` (crear/editar)

#### Categorías (07-01)
- `CategoriesManagementComponent` (lista)
  - `CategoriesTableComponent`
  - `CategoryFormComponent`

#### Organizaciones (08-01)
- `OrganizationsManagementComponent` (lista)
  - `OrganizationsTableComponent`
  - `OrganizationFormComponent`

### Colores Tailwind (Basados en Mockups)
```
// Purples (primary)
text-purple-600, bg-purple-600, border-purple-600

// Status badges
bg-green-500 (baja), bg-blue-600 (en proceso), bg-red-500 (alta), 
bg-yellow-500 (media), bg-gray-600 (cerrada)

// Utilities
bg-gradient-to-r from-purple-600 to-purple-400 (KPI cards)
shadow-lg, rounded-lg (cards)
```

---

## Checklist de Implementación (Fase 5A-5C)

### Fase 5A: Scaffold Angular + Servicios + Layout (Semanas 4-5)

#### Bootstrap Angular 17+ & Tailwind
- [ ] Crear proyecto Angular: `ng new transito-alerta-pwa --skip-git`
- [ ] Instalar Tailwind: `npm install -D tailwindcss postcss autoprefixer`
- [ ] Init Tailwind: `npx tailwindcss init -p`
- [ ] Configurar tailwind.config.js con content paths
- [ ] Importar Tailwind en styles.css

#### SidebarComponent
- [ ] Logo + branding (purple)
- [ ] Menu items con icons: Dashboard, Incidencias, Usuarios, Roles, Ubicaciones, Categorías, Organizaciones, Reportar, Perfil, Mapa
- [ ] Routing links (routerLink)
- [ ] Active link highlight (purple)
- [ ] Colapsable en mobile (hamburger button)
- [ ] Test: click menu item → ruta cambia

#### HeaderComponent
- [ ] Logo texto "Transito-Alerta"
- [ ] Search bar (placeholder search)
- [ ] Notification bell (icon)
- [ ] Settings icon
- [ ] User dropdown (nombre, rol, logout)
- [ ] Responsive: hide search en mobile
- [ ] Test: click logout → redirect a login

#### AppComponent + Routing
- [ ] Layout: sidebar + header + outlet
- [ ] Rutas principales:
  - `/dashboard` → DashboardComponent
  - `/incidents` → IncidentsListComponent
  - `/incidents/new` → IncidentReportComponent (stepper)
  - `/users` → UsersManagementComponent
  - `/roles` → RolesManagementComponent
  - `/locations` → LocationsManagementComponent
  - `/categories` → CategoriesManagementComponent
  - `/organizations` → OrganizationsManagementComponent
  - `/profile` → ProfileComponent
  - `/map` → MapComponent
- [ ] Test: navigate between routes, layout persists

#### AuthService (JWT + Device UUID)
- [ ] Implementar login: `POST /api/auth/login {device_uuid}` → JWT en sessionStorage
- [ ] Parsing JWT: extraer `sub`, `typ`, `pv`
- [ ] Refresh token: `POST /api/auth/refresh`
- [ ] Verificación de permiso: `hasPermission('READ', 'incidents')`
- [ ] AuthGuard para rutas protegidas
- [ ] Test: device login → JWT almacenado → GET /api/me retorna permisos

#### HttpInterceptor (JWT + Error Handling)
- [ ] Auth interceptor: inyectar `Authorization: Bearer {JWT}`
- [ ] Error interceptor: 401 → refresh → reintentar
- [ ] Config base URL: `http://localhost:3001/api`
- [ ] Test: token expirado → refresh llamado → reintentar

#### GeolocationService
- [ ] Wrapper HTML5 Geolocation API
- [ ] Return Observable<{lat, lng}>
- [ ] Fallback a default location si permiso denegado
- [ ] Test: mock geolocation, verificar values

#### IndexedDB Service (Cola Offline)
- [ ] Wrapper librería `idb`
- [ ] Esquema: tabla `incidents` (id, data, synced, created_at)
- [ ] `enqueue(incident)` → persistir cuando offline
- [ ] `sync()` → POST incidents, marcar synced
- [ ] Test: offline → enqueue → online → sync → synced=true

#### Unit Tests Coverage
- [ ] AuthService tests (login, refresh, hasPermission)
- [ ] GeolocationService tests
- [ ] IndexedDB tests
- [ ] 70%+ coverage
- [ ] Jest + jest-preset-angular

**Aceptación 5A**:
- [ ] Angular app bootea, layout visible
- [ ] Rutas funcionan, layout persiste
- [ ] Login device → JWT en sessionStorage
- [ ] Geolocalización retorna lat/lng
- [ ] Cola IndexedDB encola/sincroniza
- [ ] HTTP interceptor inyecta JWT

---

### Fase 5B: Componentes UI + Real-time (Semanas 5-6)

#### DashboardComponent + KPI Cards
- [ ] Traer datos: `GET /api/incidents/stats`
- [ ] Render 5 KPI cards (color gradients: purple, cyan, green, red, purple)
- [ ] Total incidencias, En proceso, Resueltas, Pendientes, Tiempo promedio
- [ ] Mostrar deltas (↑ 8% vs mes anterior)
- [ ] Tailwind: `bg-gradient-to-r from-purple-600 to-purple-400`, `rounded-lg`, `shadow-lg`, `text-white`
- [ ] Test: datos se cargan, valores mostrados

#### TopCategoriesChartComponent (ECharts)
- [ ] Instalar: `npm install echarts ngx-echarts`
- [ ] Query: `GET /api/incidents/stats/categories?top=5`
- [ ] Horizontal bar chart (Incidencia 1-3 con values)
- [ ] Colors: azul claro/oscuro (Series)
- [ ] Test: chart renders, mouse-over tooltip muestra valores

#### RecentActivityComponent
- [ ] Query: `GET /api/incidents?limit=5&sort=-created_at`
- [ ] Tabla con columns: title, priority (badge), status (badge), location, fecha, actions menu
- [ ] Status badges: green (baja), blue (en proceso), red (alta), yellow (media), gray (cerrada)
- [ ] Click row → navigate to incident detail
- [ ] Test: tabla muestra datos, click row navega

#### WeeklyPerformanceChart (ECharts)
- [ ] Query: `GET /api/incidents/stats/weekly`
- [ ] Bar chart: días semana (Lun-Dom), recibidas vs resueltas
- [ ] Colors: purple (recibidas), green (resueltas)
- [ ] Test: chart renders, legend funciona

#### IncidentReportComponent (Multi-paso Stepper)
- [ ] StepperComponent: 4 steps (numeric indicators + labels)
- [ ] Active step highlighted en purple
- [ ] Disable next steps hasta current complete
- [ ] Show/hide steps basado en current step

**Step 1: Basic Info**
- [ ] Form fields: title, priority (dropdown), description (textarea)
- [ ] Placeholder text: "Ej. Baches en calle principal"
- [ ] Validación: title required, description min 10 chars
- [ ] Info box: "Nota importante" (grayish bg)
- [ ] Buttons: Cancelar, Siguiente Paso (purple)
- [ ] Test: form validation, next button disabled si invalid

**Step 2: Media/Categorization**
- [ ] File upload: image input + drag-drop
- [ ] Preview de imagen con tamaño/format
- [ ] Canvas API compresión: <200KB WebP
- [ ] Show before/after tamaño
- [ ] Category select dropdown
- [ ] Buttons: Anterior, Siguiente
- [ ] Test: upload image → compress → preview matches

**Step 3: Location**
- [ ] Leaflet map (satellite view)
- [ ] Click map → marker en coordenadas
- [ ] "Usar mi ubicación actual" button → GeolocationService
- [ ] Display Lat/Lng en inputs (readonly o editable)
- [ ] Zona coverage info (3 cards: GPS precision, Capa administrativa, Zonas cobertura)
- [ ] Instructions: "Haga clic en el mapa para marcar las coordenadas"
- [ ] Buttons: Anterior, Siguiente
- [ ] Test: click map → marker, geoloc button → autofill, cards show info

**Step 4: Review**
- [ ] Resumen de datos (title, priority, description, image thumbnail, lat/lng, category)
- [ ] Editar link para cada sección (back to step)
- [ ] Submit button: "Registrar Incidencia" (purple, large)
- [ ] Offline fallback: "Guardado offline" + badge
- [ ] Test: submit → POST /api/incidents, handle offline

#### IncidentsListComponent
- [ ] Page title "Incidencias"
- [ ] Filters:
  - Search input (placeholder: "Buscar por título o descripción")
  - Status dropdown (Todos los estados)
  - Priority dropdown (Todas las prioridades)
  - Filter button (purple)
  - X button para clear filters
- [ ] Table:
  - Columns: checkbox, title, priority (badge), status (badge), location (icon), fecha, actions (3-dot menu)
  - Sortable columns (click header)
  - Filterable live
  - Pagination: "Mostrando 1-10 de 14"
- [ ] Bulk actions (checkbox header): delete, bulk-assign
- [ ] Test: filter por status, sort por fecha, paginate

#### Real-time Socket.io
- [ ] Instalar socket.io-client
- [ ] Connect app init: `io('http://localhost:3001', {auth: {token}})`
- [ ] Join rooms: `geo:{zone_id}`, `org:{org_id}`
- [ ] Listen events: `incident:created`, `incident:updated`, `comment:added`, `status:changed`
- [ ] Update UI via BehaviorSubject (incident$)
- [ ] Test: 2 tabs, create incident en uno → aparece en otro en <2s

#### Dark Mode Toggle
- [ ] Toggle button (moon/sun icon) en header
- [ ] Apply `dark:` classes en Tailwind
- [ ] Persist preference en localStorage
- [ ] Test: toggle → theme changes, persists on reload

#### PWA Setup
- [ ] `ng add @angular/pwa`
- [ ] Configurar manifest.webmanifest:
  - name: "Transito Alerta"
  - description: "Control territorial en tiempo real"
  - icons: (192x192, 512x512)
  - theme_color: #7c3aed (purple)
  - background_color: #ffffff
- [ ] Service Worker strategies: network-first para /api, cache-first para assets
- [ ] Test: Chrome DevTools → Manifest válido, Install button aparece

**Aceptación 5B**:
- [ ] Dashboard carga KPIs + charts, real-time updates
- [ ] Formulario multi-paso: todos steps funcionan, submit online/offline
- [ ] Lista incidencias: filtrar, sort, paginate, real-time updates
- [ ] PWA instalable en Chrome, iOS, Android
- [ ] Dark mode toggle funciona
- [ ] Lighthouse score >= 90 (performance, accessibility, PWA)

---

### Fase 5C: Polish + Testing + Performance (Semana 7)

#### Error Tracking (Sentry)
- [ ] `npm install @sentry/angular @sentry/tracing`
- [ ] `Sentry.init()` en main.ts
- [ ] HttpErrorInterceptor: capture 5xx → Sentry
- [ ] Global ErrorHandler: unhandled Promise rejections
- [ ] Test: trigger error → Sentry dashboard

#### Image Compression Service
- [ ] Canvas API: resize → WebP
- [ ] Target <200KB
- [ ] Quality param (0.8 default)
- [ ] Test: 5MB JPG → ~150KB WebP

#### Accesibilidad
- [ ] Install axe-core: `npm install --save-dev @axe-core/core @axe-core/angular`
- [ ] Scan componentes:
  - [ ] Alt text en images
  - [ ] Contraste >= 4.5:1
  - [ ] Buttons tienen labels/aria-labels
  - [ ] Form labels linked
  - [ ] Color no solo indicador
- [ ] Objetivo: < 5 violations
- [ ] Test: Lighthouse accessibility >= 90

#### Mobile Testing (iOS Safari, Android Chrome)
- [ ] Geolocation: funciona ambas plataformas
- [ ] Cola offline: enqueu/sync
- [ ] PWA install: ambas plataformas
- [ ] Touch targets: >= 48px
- [ ] Sin scroll horizontal
- [ ] Keyboard navigation: form inputs navegables

#### Performance Baseline
- [ ] Medir Lighthouse score (target >= 90)
- [ ] Time-to-interactive (TTI) < 3s
- [ ] Bundle size < 500KB gzipped
- [ ] Core Web Vitals:
  - LCP (Largest Contentful Paint) < 2.5s
  - FID (First Input Delay) < 100ms
  - CLS (Cumulative Layout Shift) < 0.1
- [ ] Load test: k6 5k concurrent usuarios

#### E2E Tests (Playwright)
- [ ] Scenario 1: Device login → JWT → view dashboard
- [ ] Scenario 2: Crear incident offline → guardar IndexedDB
- [ ] Scenario 3: Online, crear incident → POST → lista actualiza en real-time
- [ ] Scenario 4: Mobile login → geoloc → submit incident
- [ ] All 4 scenarios pasando

**Aceptación 5C**:
- [ ] Sentry error tracking funciona
- [ ] Image compression <200KB
- [ ] Axe scan < 5 violations (a11y)
- [ ] Lighthouse >= 90 (performance, a11y, PWA)
- [ ] iOS/Android: geoloc, offline, PWA, touch targets OK
- [ ] Bundle < 500KB gzipped
- [ ] E2E tests 4/4 passing
- [ ] TTI < 3s, LCP < 2.5s

---

## Mejoras Visuales Integradas (vs GeoReporta)

| Aspecto | GeoReporta | Transito-Alerta | Beneficio |
|---------|-----------|-----------------|-----------|
| **Colores** | Bootstrap blue/green | Purple primary + tailored badges | Diferenciación visual clara, brand consistency |
| **Typography** | Default | Tailwind font-family stack | Professional, legible en mobile |
| **Spacing** | Inconsistent | Tailwind spacing scale (px-4, py-8) | Consistent visual rhythm |
| **Shadows** | Basic | Tailwind shadow-lg on cards | Depth, modern look |
| **Dark Mode** | No | Tailwind dark: | Accessibility, user preference |
| **Icons** | Mixed | Heroicons consistent | Unified visual language |
| **Charts** | C3.js | ECharts (moderno, reactivo) | Better interactivity, animations |
| **Maps** | Leaflet | Leaflet + satellite layer | Rich geofencing context |
| **Responsive** | Bootstrap grid | Tailwind grid + mobile-first | Better mobile UX |
| **Forms** | Bootstrap forms | Tailwind + reactive forms | Type-safe, real-time validation |

---

## Criterios de Éxito (Fase 5 Completa)

- [ ] Angular app bootea con auth, geolocalización, cola offline
- [ ] Todos los flujos CRUD funciona (incident create/read/update, comment, assignment)
- [ ] Actualizaciones en tiempo real via Socket.io (< 2s latencia incident.created a UI)
- [ ] Offline-first: encolar incidents, sincronizar cuando online
- [ ] PWA instalable: Chrome, iOS Safari, Android Chrome
- [ ] 70%+ cobertura de tests (Jest)
- [ ] Playwright e2e tests pasando (4 workflows)
- [ ] Lighthouse >= 90 (performance, accessibility, PWA)
- [ ] Responsive móvil (sin scroll horizontal, touch targets >= 48px)

---

## Comparación: Plan Original vs Ajustado

| Original Rec | Ajustado | Razón |
|---|---|---|
| Vanilla JS + Vite (más rápido) | Angular 17+ (mejor a largo plazo) | TECH_STACK.md ya se commit a Angular. Arquitectura empresarial > velocidad a corto plazo. |
| Entrega Semana 6 | Entrega Semana 7 | +1 semana aceptable para type safety + beneficios PWA |
| Sin reentrenamiento de equipo | Ramp de 2-3 semanas (Angular) | Angular es estándar de industria, ROI en mantenibilidad |

---

## Ajuste de Cronograma

**Fase 5 (revisada)**:
- Semanas 4-5: Scaffold Angular + servicios principales + cola offline (5A)
- Semanas 5-6: Features + UI + tiempo real (5B)
- Semana 7: Limpieza + polish + testing (5C)
- **Entrega**: Semana 7 (fue semana 6, +1 semana)

**Cronograma General de Migración**:
- Fases 1-4 (backend): Semanas 1-6 (sin cambios)
- Fase 5 (frontend): Semanas 4-7 (paralelo a Fase 4 del backend, +1 semana)
- Fase 6-8 (integración + rollout): Semanas 7-12 (ajustada por +1 semana)

**Entrega Final**: Semana 12 (sin cambios en ventana general de 12 semanas)
