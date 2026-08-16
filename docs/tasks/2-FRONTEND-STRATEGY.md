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

## Checklist de Implementación (Fase 5A-5C)

### Fase 5A: Scaffold Angular + Servicios

#### Bootstrap Angular 17+
- [ ] Crear proyecto Angular: `npm create @angular@latest transito-alerta-pwa --skip-install --skip-git`
- [ ] Instalar núcleo: `@angular/core@17`, `@angular/common@17`, `@angular/forms@17`, `@angular/router@17`
- [ ] Instalar RxJS: `rxjs@7.8`
- [ ] Instalar TypeScript: `typescript@5.2`
- [ ] Configurar componentes standalone (remover NgModule si usar arquitectura basada en signals)

#### Servicio de Autenticación
- [ ] Implementar `AuthService` (espeja backend T1.4):
  - Registro de dispositivo: `POST /api/auth/login {device_uuid}` → almacenar JWT en sessionStorage
  - Parsing de JWT: extraer claims `sub`, `typ`, `pv`
  - Refresh de token: `POST /api/auth/refresh` → rotar refresh token, lista negra viejo jti
  - Verificación de permiso: `hasPermission('READ', 'incidents')`
- [ ] Http Interceptor: auto-inyectar JWT en todas las solicitudes, manejar 401 con refresh + retry
- [ ] Test: device login → JWT issuado → GET /api/me retorna permisos

#### Servicio de Geolocalización
- [ ] Wrapper sobre HTML5 Geolocation API
- [ ] Retornar Observable<{lat, lng}> (patrón RxJS)
- [ ] Fallback a ubicación por defecto del navegador si permiso denegado
- [ ] Test: Playwright mock geolocalización, verificar valores pasados al form de incident

#### Servicio IndexedDB (Cola Offline)
- [ ] Wrapper usando librería `idb` (no API cruda de IndexedDB)
- [ ] Esquema: tabla `incidents` (id, data, synced, created_at)
- [ ] Método enqueue: persistir incident a IndexedDB cuando offline
- [ ] Método sync: cuando online, POST todos los incidents en cola, marcar como synced
- [ ] Test: encolar incident offline → ir online → POST llamado → synced = true

#### HTTP Interceptor
- [ ] Auth interceptor: agregar header `Authorization: Bearer {JWT}`
- [ ] Error interceptor: 401 → refresh token → reintentar solicitud
- [ ] Config base URL: todas las solicitudes a `http://localhost:3001/api`
- [ ] Test: token expirado → refresh llamado → solicitud reintentada con token nuevo

### Fase 5B: Features + UI

#### Componente Citizen Report
- [ ] Form reactiva: title, description, location (lat/lng), priority, category
- [ ] Campo upload de imagen + preview de compresión (Canvas API)
- [ ] Botón geolocalización: popular lat/lng via GeolocationService
- [ ] Verificación de geofence: validación client-side (Turf.js point-in-polygon)
- [ ] Lógica de submit:
  - Si online: POST a backend inmediatamente
  - Si offline: encolar en IndexedDB, notificar usuario "saved offline"
  - En reconnect: sincronizar cola via OfflineSyncService
- [ ] Test: Playwright reportar incident, verificar HTTP POST o cola IndexedDB

#### Dashboard Admin
- [ ] Mapa Leaflet: mostrar todos los incidents como pins, color por status (pending=rojo, in_progress=amarillo, resolved=verde)
- [ ] Tabla de incidents: sortable por created_at/priority/status, filtrable por zone/status
- [ ] Actualizaciones en tiempo real: conexión Socket.io a namespace `/incidents`, suscribirse a salas (geo/org)
- [ ] Charts: gráfico de barras ECharts (incidents por status), heatmap (distribución geo)
- [ ] Test: Playwright crear incident → aparece en mapa + tabla instantáneamente

#### Real-time Socket.io
- [ ] Conectar en app init: `io('http://localhost:3001', {auth: {token: JWT}})`
- [ ] Unirse a salas: `geo:{zone_id}`, `user:{user_id}` (server auto-join)
- [ ] Escuchadores de evento: `incident:created`, `incident:assigned`, `comment:added`, `status:changed`
- [ ] Actualizar state via RxJS Subject (observable incident$)
- [ ] Test: 2 navegadores, crear incident en uno → evento recibido en otro

#### Setup Tailwind CSS
- [ ] Instalar: `npm install -D tailwindcss postcss autoprefixer`
- [ ] Init: `npx tailwindcss init -p`
- [ ] Configurar content paths (todos los archivos .component.html)
- [ ] Importar Tailwind en `styles.css`: `@tailwind base; @tailwind components; @tailwind utilities;`
- [ ] Dark mode: actualizar tailwind.config.js `darkMode: 'class'`
- [ ] Test: toggle button dark/light funciona

#### Integración PWA
- [ ] Instalar @angular/pwa: `ng add @angular/pwa`
- [ ] Configurar `manifest.webmanifest` (nombre app, iconos, colores tema)
- [ ] Setup estrategia de caché de Service Worker (Workbox)
- [ ] Test: Chrome DevTools → Application → Manifest válido. Botón Install aparece.

### Fase 5C: Limpieza + Polish

#### Compresión de Imagen
- [ ] Servicio Canvas API: comprimir imagen a <200KB WebP
- [ ] Mostrar preview antes de upload (data URL base64)
- [ ] Test: upload JPG 5MB → comprimir a ~150KB → preview matches

#### Error Tracking (Sentry)
- [ ] Instalar: `npm install @sentry/angular`
- [ ] Integrar: `Sentry.init()` en main.ts
- [ ] HttpErrorInterceptor: capturar errores 5xx → Sentry
- [ ] ErrorHandler: catch unhandled Promise rejections
- [ ] Test: disparar error en componente → aparece en dashboard Sentry

#### Accesibilidad
- [ ] Ejecutar escaneo Axe-core: `npm install --save-dev @axe-core/react`
- [ ] Fix: falta de alt text, contraste bajo, labels faltantes
- [ ] Objetivo: < 5 violaciones (Lighthouse accessibility >= 90)

#### Testing de Móvil
- [ ] iOS Safari: testear geolocalización, cola offline, PWA install
- [ ] Android Chrome: testear touch targets (>= 48px), sin scroll horizontal
- [ ] Config móvil Playwright: testear ambas plataformas en CI

#### Baseline de Performance
- [ ] Medir Lighthouse score (objetivo >= 90)
- [ ] Medir time-to-interactive (TTI) < 3s
- [ ] Medir bundle size (objetivo < 500KB gzipped)
- [ ] Test: load test con k6 (5k usuarios concurrentes)

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
