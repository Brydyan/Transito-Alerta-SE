# 🚨 Tránsito Alerta SE — Sistema de Reporte Ciudadano e Incidencias Viales

**Tránsito Alerta SE** es una Aplicación Web Progresiva (PWA) de código abierto (*Open Source*) y arquitectura *Offline-First*, diseñada para el reporte georreferenciado e instantáneo de incidentes viales (accidentes, semáforos defectuosos, vías bloqueadas y peligros en la calzada) en el cantón y provincia de Santa Elena, Ecuador.

El proyecto ha sido concebido en el marco del programa **Jóvenes en Acción**, combinando tecnología de vanguardia, mapas interactivos de libre uso y estrategias de sincronización sin conexión para mejorar los tiempos de respuesta de los organismos de tránsito y control.

---

## 🎯 Propósito y Objetivos

En el cantón Santa Elena, la falta de una herramienta centralizada genera que los incidentes de tránsito se reporten de forma imprecisa mediante redes sociales o llamadas telefónicas, sin coordenadas exactas. Esto dificulta el triaje y retrasa la llegada de asistencia de la Comisión de Tránsito del Ecuador (CTE) y entes de emergencia.

### Fines Principales del Proyecto:
- **Respuesta Rápida y Precisa:** Permitir a los ciudadanos enviar la ubicación exacta por GPS en menos de 30 segundos, sin necesidad de descargar aplicaciones pesadas desde tiendas de apps (*Add to Home Screen*).
- **Resiliencia sin Cobertura (*Offline-First*):** Garantizar la captura de datos en tramos viales rurales o con señal móvil deficiente (ej. Ruta del Spondylus), encolando las alertas localmente para su envío automático al recuperar señal.
- **Gestión Eficiente para Autoridades:** Proveer un *Dashboard Admin* interactivo con mapa de calor, filtros de prioridad (Alta, Media, Baja) y alertas sonoras para la pronta clasificación y despacho de patrullas.

---

## 🏗️ Arquitectura e Infraestructura Tecnológica

La infraestructura de **Tránsito Alerta SE** está diseñada para ser ultra ligera, costo-eficiente ($0 en licencias de GIS o servidores propietarias) y resiliente ante fallas de conectividad.

```text
[ CIUDADANO (PWA Móvil) ]
  ├── HTML5 Geolocation API (GPS automático)
  ├── Canvas API (Compresión de imágenes en cliente WebP < 200 KB)
  ├── Workbox + IndexedDB (Almacenamiento y encolado Offline)
  └── REST / HTTPS (Sincronización al detectar señal)
             │
             ▼
[ BACKEND & INFRAESTRUCTURA (Supabase) ]
  ├── API Gateway & Auth (Tokens / Device UUID)
  ├── PostgreSQL + PostGIS (Motor espacial: GEOMETRY(Point, 4326) e índice GiST)
  └── Supabase Storage (Bucket para fotografías optimizadas)
             │
             ▼ (WebSockets / Realtime)
[ DASHBOARD DE CONTROL (Agentes de Tránsito) ]
  └── Mapa interactivo (Leaflet.js + OpenStreetMap) con priorización y alertas sonoras
```

### Componentes del Stack Tecnológico

docs/Stack-tecnológico.md

---

## 🛡️ Mecanismos de Seguridad y Rendimiento

- **Geofencing con PostGIS:** Validación espacial directa en la base de datos para descartar coordenadas fuera de la jurisdicción del cantón Santa Elena.
- **Control de Spam (*Rate Limiting*):** Restricción de máximo 3 reportes cada 10 minutos por dispositivo.
- **Anonimización por Diseño:** Envío de emergencias sin requisito de registro de cédula o datos personales sensibles.
- **Compresión de Ancho de Banda:** Las fotos capturadas se comprimen de ~5 MB a menos de 200 KB en el cliente, evitando la saturación de redes 3G/4G.

---

## 📄 Licencia

Este proyecto es un software de **código abierto** (*Open Source*), desarrollado como un aporte tecnológico para la seguridad vial y gestión comunitaria de la provincia de Santa Elena.
