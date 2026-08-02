# 🚀 Stack Tecnológico Principal
```text
[ CIUDADANO (PWA Angular) ] ──(HTTPS / REST / WebSockets)──> [ API NestJS (Node.js) ]
          │                                                            │
  (Service Worker + IndexedDB)                                (TypeORM / Prisma)
          │                                                            │
          ▼                                                            ▼
[ ALMACENAMIENTO LOCAL ]                                  [ POSTGRESQL + POSTGIS ]

```
| Capa / Módulo | Tecnología Selección | Justificación Técnica |
|---|---|---|
| **Frontend PWA & Admin** | **Angular (v17+) + Tailwind CSS** | Estructura empresarial por módulos/standalone components, arquitectura reactiva con RxJS y excelente soporte PWA con @angular/pwa. |
| **Mapas & GIS** | **Leaflet.js** | Integración directa con Angular para renderizado de capas vectoriales sin costo de licenciamiento. |
| **Backend API & Realtime** | **Node.js + NestJS (TypeScript)** | Framework modular y escalable. Manejo nativo de WebSockets mediante @nestjs/websockets (Socket.io) para alertas en vivo. |
| **Base de Datos Espacial** | **PostgreSQL + PostGIS** | Motor de base de datos relacional con extensión espacial para almacenar puntos GEOMETRY(Point, 4326), índices GiST y validaciones de *Geofencing*. |
| **Persistencia Offline** | **@angular/pwa + IndexedDB (idb)** | Service Worker para caché de assets de Angular e IndexedDB para el encolado de reportes cuando no hay cobertura en carretera. |
| **Optimización de Medios** | **HTML5 Canvas API** | Compresión de fotos en cliente a WebP (<200 KB) mediante un servicio inyectable de Angular antes de realizar la petición HTTP. |

## 🛠️ Capas Complementarias para el Stack Tecnológico
### 1. Base de Datos Espacial & Almacenamiento
 * **PostgreSQL + PostGIS (Motor Principal):**
   * Manejo de funciones geoespaciales como ST_Contains (para verificar si el GPS reportado está dentro de los límites del cantón Santa Elena) y ST_DWithin (para calcular proximidad).
 * **Supabase Storage / AWS S3 / MinIO:**
   * Almacenamiento persistente en la nube para el bucket de fotografías optimizadas en formato WebP.
### 2. Caché y Control de Spam: **Redis**
 * **Integración en NestJS (@nestjs/cache-manager):**
   * **Rate Limiting:** Control en milisegundos para limitar máximo 3 reportes cada 10 minutos por device_uuid antes de tocar la base de datos principal.
   * **Caché de Fronteras:** Almacenamiento en memoria de los límites territoriales de Santa Elena para agilizar las validaciones de *Geofencing*.
   * **Pub/Sub para WebSockets:** Coordinación de eventos en tiempo real si el backend escala en múltiples instancias.
### 3. Calidad de Software & Pruebas (QA)
Aprovechando la estructura de NestJS y Angular, el flujo de QA queda perfectamente definido:
 * **Pruebas Unitarias & Integración:**
   * **Frontend:** **Jasmine + Karma** (nativo en Angular) o **Jest / Vitest** para probar servicios reactivos (RxJS) y la lógica de compresión de imágenes.
   * **Backend:** **Jest + Supertest** (integrados por defecto en el CLI de NestJS) para pruebas de endpoints REST, DTOs y guardias de seguridad.
 * **Pruebas E2E (End-to-End):** **Playwright** o **Cypress**
   * Simulación automatizada en navegadores móviles del proceso de envío de alertas, interceptando la red para emular pérdida de señal (*Offline mode*).
 * **Integración Continua:** **GitHub Actions**
   * Pipeline automatizado que ejecuta linters, validaciones de tipos en TypeScript, suite de pruebas y compilación previa al despliegue.
### 4. Infraestructura y Contenedores: **Docker & Docker Compose**
 * Entorno de desarrollo unificado que levanta en segundos:
   * Contenedor de la API en **NestJS**.
   * Base de Datos **PostgreSQL 16 + PostGIS 3.4**.
   * Servidor de caché **Redis**.
### 5. Monitoreo & Observabilidad
 * **Sentry (@sentry/angular y @sentry/node):** Captura centralizada de excepciones no controladas tanto en la PWA como en la API de NestJS.
 * **Uptime Kuma:** Verificación en tiempo real del estado de disponibilidad del servidor backend y la base de datos.
### 6. Notificaciones Externa y Escalación
 * **Telegram Bot API (módulo @nestjs/axios):** Envío automático de mensajes con foto y coordenadas a un grupo de supervisores si un evento de prioridad "ALTA" no es atendido en más de 15 minutos.
 * **Web Push API (VAPID):** Notificaciones flotantes nativas para el Dashboard de Agentes de Tránsito.

## 📁 Arquitectura de Carpetas Recomendada (Angular + NestJS)
```text
transito-alerta-se/
│
├── frontend/                          # Proyecto Angular (PWA + Admin)
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/                  # Servicios singleton, interceptores HTTP, guards
│   │   │   │   ├── services/          # GeolocationService, OfflineSyncService, ImageCompressorService
│   │   │   │   ├── interceptors/     # AuthInterceptor, ErrorInterceptor
│   │   │   │   └── db/                # IndexedDB Instance (cola de reportes offline)
│   │   │   ├── features/              # Módulos / Componentes de dominio
│   │   │   │   ├── citizen-report/    # Formulario PWA, cámara, captura GPS
│   │   │   │   └── admin-dashboard/   # Mapa de calor Leaflet, tabla de incidentes, filtros
│   │   │   ├── shared/                # Componentes reutilizables (Botones, Modales, Badges UI)
│   │   │   └── models/                # Interfaces TypeScript (Report, IncidentType, Location)
│   │   ├── assets/                    # Iconos PWA, imágenes y mapas estáticos
│   │   ├── manifest.webmanifest       # Configuración PWA (Add to Home Screen)
│   │   └── ngsw-config.json           # Configuración del Service Worker de Angular
│   └── package.json
│
├── backend/                           # API NestJS (Node.js + TypeScript)
│   ├── src/
│   │   ├── config/                    # Configuración de env, PostGIS y Redis
│   │   ├── modules/
│   │   │   ├── reports/               # Controller, Service, Entities (PostGIS Point)
│   │   │   ├── geofencing/            # Validación espacial del cantón Santa Elena
│   │   │   ├── websockets/            # Gateway Socket.io para emisión en tiempo real
│   │   │   └── notifications/         # Servicio de alertas a Telegram / Web Push
│   │   ├── common/
│   │   │   ├── guards/                # RateLimiterGuard (Redis), AuthGuard
│   │   │   ├── filters/               # Handling de excepciones globales Sentry
│   │   │   └── dto/                   # Data Transfer Objects (CreateReportDto)
│   │   └── main.ts                    # Bootstrap de la aplicación NestJS
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml                 # PostgreSQL/PostGIS + Redis + NestJS API
├── .gitignore
└── README.md

```
