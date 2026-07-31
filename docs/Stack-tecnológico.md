## 1. Stack Tecnológico
### 📱 Frontend (PWA Ciudadana + Dashboard de Administración)
 * **Lenguaje:** **TypeScript**
   * *Por qué:* Garantiza un tipado estricto para las coordenadas GPS (latitude, longitude), tipos de incidentes, respuestas de error y los objetos almacenados en IndexedDB.
 * **Framework:** **React (Next.js)** *o* **Angular**
   * **React / Next.js:** Es muy ligero y cuenta con un ecosistema rápido para PWAs con Workbox (next-pwa o Serwist) y la librería react-leaflet.
   * **Angular:** Si prefieres la modularidad por capas y una estructura orientada a servicios, Angular con @angular/pwa también es una alternativa sumamente robusta.
 * **Librerías Clave:**
   * **leaflet & react-leaflet (o leaflet puro):** Renderizado de mapas vectoriales e interactivos.
   * **idb / workbox-window:** Manejo sencillo de IndexedDB y el ciclo de vida del Service Worker para el encolado *offline*.
   * **tailwindcss:** Diseño rápido, adaptativo (*mobile-first*) y liviano.
   * **socket.io-client:** Para la recepción en tiempo real de nuevas alertas en el Dashboard.
### ⚙️ Backend (API REST, WebSockets & Motor Espacial)
 * **Lenguaje & Framework (Dos opciones recomendadas):**
   1. **Node.js (TypeScript) con NestJS o Express:**
     * *Ventaja:* Mantener TypeScript tanto en frontend como en backend permite compartir interfaces DTO (Data Transfer Objects). NestJS ofrece una arquitectura modular basada en inyección de dependencias muy limpia.
   2. **Java con Spring Boot:**
     * *Ventaja:* Ideal si buscas máxima robustez empresarial. Spring Boot con **Spring Data JPA** e **Hibernate Spatial** gestiona los tipos de datos geométricos de PostGIS de manera nativa y eficiente.
 * **Librerías Clave:**
   * **pg / Prisma / Hibernate Spatial:** Conectores ORM con soporte directo para PostGIS y tipos GEOMETRY(Point, 4326).
   * **socket.io / WebSockets nativos:** Para la emisión de alertas instantáneas a las pantallas de control.
   * **multer (o AWS SDK / Supabase Storage SDK):** Procesamiento e ingestión de imágenes comprimidas en WebP.
