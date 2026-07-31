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