## 2. Arquitectura de Distribución de Carpetas
Esta estructura está organizada bajo el patrón de **Monorepo Desacoplado** (ambos proyectos viven en la misma raíz pero funcionan como aplicaciones completamente independientes con sus propias dependencias y configuraciones):
```text
transito-alerta-se/
├── frontend/                      # Aplicación PWA + Dashboard Admin
│   ├── public/
│   │   ├── icons/                 # Iconos PWA (192x192, 512x512)
│   │   ├── sw.js                  # Service Worker personalizado
│   │   └── manifest.json          # Manifest PWA (A2HS)
│   ├── src/
│   │   ├── assets/                # Imágenes estáticas y estilos globales
│   │   ├── components/            # Componentes de interfaz
│   │   │   ├── ui/                # Botones, Modales, Cards, Badges
│   │   │   └── map/               # Componente Mapa Leaflet, Pines, Geofencing UI
│   │   ├── db/                    # Persistencia local (Offline-First)
│   │   │   └── reportQueue.ts     # Instancia de IndexedDB para encolar reportes
│   │   ├── hooks/                 # Custom Hooks / Composables
│   │   │   ├── useGeolocation.ts  # Captura de coordenadas GPS
│   │   │   ├── useNetworkStatus.ts# Detección de conexión (Online/Offline)
│   │   │   └── useOfflineSync.ts  # Disparador de sincronización en segundo plano
│   │   ├── pages/ / app/          # Vistas ( /report, /dashboard, /history )
│   │   ├── services/              # Comunicación externa
│   │   │   ├── api.ts             # Cliente HTTP (Axios / Fetch)
│   │   │   └── socket.ts          # Cliente WebSocket para tiempo real
│   │   ├── utils/                 # Utilidades
│   │   │   └── imageCompressor.ts # Compresión de fotos en cliente (Canvas API -> WebP)
│   │   └── types/                 # Definiciones de tipos / Interfaces
│   │       └── report.d.ts
│   ├── package.json
│   └── tailwind.config.js
│
├── backend/                       # API REST + Servidor WebSockets
│   ├── src/
│   │   ├── config/                # Variables de entorno, conexión a PostGIS
│   │   ├── controllers/           # Endpoints de la API (Reportes, Agentes, Auth)
│   │   ├── services/              # Lógica de negocio
│   │   │   ├── report.service.ts  # Procesamiento y validaciones
│   │   │   ├── geofencing.ts      # Verificación de límites de Santa Elena
│   │   │   └── storage.service.ts # Subida de imágenes WebP
│   │   ├── models/                # Entidades DB / Esquemas espaciales
│   │   ├── gateways/              # Servidor WebSocket / Socket.io
│   │   ├── middlewares/           # Rate limiting (Spam), Autenticación, CORS
│   │   └── utils/                 # Helpers para operaciones matemáticas/GIS
│   ├── Dockerfile
│   └── package.json (o pom.xml)
│
├── docker-compose.yml             # Orquestación de PostgreSQL + PostGIS + Backend
├── .gitignore
└── README.md

```
### 💡 Razones de esta organización
 1. **Aislamiento total:** Si necesitas cambiar el servidor backend de Node.js a Spring Boot en el futuro, la carpeta frontend/ permanece intacta.
 2. **Ciclo de Despliegue Independiente:** Puedes desplegar la PWA en un CDN rápido (como Vercel o Netlify) y la API Backend en tu servidor o contenedor Docker de preferencia.
 3. **Manejo Offline claro:** La carpeta frontend/src/db/ encapsula toda la complejidad de IndexedDB y la cola de reintentos sin contaminar los componentes visuales.

---

## 🛠️ Capas Complementarias para el Stack Tecnológico
```text
[ CIUDADANO (PWA) ] ──> [ CLOUDFLARE (CDN / SSL / WAF) ]
                              │
                              ▼
                 [ DOCKER CONTAINER / API ]
                              │
  ┌───────────────────────────┼───────────────────────────┐
  │                           │                           │
  ▼                           ▼                           ▼
[ REDIS ]             [ POSTGRESQL + POSTGIS ]    [ TELEGRAM / PUSH API ]
(Caché & Spam)        (Base de Datos Espacial)    (Alertas de Escalación)
  │                           │                           │
  └───────────────────────────┼───────────────────────────┘
                              │
                              ▼
                 [ SENTRY / UPTIME KUMA ]
                 (Monitoreo & Errores)

```
### 1. Base de Datos en Memoria y Caché: **Redis**
 * **¿Por qué agregarlo?:**
   * **Control de Spam (*Rate Limiting*):** Es perfecto para validar en milisegundos si un dispositivo ya envió 3 reportes en los últimos 10 minutos antes de saturar la base de datos PostgreSQL.
   * **Geofencing Caching:** Puedes cachear las fronteras poligonales del cantón Santa Elena en memoria para no recalcular la geometría en la BD principal con cada petición.
   * **Pub/Sub para WebSockets:** Si escalas el servidor backend a múltiples instancias, Redis coordina la emisión de eventos en tiempo real hacia los dashboards.
### 2. Calidad de Software y Automatización (QA & CI/CD)
Aprovechando el enfoque de ingeniería de calidad, estas herramientas aseguran que el código sea confiable antes de llegar a producción:
 * **Pruebas E2E e Integración:** **Playwright** o **Cypress**
   * *Uso:* Simular en un navegador automatizado el envío de un reporte, la compresión de la foto en la Canvas API y el comportamiento del Service Worker al **desconectar la red** (modo *Offline*).
 * **Pruebas Unitarias:** **Vitest** (si usas Node/React) o **JUnit 5 / Mockito** (si usas Spring Boot).
 * **Pipeline de CI/CD:** **GitHub Actions**
   * *Uso:* Ejecución automática de linters, formateo, compilación de tipos en TypeScript y despliegue automatizado (*Continuous Deployment*) hacia el servidor cada vez que hagas un git push a la rama principal.
### 3. Contenedores e Infraestructura: **Docker & Docker Compose**
 * **¿Por qué agregarlo?:**
   * **Entornos Idénticos:** Te permite levantar localmente en un solo comando (docker compose up -d) todo el ecosistema: la base de datos PostgreSQL + PostGIS, el servidor Redis y la API backend.
   * **Despliegue Limpio:** Facilita el hospedaje en VPS o servidores locales sin conflictos de versiones de Node.js o Java.
### 4. Monitoreo, Logging y Observabilidad
Para saber exactamente qué ocurre cuando los usuarios utilicen la aplicación en la calle:
 * **Rastreo de Errores en Tiempo Real:** **Sentry (Free Tier)**
   * *Uso:* Captura excepciones no controladas tanto en los navegadores móviles de los ciudadanos (ej. un fallo al acceder a la Geolocation API) como en el backend.
 * **Monitoreo de Estado (*Uptime*):** **Uptime Kuma** (Open Source)
   * *Uso:* Herramienta ligera que verifica cada minuto si la API o los servicios de mapas están respondiendo correctamente, enviándote una alerta si el servicio cae.
### 5. Servicios de Notificación Externa y Escalación
 * **Alertas por Mensajería:** **Telegram Bot API**
   * *Uso:* Cuando un reporte sea clasificado como prioridad **ALTA** (ej. vía cerrada por accidente grave), el backend puede disparar automáticamente un mensaje con la foto y la ubicación a un grupo de Telegram de los supervisores de tránsito.
 * **Notificaciones Web Push:** **VAPID / Web Push API**
   * *Uso:* Permite enviar notificaciones nativas a los navegadores web de los operadores en el Dashboard de control aunque tengan la pestaña minimizada.
### 6. Capa de Red, CDN y Seguridad: **Cloudflare**
 * **¿Por qué agregarlo?:**
   * **Seguridad (WAF & DDoS):** Protege tu API pública contra ataques de denegación de servicio.
   * **Gestión de SSL y DNS:** Certificado HTTPS gratuito e indispensable (las APIs de GPS y Service Workers en navegadores exigen obligatoriamente HTTPS para funcionar).
   * **Caché Edge:** Acelera la carga de los archivos estáticos de la PWA (HTML, JS, CSS e iconos).
## 📊 Resumen del Stack Consolidado
| Capa del Stack | Tecnología Recomendada | Propósito Principal |
|---|---|---|
| **Frontend PWA** | Next.js / React + Tailwind + Leaflet | Interfaz móvil rápida y mapa interactivo. |
| **Persistencia Local** | Workbox + IndexedDB | Encolado de reportes sin cobertura (*Offline*). |
| **Backend API** | Node.js (NestJS/Express) o Spring Boot | Reglas de negocio y endpoints REST/Sockets. |
| **Motor Espacial / BD** | PostgreSQL + PostGIS | Coordenadas, índice GiST y polígonos del cantón. |
| **Caché / Anti-Spam** | Redis | Rate limiting y caché espacial rápida. |
| **DevOps & QA** | Docker + GitHub Actions + Playwright | Automatización de pruebas y despliegue. |
| **Observabilidad** | Sentry + Uptime Kuma | Detección de fallos y monitoreo de actividad. |
| **Seguridad / CDN** | Cloudflare | HTTPS, mitigación de riesgos y caché. |

