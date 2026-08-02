# PROPUESTA FORMAL DE PROYECTO
## TRÁNSITO ALERTA SANTA ELENA
### Sistema Web Participativo de Gestión de Incidencias Viales

**Documento de Propuesta de Proyecto y Viabilidad**  
**Presentado a:** Comisión de Tránsito del Cantón Santa Elena  
**Fecha:** 31 de Julio de 2026  
**Versión:** 1.0  

---

## TABLA DE CONTENIDOS

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Diagnóstico y Justificación](#diagnóstico-y-justificación)
3. [Descripción de la Solución](#descripción-de-la-solución)
4. [Objetivos del Proyecto](#objetivos-del-proyecto)
5. [Viabilidad del Proyecto](#viabilidad-del-proyecto)
6. [Cronograma Detallado](#cronograma-detallado)
7. [Protocolo de Operación](#protocolo-de-operación)
8. [Plan de Capacitación](#plan-de-capacitación)
9. [Presupuesto y Recursos](#presupuesto-y-recursos)
10. [Acta de Compromiso y Colaboración](#acta-de-compromiso-y-colaboración)

---

## RESUMEN EJECUTIVO

**Tránsito Alerta SE** es una plataforma web progresiva (PWA) de reporte ciudadano georreferenciado diseñada para mejorar la gestión de incidencias viales en el cantón Santa Elena. 

### Problema Central
Actualmente, los incidentes viales (accidentes, semáforos fuera de servicio, vías bloqueadas) se reportan de manera desorganizada mediante redes sociales o llamadas telefónicas, sin ubicación exacta. Esto genera:
- Demoras en la respuesta de autoridades
- Incremento de riesgos de accidentes secundarios
- Congestión innecesaria en vías principales
- Falta de trazabilidad de incidentes

### Solución Propuesta
Una plataforma accesible desde cualquier teléfono inteligente (sin descarga de app) que permite:
- Reportar incidentes con GPS automático en menos de 30 segundos
- Categorización por nivel de prioridad (Alta, Media, Baja)
- Panel de control en tiempo real para autoridades de tránsito
- Sincronización offline-first para zonas sin cobertura

### Impacto Esperado (Piloto 3 meses)
- **Reducción del 30%** en tiempo de respuesta institucional
- **Cobertura del 100%** de parroquias del cantón
- **500+ reportes ciudadanos** validados
- **Adopción de 0% costo** operativo anual

### Inversión Requerida
- **Directa (Capital Semilla):** USD $250
- **Valor agregado (Desarrollo Técnico):** USD $4,200 (aporte en especie)
- **Costo post-piloto:** USD $0 anuales

**Status:** Listo para implementación inmediata

---

## DIAGNÓSTICO Y JUSTIFICACIÓN

### 1. Contexto Geográfico y Vial

El cantón Santa Elena se ubica en la Provincia de Santa Elena, zona estratégica que:
- Concentra el 40% del tráfico turístico costero nacional (Ruta del Spondylus)
- Posee cabecera cantonal con alta densidad vehicular
- Incluye parroquias rurales con cobertura de red limitada
- Soporta transporte interprovincial de carga y pasajeros

### 2. Problemática Identificada

#### 2.1 Imprecisión Geográfica
- **Situación Actual:** Los ciudadanos reportan emergencias mediante redes sociales o llamadas sin coordenadas exactas
- **Consecuencia:** Demoras de 20-45 minutos en localización de incidentes
- **Riesgo:** Accidentes secundarios, obstrucción prolongada de vías

#### 2.2 Falta de Categorización
- **Situación Actual:** Todos los reportes llegan sin clasificación de urgencia
- **Consecuencia:** Los despachadores dedican tiempo a triaje manual
- **Riesgo:** Priorización incorrecta de recursos limitados

#### 2.3 Ausencia de Trazabilidad
- **Situación Actual:** No existe registro formal de incidentes reportados
- **Consecuencia:** Imposibilidad de análisis de tendencias o puntos críticos
- **Riesgo:** Decisiones de inversión basadas en datos anecdóticos

#### 2.4 Costos de Soluciones Comerciales
- **Situación Actual:** Soluciones comerciales requieren USD $5,000-$15,000 anuales
- **Consecuencia:** Cantones descentralizados no disponen de presupuesto
- **Riesgo:** Brecha digital en provincias de menor PIB

### 3. Justificación de la Propuesta

La propuesta de **Tránsito Alerta SE** responde a estas problemáticas mediante:

| Problema | Solución | Resultado |
|----------|----------|-----------|
| Imprecisión geográfica | GPS automático + mapa interactivo | Ubicación exacta en segundos |
| Falta de categorización | Formulario con opciones de prioridad | Triaje automático de urgencia |
| Ausencia de trazabilidad | Base de datos geoespacial PostgreSQL/PostGIS | Análisis de patrones de incidentes |
| Costos elevados | Arquitectura 100% Open Source | USD $0 de licencias, USD $35/año dominio |

### 4. Alineación con Metas Institucionales

Este proyecto se alinea con:
- ✅ Objetivo Nacional: *"Mejorar la seguridad vial y reducir siniestros"*
- ✅ Eje Provincial: *"Digitalización de servicios públicos"*
- ✅ Meta Cantonal: *"Fortalecer respuesta de autoridades de tránsito"*

---

## DESCRIPCIÓN DE LA SOLUCIÓN

### 1. Arquitectura Técnica General

**Tránsito Alerta SE** consta de tres componentes integrados:

#### 1.1 Cliente Ciudadano (PWA Frontend)
```
Acceso: Navegador web (no requiere app store)
Tecnología: React/Next.js + Leaflet.js
Capacidades:
  - Captura automática de coordenadas GPS
  - Selección de prioridad de incidente
  - Fotografía directa desde cámara
  - Sincronización offline (IndexedDB + Service Worker)
  - Compresión automática de imágenes (WebP 200KB)
  - Diseño responsive para móviles de gama baja
```

#### 1.2 Backend y Base de Datos
```
Hosting: Supabase (PostgreSQL + PostGIS)
Servicios:
  - Autenticación por token anónimo (Device Fingerprint)
  - API REST para recepción de reportes
  - Validación geoespacial (descartar ubicaciones fuera del cantón)
  - Rate limiting (máx. 3 reportes/dispositivo cada 10 min)
  - Realtime WebSocket para actualización del Dashboard
```

#### 1.3 Panel de Control (Dashboard Admin)
```
Acceso: Portal web restringido (usuarios de la Comisión)
Tecnología: React/Next.js + Leaflet.js
Funcionalidades:
  - Mapa interactivo con todos los reportes en tiempo real
  - Filtros por prioridad, tipo de incidente, fecha
  - Asignación de patrullas a reportes
  - Cambio de estado (Nuevo → En Proceso → Resuelto)
  - Módulo de moderación (marcar como falso/spam)
  - Alertas sonoras para incidentes Alta Prioridad
  - Exportación de reportes para análisis
  - Notificaciones automáticas vía Telegram/WhatsApp a supervisor
```

### 2. Flujo de Operación

```
┌──────────────────────────────────────────────────────────────┐
│                    FLUJO DE UN REPORTE                       │
└──────────────────────────────────────────────────────────────┘

1. CIUDADANO REPORTA
   ├─ Accede a transitoalertase.ec desde navegador
   ├─ Autoriza acceso a GPS (mostrando margen de error)
   ├─ Selecciona tipo de incidente
   ├─ Elige nivel de prioridad
   ├─ Captura fotografía
   ├─ Adjunta descripción breve
   └─ Envía reporte (30 segundos promedio)
        │
        ├─ Si hay conexión: Envío inmediato a servidor
        └─ Si NO hay conexión: Almacenado en IndexedDB, enviado al recuperar señal
                      │
2. VALIDACIÓN AUTOMÁTICA (Servidor)
   ├─ Verificar coordenadas dentro del cantón Santa Elena
   ├─ Validar EXIF de imagen o captura en tiempo real
   ├─ Rate limiting por IP/device
   └─ Si valida: Ingresar a BD, notificar Dashboard
                      │
3. NOTIFICACIÓN A OPERADORES
   ├─ Alerta visual en Dashboard (rojo para Alta Prioridad)
   ├─ Alerta sonora que requiere confirmación
   └─ Si no hay interacción en 15 min: Webhook a supervisor (Telegram)
                      │
4. GESTIÓN POR AUTORIDAD
   ├─ Operador visualiza reporte en mapa
   ├─ Valida información e imagen
   ├─ Asigna patrulla disponible
   ├─ Cambia estado a "En Proceso"
   └─ Despliega recurso al sitio
                      │
5. CIERRE DEL INCIDENTE
   ├─ Operador confirma resolución
   ├─ Cambia estado a "Resuelto"
   └─ Reporta en sistema y archiva
```

### 3. Características de Seguridad y Privacidad

✅ **Anonimización por Diseño:**
- No se exige crear cuenta ni proporcionar datos personales
- Token de autenticación cifrado en localStorage
- Device Fingerprint (no se recopila número de cédula)

✅ **Protección de Datos:**
- Conexión HTTPS (certificado Let's Encrypt automático)
- Validación de campos en cliente y servidor
- Encriptación de datos sensibles en BD

✅ **Control de Calidad:**
- Geofencing: Solo aceptar ubicaciones dentro del cantón
- Validación de imágenes: Metadatos EXIF coherentes
- Rate limiting: Máximo 3 reportes por dispositivo cada 10 minutos
- Moderación manual: Botón "Marcar como Falso" en Dashboard

---

## OBJETIVOS DEL PROYECTO

### Objetivo General
Desarrollar e implementar **Tránsito Alerta SE**, una plataforma web participativa de reporte ciudadano georreferenciado que reduzca en un mínimo del 30% los tiempos de respuesta de la Comisión de Tránsito ante incidencias viales durante un período de pilotaje de 3 meses en el cantón Santa Elena.

### Objetivos Específicos

| # | Objetivo | Indicador de Cumplimiento | Meta |
|---|----------|--------------------------|------|
| **O1** | Diseñar interfaz PWA intuitiva | Tiempo promedio de reporte | ≤ 30 segundos |
| **O2** | Implementar Dashboard de control geográfico | Disponibilidad del sistema | ≥ 99.5% uptime |
| **O3** | Capturar reportes ciudadanos válidos | Volumen de participación | ≥ 500 reportes |
| **O4** | Alcanzar todas las parroquias del cantón | Cobertura parroquial | 100% con ≥10 reportes c/u |
| **O5** | Validar tiempo de respuesta institucional | Despacho de patrullas | < 8 min (Prioridad Alta) |
| **O6** | Mantener calidad de datos | Tasa de spam/falsos | < 8% del total |
| **O7** | Ejecutar capacitación operativa | Cobertura de personal | 100% de operadores capacitados |
| **O8** | Establecer sostenibilidad post-piloto | Costo operativo anual | USD $0 (modelo Open Source) |

---

## VIABILIDAD DEL PROYECTO

### 1. Viabilidad Técnica ✅

#### 1.1 Stack Tecnológico Comprobado
- **Frontend:** React/Next.js (industria estándar para PWA)
- **Backend:** Supabase/PostgreSQL (usado por gobiernos e instituciones)
- **Mapas:** OpenStreetMap + Leaflet.js (código abierto, sin royalties)
- **Hosting:** Vercel/Netlify (infraestructura probada para aplicaciones críticas)

#### 1.2 Disponibilidad de Tecnologías Open Source
- ✅ Todas las librerías son mantenidas por comunidades activas
- ✅ No hay dependencia de proveedores propietarios
- ✅ Fuente abierta permite auditoría y modificaciones futuras

#### 1.3 Experiencia del Equipo de Desarrollo
- Equipo: Jóvenes en Acción (participantes del programa)
- Capacitación: Fullstack Web Developer + QA Engineer + UX/UI Designer
- Referencias: Desarrollo de sistemas web para instituciones públicas

#### 1.4 Mitigación de Riesgos Técnicos
| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|--------|-----------|
| Conectividad deficiente en zonas rurales | Alta | Alto | Arquitectura Offline-First (IndexedDB + Service Worker) |
| Imprecisión GPS en dispositivos de gama baja | Media | Medio | Permitir corrección manual del pin en mapa |
| Saturación de ancho de banda por imágenes | Alta | Medio | Compresión WebP client-side (200KB máx.) |
| Reportes falsos/spam | Media | Alto | Geofencing + Rate Limiting + Moderación manual |

---

### 2. Viabilidad Social ✅

#### 2.1 Acceso Ciudadano sin Barreras
- ✅ No requiere descargar app (navegador web estándar)
- ✅ Acceso mediante código QR impreso en transporte público
- ✅ Funciona con cualquier teléfono smartphone (incluso gama baja)
- ✅ Costo de datos mínimo (reportes < 500KB)

#### 2.2 Adopción Institucional Factible
- ✅ Comisión de Tránsito ya cuenta con personal de atención
- ✅ Dashboard reemplaza procesos manuales (no aumenta carga)
- ✅ Integración con sistemas de despacho existentes es opcional

#### 2.3 Aceptación Comunitaria Potencial
- Cooperativas de transporte urbano e interprovincial
- Comerciantes en puntos de congestionamiento crítico
- Comunidades rurales interesadas en seguridad vial
- Turistas que transitan la Ruta del Spondylus

---

### 3. Viabilidad Financiera ✅

#### 3.1 Inversión Mínima Requerida
```
Rubro                          Costo
─────────────────────────────────────
Dominio .ec (1 año)             $35
Material QR (500 unidades)      $60
Socialización en 6 parroquias   $120
Capacitación (kits impresos)    $35
─────────────────────────────────────
TOTAL INVERSIÓN DIRECTA        $250 USD
```

#### 3.2 Costo Operativo Post-Piloto
- **Hosting Frontend:** Vercel Free (USD $0)
- **Base de Datos:** Supabase Free Tier (USD $0)
- **Mapas:** OpenStreetMap (USD $0)
- **Certificado SSL:** Let's Encrypt (USD $0)
- **Dominio .ec:** USD $35/año (costo administrativo mínimo)

**COSTO ANUAL TOTAL: USD $35**

#### 3.3 Valor Agregado (Aporte en Especie)
El proyecto entrega código fuente, documentación y capacitación valuados en:

```
Rol                              Horas    Tarifa    Total
──────────────────────────────────────────────────────────
Fullstack Developer              120 h    $25/h   $3,000
QA Engineer + Tester             40 h     $20/h     $800
UX/UI Designer + Materiales      20 h     $20/h     $400
──────────────────────────────────────────────────────────
VALOR TOTAL ENTREGADO                              $4,200
```

#### 3.4 Análisis Costo-Beneficio
| Concepto | Cantidad | Valorización |
|----------|----------|--------------|
| Inversión directa | $250 | Muy baja (material + dominio) |
| Costo operativo anual | $35 | Negligible vs. soluciones comerciales |
| Valor de desarrollo | $4,200 | Financiado por programa Jóvenes en Acción |
| ROI esperado (reducción tiempo respuesta) | 30% | Reducción de accidentes secundarios |

---

### 4. Viabilidad de Escalabilidad ✅

El modelo técnico permite:
- ✅ Replicación a otros cantones de Santa Elena (La Libertad, Salinas)
- ✅ Extensión a otras provincias costeras
- ✅ Integración con sistemas de emergencia (ECU-911)
- ✅ Participación de múltiples instituciones (Tránsito, Bomberos, Policía)

---

## CRONOGRAMA DETALLADO

**Duración Total:** 8 semanas (2 meses)  
**Inicio:** Lunes  
**Fin:** Domingo de Semana 8

### Timeline Visual General

```
SEMANA     1    2    3    4    5    6    7    8
FASE 1   [===][===]
FASE 2                [===][===][===][===]
FASE 3                              [===][===]
FASE 4                                   [===]

Hitos Clave:
│ Kickoff (Día 1, Lunes)
│ Especificación completa (Día 11, Viernes S1)
│ MVP Ciudadano v1 (Día 25, Viernes S3)
│ MVP Admin v1 (Día 38, Jueves S5)
│ Pruebas de carga (Día 48, Domingo S7)
│ SISTEMA EN PRODUCCIÓN (Día 56, Lunes S8)
```

---

## FASE 1: Análisis, Diseño y Configuración Técnica
**Semanas 1-2 (14 días naturales)**

### Semana 1: Kickoff, Requerimientos y Diseño Inicial

| Día | Tarea | Responsable | Horas | Deliverable |
|-----|-------|-------------|-------|------------|
| **Lunes (Día 1)** | | | | |
| | Reunión Kickoff con Comisión de Tránsito (2h) | PM + Jefe Tránsito | 2 | Acta de reunión, lista de asistentes |
| | Presentación del cronograma y expectativas | PM | 1 | Slides confirmadas |
| | Constitución de grupo de trabajo | PM + Stakeholders | 1 | Matriz de comunicación |
| **Martes (Día 2)** | | | | |
| | Taller 1: Requerimientos funcionales ciudadano (3h) | BA + Operadores | 3 | Lista de user stories PWA |
| | Reunión técnica: Stack seleccionado | CTO + Backend | 1 | Decision log |
| **Miércoles (Día 3)** | | | | |
| | Taller 2: Requerimientos admin dashboard (3h) | BA + Supervisores | 3 | User stories Dashboard |
| | Taller 3: Matriz de riesgos y mitigación | PM + Equipo | 2 | Risk register actualizado |
| **Jueves (Día 4)** | | | | |
| | Inicio diseño de wireframes (Figma) | UI/UX | 6 | Wireframes S0 de PWA ciudadana |
| | Levantamiento de requerimientos de BD | Backend | 4 | Documento de specs de datos |
| **Viernes (Día 5)** | | | | |
| | Revisión de wireframes con stakeholders | UI/UX + PM | 2 | Feedback incorporado, v1 wireframes |
| | Diagrama entidad-relación (ER) draft | Backend | 3 | ER Diagram en Lucidchart |
| | Setup inicial del repositorio Git | DevOps | 2 | Repo con README y estructura base |
| **Sábado-Domingo** | Recuperación / Análisis de feedback | Equipo | — | Síntesis de aprendizajes |

**Hito Semana 1:** Especificación funcional clara, diseño iniciado, equipo alineado

---

### Semana 2: Diseño Técnico Completo e Infraestructura

| Día | Tarea | Responsable | Horas | Deliverable |
|-----|-------|-------------|-------|------------|
| **Lunes (Día 8)** | | | | |
| | Diseño final de DB (PostGIS schema) | Backend | 4 | ER Diagram finalizado + normalization review |
| | Scripts SQL iniciales (tablas, índices) | Backend | 3 | schema.sql con comentarios |
| | Wireframes PWA ciudadana v2 (finalizado) | UI/UX | 5 | Figma design con componentes |
| **Martes (Día 9)** | | | | |
| | Diseño API REST (OpenAPI/Swagger) | Backend | 4 | API spec completa en Swagger |
| | Análisis de seguridad (LGPD Ecuador) | Security Lead | 3 | Security checklist |
| | Wireframes Dashboard Admin v2 | UI/UX | 4 | Figma con todas las vistas |
| **Miércoles (Día 10)** | | | | |
| | Configuración Supabase (project setup) | DevOps | 2 | Supabase project live |
| | Configuración Vercel (monorepo structure) | DevOps | 2 | Vercel projects linked to Git |
| | Design system component library (Figma) | UI/UX | 3 | Component tokens + spacing guide |
| | Protocolo de operación (borrador v0.1) | PM + Comisión | 2 | Doc de operación inicial |
| **Jueves (Día 11)** | | | | |
| | Revisión especificación técnica COMPLETA | CTO + Equipo | 2 | Technical specification v1.0 firmado |
| | Planning Fase 2: Desglose de tareas | PM + Tech Leads | 3 | Sprint backlog detallado |
| | Setup CI/CD pipeline (GitHub Actions) | DevOps | 3 | Workflows para test + deploy |
| **Viernes (Día 12)** | | | | |
| | Capacitación Supabase al equipo (1.5h) | DevOps | 1.5 | Team familiar con Supabase console |
| | Capacitación Vercel al equipo (1h) | DevOps | 1 | Team ready para deploy |
| | Creación de issue templates en GitHub | DevOps | 1 | Issue + PR templates listos |
| | Reunión de cierre Fase 1 | PM + Equipo | 1 | Retrospective + confirmación Go/No-Go |
| **Sábado-Domingo** | Buffer técnico / Ajustes finales | Equipo | — | Infraestructura 100% lista |

**Hito Semana 2:** Especificación técnica completa, infraestructura configurada, equipo listo para desarrollo

**Estado Fin Fase 1:** ✅ Listo para pasar a Fase 2

---

## FASE 2: Desarrollo del MVP (Frontend PWA y Admin Dashboard)
**Semanas 3-6 (28 días naturales)**

### Semana 3: Frontend Ciudadano v1 + Backend Base

| Día | Tarea | Responsable | Horas | Deliverable |
|-----|-------|-------------|-------|------------|
| **Lunes (Día 15)** | | | | |
| | Setup proyecto React en Vercel | Frontend | 2 | Next.js project initialized |
| | Scaffold de páginas iniciales (layout, nav) | Frontend | 3 | _app.tsx, _document.tsx, layout components |
| | Página de inicio (landing page) | Frontend | 4 | Home page con guía rápida |
| | Inicio Backend: Setup Express + Supabase client | Backend | 4 | API server corriendo en localhost |
| **Martes (Día 16)** | | | | |
| | Componente GPS (Geolocation API) | Frontend | 5 | Component que captura coordenadas + margen error |
| | Endpoints REST básicos (POST /reports) | Backend | 4 | Endpoint para crear reporte (no validado aún) |
| | Página de error / offline fallback | Frontend | 2 | Página de error responsive |
| **Miércoles (Día 17)** | | | | |
| | Componente formulario de reporte (sin submit aún) | Frontend | 6 | Form con campos: tipo, prioridad, descripción |
| | Integración Leaflet.js en Frontend | Frontend | 3 | Mapa básico cargando en PWA |
| | Tabla de reportes en PostgreSQL | Backend | 3 | CREATE TABLE + índices de PostGIS |
| **Jueves (Día 18)** | | | | |
| | Componente de cámara (para foto) | Frontend | 4 | Camera capture component (no compresión aún) |
| | Validación de ubicación GPS (PostGIS geofencing) | Backend | 4 | Función ST_Contains para validar cantón |
| | Pruebas unitarias de componentes Frontend | QA | 3 | Jest tests para componentes básicos |
| **Viernes (Día 19)** | | | | |
| | Integración form → GPS → mapa | Frontend | 3 | User flujo completo visualizado |
| | Rate limiting middleware (Backend) | Backend | 3 | Express middleware con Redis (opcional) |
| | Testing E2E inicial (Cypress) | QA | 2 | E2E test para flujo básico |
| | Reunión de avance Fase 2 | PM | 1 | Checkpoint (50% en tiempo) |
| **Sábado-Domingo** | Code review + merge PRs | Equipo | — | Todas las features en main branch |

**Hito Semana 3:** PWA ciudadana funcional al 40%, Backend API al 30%

---

### Semana 4: Compresión de Imágenes + Autenticación + Mapas Admin

| Día | Tarea | Responsable | Horas | Deliverable |
|-----|-------|-------------|-------|------------|
| **Lunes (Día 22)** | | | | |
| | Compresión de imágenes client-side (Canvas API) | Frontend | 4 | browser-image-compression integrado |
| | Convertir imágenes a WebP + 200KB máx | Frontend | 3 | Validación + test de compresión |
| | Autenticación anónima (Device Fingerprint) | Backend | 3 | JWT generator + middleware |
| | Endpoint para envío de reportes (validado) | Backend | 4 | POST /reports con validaciones |
| **Martes (Día 23)** | | | | |
| | Service Worker inicial (offline cache) | Frontend | 5 | service-worker.ts + manifest.json |
| | IndexedDB setup para reportes offline | Frontend | 4 | DB schema para almacenamiento local |
| | Módulo de login Dashboard Admin | Frontend | 4 | Página de autenticación para Comisión |
| **Miércoles (Día 24)** | | | | |
| | Sincronización offline-first (draft) | Frontend | 5 | Queue de reportes pendientes en IndexedDB |
| | Mapa del Admin Dashboard (Leaflet) | Frontend | 4 | Mapa interactivo mostrando pines |
| | Endpoint GET /reports (lista de reportes) | Backend | 3 | API para traer reportes del mapa |
| **Jueves (Día 25)** | | | | |
| | Validación EXIF de imágenes | Backend | 3 | piexif library para validar timestamps |
| | Tabla de usuarios admin (DB) | Backend | 2 | CREATE TABLE users con roles |
| | Componentes UI del Admin (botones, paneles) | Frontend | 4 | Storybook con componentes Admin |
| **Viernes (Día 26)** | | | | |
| | Testing de PWA en móviles (navegadores reales) | QA | 4 | Test report: iOS Safari, Chrome Android |
| | Optimización de carga (Lighthouse) | Frontend | 2 | Score > 80 en performance |
| | Reunión de avance | PM | 1 | Checkpoint (63% en tiempo) |
| **Sábado-Domingo** | Fixes de bugs críticos | Equipo | — | Integración PWA + Admin básica |

**Hito Semana 4:** PWA ciudadana al 70%, Admin Dashboard al 40%

---

### Semana 5: Realtime WebSocket + Alertas + Moderación

| Día | Tarea | Responsable | Horas | Deliverable |
|-----|-------|-------------|-------|------------|
| **Lunes (Día 29)** | | | | |
| | WebSocket realtime (Socket.io Backend) | Backend | 5 | Socket.io server emitiendo eventos |
| | Conexión realtime en mapa Admin (Cliente) | Frontend | 4 | Mapa actualizando en tiempo real |
| | Alertas sonoras (Audio API) | Frontend | 3 | Audio de alerta para prioridad ALTA |
| **Martes (Día 30)** | | | | |
| | Estados de reportes (NUEVO → EN PROCESO → RESUELTO) | Backend | 3 | Enum + lógica de transiciones |
| | Filtros en Admin (por estado, prioridad, tipo) | Frontend | 4 | Filtros funcionales en Dashboard |
| | Búsqueda por ubicación (Leaflet click) | Frontend | 3 | Click en mapa → zoom a reporte |
| **Miércoles (Día 31)** | | | | |
| | Módulo de moderación (marcar como falso) | Frontend | 4 | Botón + confirmación para reportes falsos |
| | Endpoint PATCH /reports/:id (cambiar estado) | Backend | 3 | API para actualizar estado |
| | Notificaciones Telegram bot (setup) | Backend | 3 | Webhook a Telegram para alertas ALTA |
| **Jueves (Día 32)** | | | | |
| | Asignación de patrullas (dropdown en Admin) | Frontend | 3 | Selector de unidades disponibles |
| | Tabla de unidades/patrullas (DB) | Backend | 2 | CREATE TABLE units |
| | Métricas de performance (RTT, latency) | QA | 3 | Benchmark report en staging |
| **Viernes (Día 33)** | | | | |
| | Integración completa Frontend-Backend (Pruebas E2E) | QA | 4 | E2E tests: Reporte → Alerta → Asignación |
| | Deploy a staging (Vercel + Supabase) | DevOps | 2 | URL staging funcional |
| | Reunión de avance | PM | 1 | Checkpoint (79% en tiempo) |
| **Sábado-Domingo** | Pruebas en staging, fixes críticos | Equipo | — | Sistema >90% funcional |

**Hito Semana 5:** MVP completo en staging, listo para pruebas de campo

---

### Semana 6: Optimización Final + Testing de Carga + Documentación

| Día | Tarea | Responsable | Horas | Deliverable |
|-----|-------|-------------|-------|------------|
| **Lunes (Día 36)** | | | | |
| | Optimización de queries PostgreSQL | Backend | 4 | Query performance < 100ms |
| | Caching estratégico (Redis / memory) | Backend | 3 | Cache layer para reportes frecuentes |
| | Compresión de JS/CSS bundles | Frontend | 2 | Gzip + minificación |
| **Martes (Día 37)** | | | | |
| | Test de carga (50 usuarios simultáneos) | QA | 4 | Load test report, bottlenecks identificados |
| | Test de carga fase 2 (100 usuarios) | QA | 4 | Stress test report |
| | Optimización backend basada en carga | Backend | 3 | Fixes de performance |
| **Miércoles (Día 38)** | | | | |
| | Documentación técnica (README.md) | Tech Writer | 3 | Setup guide + architecture diagram |
| | Documentación de API (Swagger) | Backend | 2 | API docs auto-generadas |
| | Manual de operador (borrador) | Tech Writer | 4 | Guía de 5 páginas para Dashboard |
| **Jueves (Día 39)** | | | | |
| | Testing offline-first en zonas rurales (simulación) | QA | 3 | Offline sync verification report |
| | Pruebas de seguridad básica (OWASP) | Security | 3 | Security audit + checklist |
| | Testing de recuperación ante desastres | DevOps | 2 | DB restore procedure validated |
| **Viernes (Día 40)** | | | | |
| | Refinamiento de UI/UX (feedback usuarios) | Frontend + QA | 3 | Cambios menores aplicados |
| | Prueba final E2E en staging | QA | 2 | Final validation checklist |
| | Reunión de cierre Fase 2 (Go/No-Go) | PM + Equipo | 2 | Decisión de pasar a Fase 3 |
| **Sábado-Domingo** | Buffer / últimos ajustes | Equipo | — | Sistema en staging 100% funcional |

**Hito Semana 6:** MVP completo, testeado, documentado y listo para producción

**Estado Fin Fase 2:** ✅ Listo para pasar a Fase 3

---

## FASE 3: Pruebas de Campo y Pilotaje
**Semanas 7-8 (14 días naturales)**

### Semana 7: Pruebas de Campo Intensivas

| Día | Tarea | Responsable | Horas | Deliverable |
|-----|-------|-------------|-------|------------|
| **Lunes (Día 43)** | | | | |
| | Setup del entorno de testing | QA + Técnico | 2 | Equipos listos, app en staging |
| | Capacitación rápida operadores Comisión (1h) | Trainer | 1 | Operadores entienden Dashboard |
| | Prueba 1: Punto crítico Ruta del Spondylus km 30 | QA + Operadores | 4 | 20 reportes de prueba, validación de GPS |
| **Martes (Día 44)** | | | | |
| | Prueba 2: Centro cantonal Santa Elena | QA + Operadores | 4 | 15 reportes, validación de envío |
| | Análisis de tiempos de transmisión | QA | 2 | RTT promedio < 500ms ✓ |
| | Recolección de feedback de operadores | PM | 2 | Notas de UX/usabilidad |
| **Miércoles (Día 45)** | | | | |
| | Prueba 3: Zonas rurales sin cobertura (Manglaralto) | QA + Operadores | 4 | Validar offline-first + sync posterior |
| | Test de geofencing (reportes fuera del cantón) | QA | 2 | Validar que rechaza ubicaciones externas |
| | Análisis de consumo de datos móviles | QA | 2 | Confirmar < 2MB por reporte |
| **Jueves (Día 46)** | | | | |
| | Prueba 4: Validación de spam/false reportes | QA | 3 | Rate limiting funciona ✓ |
| | Prueba 5: Rendimiento de imágenes (compresión) | QA | 2 | Imágenes llegan correctamente < 200KB |
| | Prueba 6: Notificaciones Telegram a supervisores | QA | 2 | Webhook funciona, alertas llegan |
| **Viernes (Día 47)** | | | | |
| | Compilación de resultado de pruebas de campo | QA + PM | 3 | Test report: Pass/Fail análisis |
| | Identificación de bugs y hotfixes | Dev Team | 3 | Lista de issues para fixes rápidos |
| | Reunión de avance | PM + Equipo | 1 | Decisión de fixes a aplicar |
| **Sábado-Domingo** | Aplicar fixes críticos, validación final | Equipo | — | Todos los bugs resueltos |

**Hito Semana 7:** Sistema validado operacionalmente, bugs corregidos

---

### Semana 8: Último Testing + Deploy a Producción + Capacitación

| Día | Tarea | Responsable | Horas | Deliverable |
|-----|-------|-------------|-------|------------|
| **Lunes (Día 50)** | | | | |
| | Test de carga final (100 reportes simultáneos) | QA | 4 | Load test report aprobado |
| | Test de recuperación ante desastres | DevOps | 2 | Restore procedure verificado |
| | Backup de staging → production DB snapshot | DevOps | 1 | Backup confirmado |
| | Preparación de datos iniciales (cantón, paroquias) | Backend | 3 | Data seed script listo |
| **Martes (Día 51)** | | | | |
| | Deploy a producción (transitoalertase.ec) | DevOps | 3 | Sistem live en prod |
| | Verificación de infraestructura en producción | DevOps | 2 | SSL, DNS, CDN funcionando |
| | Monitoreo inicial (Sentry + Vercel Analytics) | DevOps | 1 | Dashboards monitoreados |
| | Impresión y distribución de QR (500 unidades) | Logística | — | QR distribuido en transporte, semáforos |
| **Miércoles (Día 52)** | | | | |
| | Jornada 1 de Capacitación: Operadores (2h) | Trainer | 2 | 10-12 operadores certificados |
| | Entrega de manuales impresos | Trainer | 1 | Manual de operador en mano |
| | Soporte L1 post-capacitación (preguntas) | Tech Support | 2 | FAQ respondidas |
| **Jueves (Día 53)** | | | | |
| | Jornada 2 de Capacitación: Supervisores (2h) | Trainer | 2 | 3-4 supervisores certificados |
| | Capacitación en análisis de reportes/KPIs | Trainer | 1.5 | Supervisores entienden dashboard avanzado |
| | Sesión de preguntas y respuestas | Trainer | 1 | Clarificaciones resueltas |
| **Viernes (Día 54)** | | | | |
| | Socialización Parroquia Manglaralto (1.5h) | Community Lead | 1.5 | ~50 ciudadanos conocen la app |
| | Socialización Parroquia Colonche (1.5h) | Community Lead | 1.5 | ~50 ciudadanos participan |
| | Socialización Parroquia Chanduy (1.5h) | Community Lead | 1.5 | ~50 ciudadanos capacitados |
| | Recolección de feedback ciudadano | PM | 1.5 | Notas de adopción |
| **Sábado (Día 55)** | | | | |
| | Entrega de documentación completa | Tech Writer | 2 | README + Manual + API docs |
| | Entrega de repositorio GitHub a Comisión | DevOps | 1 | Access configurado, issues seeding listo |
| | Firma de Acta de Entrega y SLA | PM + Comisión | 1 | Documento legal firmado |
| | Reunión final de cierre (lecciones aprendidas) | PM + Equipo | 2 | Retrospective + commitment post-piloto |
| **Domingo (Día 56)** | | | | |
| | Monitoreo de producción 24/7 | Tech Support | — | Sistema running, alertas monitoreadas |
| | Disponibilidad de soporte técnico emergencias | Tech Support | — | Team en guardia |

**Hito Semana 8:** SISTEMA EN PRODUCCIÓN, EQUIPO CAPACITADO, COMISIÓN OPERANDO

**Estado Fin Fase 3 + 4:** ✅ PROYECTO ENTREGADO

---

## Cronograma Visual Detallado

```
SEMANA      1     2     3     4     5     6     7     8
            (14 d) (14 d)(14 d)(14 d)(14 d)(14 d)(14 d)(14 d)

FASE 1    [====][====]
          Kickoff Diseño Tech Setup
          
FASE 2              [====][====][====][====]
                    Frontend-Backend MVP Stagaging
                    
FASE 3                                    [====][====]
                                          Pruebas Prod
                                          
FASE 4                                         [====]
                                               Cierre
                                               
Hitos Diarios Clave:
D1  │ Kickoff
D11 │ Fase 1 completa
D25 │ MVP Ciudadano v1
D40 │ Sistema en staging 100%
D50 │ Test de carga final
D51 │ DEPLOY A PRODUCCIÓN
D56 │ Sistema entregado
```

---

## Recursos Estimados por Semana

| Semana | Full-Time | Part-Time | Reuniones | Horas Totales |
|--------|-----------|-----------|-----------|---------------|
| **S1** | Backend, Frontend, UI/UX, DevOps | PM, QA | 3 jornadas | 160h |
| **S2** | Backend, Frontend, UI/UX, DevOps | PM, QA | 2 jornadas | 155h |
| **S3** | Backend, 2x Frontend, QA | PM, DevOps | Daily standups | 180h |
| **S4** | Backend, 2x Frontend, QA | PM, DevOps | Daily standups | 185h |
| **S5** | Backend, 2x Frontend, QA | PM, DevOps | Daily standups | 180h |
| **S6** | Backend, 2x Frontend, QA | PM, Tech Writer | Daily standups | 175h |
| **S7** | Full team en campo | Trainer, PM | Pruebas en vivo | 140h |
| **S8** | DevOps, Trainer, Support | Full team | Capacitaciones | 130h |
| **TOTAL** | — | — | — | **1,305 horas** |

---

## Puntos de Control (Gates)

| Punto de Control | Semana | Criterio de Go/No-Go | Responsable |
|------------------|--------|----------------------|------------|
| **Especificación Técnica Completa** | Fin S2 | Documento firmado, diseño aprobado | CTO + PM |
| **MVP en Staging** | Fin S5 | E2E tests pasando 95%+, performance OK | QA + DevOps |
| **Pruebas de Campo OK** | Fin S7 | Cero bugs críticos, UX validada | QA + Operadores |
| **Deploy a Producción** | Inicio S8 | Infraestructura verificada, backups OK | DevOps |
| **Capacitación Completada** | Fin S8 | 100% operadores certificados | Trainer |
| **Go-Live Final** | Fin S8 | Sistema operando, SLA firmado | PM + Comisión |

---

## PROTOCOLO DE OPERACIÓN

### 1. Procesos Ciudadanos

#### 1.1 Acceso a la Plataforma
```
PASO 1: Descubrimiento
  └─ Escanear código QR en transporte público
  └─ Buscar en navegador: transitoalertase.ec
  └─ Recibir SMS con enlace (si se integra con celulares)

PASO 2: Autorización de Permisos
  ├─ Solicitud de acceso a GPS
  ├─ Solicitud de acceso a cámara
  ├─ Mostrar radiante de error (ej. ±12 metros)
  └─ Usuario autoriza o continúa sin GPS (manual)

PASO 3: Carga del Formulario (< 2 segundos)
  └─ Conexión a API Backend
  └─ Si sin conexión: Usar IndexedDB local
```

#### 1.2 Reporte de Incidente (30 segundos promedio)
```
PASO 1: Seleccionar Tipo de Incidente
  Opciones predefinidas:
  ├─ Accidente vehicular
  ├─ Semáforo fuera de servicio
  ├─ Vía bloqueada (derrumbe, árbol caído)
  ├─ Peligro en calzada (bache, objetos)
  ├─ Congestión importante
  ├─ Robo / Asalto
  └─ Otro (especificar)

PASO 2: Nivel de Prioridad
  ├─ 🔴 ALTA: Riesgo inmediato (accidente activo, bloqueo total)
  ├─ 🟡 MEDIA: Molestia importante (semáforo sin funcionar, congestión)
  └─ 🟢 BAJA: Información menor (bache pequeño, objeto menor)

PASO 3: Captura de Ubicación
  ├─ GPS automático: Mostrar pin en mapa
  ├─ Opción manual: Usuario arrastra pin a ubicación exacta
  └─ Mostrar dirección aproximada (Ruta del Spondylus, Km 30, etc.)

PASO 4: Fotografía
  ├─ Abrir cámara nativa
  ├─ Capturar imagen (solo fotos recientes, no galería)
  ├─ Validar EXIF (timestamp coherente)
  └─ Compresión automática WebP + 200KB máx.

PASO 5: Descripción Breve (Opcional)
  ├─ Campo de texto libre: máx. 140 caracteres
  ├─ Placeholder: "Ej: Congestionamiento por accidente"
  └─ No es requerido, pero incentivado

PASO 6: Envío
  ├─ Botón "ENVIAR REPORTE"
  ├─ Confirmación visual: "Reporte enviado ✓"
  └─ Si offline: "Enviado cuando haya conexión"
```

#### 1.3 Validación Automática (Lado Servidor)
```
VALIDACIÓN 1: Geofencing
  ├─ PostGIS ST_Contains: Verificar si coordenadas caen dentro del cantón
  ├─ Si FUERA del cantón: Rechazar con mensaje "Fuera de cobertura"
  └─ Si DENTRO: Continuar

VALIDACIÓN 2: Imagen EXIF
  ├─ Verificar que timestamp de foto sea coherente (no de 2020)
  ├─ Si EXIF inválido: Requerir captura directa de cámara
  └─ Si válido: Continuar

VALIDACIÓN 3: Rate Limiting
  ├─ Device Fingerprint (localStorage UUID)
  ├─ Si 3+ reportes en últimos 10 minutos: Bloquear temporalmente
  └─ Si dentro de límite: Continuar

VALIDACIÓN 4: Inserción en BD
  ├─ Crear registro en tabla "incidentes" con:
  │  ├─ ID único (UUID)
  │  ├─ Coordenadas (punto geográfico)
  │  ├─ Tipo de incidente
  │  ├─ Prioridad
  │  ├─ Foto (URL en cloud storage)
  │  ├─ Descripción (si aplica)
  │  ├─ Timestamp de recepción
  │  ├─ Estado inicial: "NUEVO"
  │  └─ Device Fingerprint (para auditoría)
  └─ Notificar al Dashboard en tiempo real (WebSocket)
```

---

### 2. Procesos de la Comisión de Tránsito

#### 2.1 Acceso al Dashboard
```
AUTENTICACIÓN:
  ├─ URL restringida: admin.transitoalertase.ec
  ├─ Acceso por usuario/contraseña (gestión manual de credenciales)
  ├─ Rol 1: Operador (recibe alertas, asigna patrullas)
  ├─ Rol 2: Supervisor (valida, cierra incidentes)
  └─ Rol 3: Admin (gestión de usuarios, reportes)

VISTA GENERAL:
  ├─ Mapa interactivo con todos los reportes actuales
  ├─ Filtros:
  │  ├─ Por estado (NUEVO, EN PROCESO, RESUELTO)
  │  ├─ Por prioridad (ALTA, MEDIA, BAJA)
  │  ├─ Por tipo de incidente
  │  ├─ Por rango de fecha
  │  └─ Por parroquia/zona
  ├─ Panel lateral con lista resumida
  └─ Contador de reportes sin atender (NUEVO)
```

#### 2.2 Proceso de Gestión de Reporte

```
ESTADO 1: NUEVO (Entrada)
  ├─ Reporte llega desde ciudadano
  ├─ Alerta sonora en Dashboard (puede desactivarse si se atiende)
  ├─ Si Prioridad ALTA y sin interacción en 15 min → Webhook a supervisor
  └─ Operador visualiza detalles:
     ├─ Foto grande
     ├─ Tipo de incidente
     ├─ Prioridad
     ├─ Ubicación exacta en mapa
     ├─ Descripción ciudadana (si aplica)
     └─ Tiempo desde reporte

ESTADO 2: EN PROCESO (Respuesta)
  ├─ Operador valida información:
  │  ├─ ¿La foto corresponde al incidente?
  │  ├─ ¿La ubicación es correcta?
  │  ├─ ¿El tipo de incidente es correcto?
  │  └─ ¿Es un reporte válido o falso?
  │
  ├─ Si válido → Asignar patrulla:
  │  ├─ Seleccionar unidad disponible de lista
  │  ├─ Cambiar estado a "EN PROCESO"
  │  ├─ Sistema registra timestamp de asignación
  │  └─ Almacenar nota del operador (si aplica)
  │
  └─ Si inválido → Marcar como Falso:
     ├─ Botón "MARCAR COMO FALSO"
     ├─ Cambiar estado a "RECHAZADO"
     ├─ Registrar Device Fingerprint para análisis de spam
     ├─ Si 2+ reportes falsos de mismo device → Blacklist temporal
     └─ Notificar a supervisor

ESTADO 3: RESUELTO (Cierre)
  ├─ Patrulla llega al sitio y resuelve incidente
  ├─ Operador recibe confirmación (SMS/radio)
  ├─ Cambiar estado a "RESUELTO"
  ├─ Registrar nota final (ej: "Semáforo reparado")
  ├─ Sistema calcula:
  │  ├─ Tiempo desde recepción hasta resolución
  │  ├─ Tiempo desde asignación hasta resolución
  │  └─ Verifica si cumplió SLA (8 min para ALTA)
  └─ Archivo para análisis

TIEMPO DE RESPUESTA MEDIDO:
  ├─ T1 (Recepción): Cuando ciudadano envía reporte
  ├─ T2 (Notificación): Cuando llega a Dashboard
  ├─ T3 (Asignación): Cuando operador cambia a "EN PROCESO"
  ├─ T4 (Resolución): Cuando se marca "RESUELTO"
  └─ KPI: T3 - T1 debe ser < 8 minutos (Prioridad ALTA)
```

#### 2.3 Moderación y Control de Calidad
```
VERIFICACIÓN DE REPORTES:
  ├─ Operador valida imagen vs. tipo de incidente vs. ubicación
  ├─ Si coherencia baja → Marcar como "Requiere Revisión Manual"
  └─ Supervisor revisa reportes marcados

DETECCIÓN DE SPAM:
  ├─ Sistema detecta automáticamente:
  │  ├─ Múltiples reportes del mismo device en corto tiempo
  │  ├─ Ubicaciones imposibles (de un lado a otro del cantón en 30 seg)
  │  ├─ Fotos con EXIF inconsistentes
  │  └─ Palabras clave sospechosas en descripción
  │
  └─ Operador puede marcar manualmente:
     ├─ Botón "MARCAR COMO FALSO/SPAM"
     ├─ Requiere confirmación para evitar errores
     └─ Acumular 2+ para blacklist del device

REPORTES A EXCLUIR (Política):
  ├─ Publicidad o autopromoción
  ├─ Contenido político/partidario
  ├─ Imágenes adultas o inapropiadas
  ├─ Información no vial
  └─ Reportes duplicados (misma ubicación en 5 minutos)
```

#### 2.4 Alertas y Notificaciones
```
ALERTAS INTERNAS (Dashboard):
  ├─ 🔴 ROJO: Incidente ALTA Prioridad sin asignar → Sonido loud
  ├─ 🟡 AMARILLO: Incidente MEDIA > 5 min sin asignar → Sonido suave
  ├─ 🟢 VERDE: Incidente BAJA → Sin sonido (solo visual)
  └─ Alerta se silencia cuando operador cambia estado a "EN PROCESO"

NOTIFICACIONES EXTERNAS:
  ├─ Si Prioridad ALTA sin interacción 15 minutos:
  │  └─ Enviar Webhook a Telegram Bot (grupo de supervisores)
  │     └─ Mensaje: "ALERTA: [Tipo] en [Ubicación] - Sin atender por 15 min"
  │
  └─ Si Prioridad ALTA sin resolver en 45 minutos:
     └─ Enviar notificación a supervisor en turno
```

---

### 3. Mantenimiento y Monitoreo

#### 3.1 Horario de Operación
```
OPERACIÓN NORMAL:
  ├─ Lunes a Viernes: 06:00 - 22:00 (Operadores presentes)
  ├─ Fines de semana: 06:00 - 22:00 (Operadores reducidos)
  ├─ Fuera de horario: Sistema recibe reportes, notificación manual
  └─ Emergencias 24/7: Sistema funciona, supervisores en guardia

MANTENIMIENTO:
  ├─ Ventanas de mantenimiento: Domingos 23:00 - 00:30 (máximo 30 min)
  ├─ Backups automáticos: Diarios a las 03:00
  └─ Monitoreo continuo de uptime
```

#### 3.2 Escalabilidad de Turnos
```
TURNO MAÑANA (06:00 - 14:00):
  ├─ 1-2 Operadores en Dashboard
  ├─ 1 Supervisor de zona
  └─ Soporte técnico on-call

TURNO TARDE (14:00 - 22:00):
  ├─ 2 Operadores en Dashboard
  ├─ 1 Supervisor
  └─ Soporte técnico on-call

TURNO NOCHE (22:00 - 06:00):
  ├─ Sistema funciona automáticamente
  ├─ 1 Supervisor en guardia (disponible)
  ├─ Notificaciones a supervisores si ALTA Prioridad
  └─ Reporte manual en la mañana
```

---

## PLAN DE CAPACITACIÓN

### 1. Estructura General de Capacitación

```
Beneficiarios:
├─ Operadores de Tránsito (10-15 personas)
├─ Supervisores de Turno (3-4 personas)
├─ Administrador de Sistema (1 persona)
├─ Líderes Comunitarios (6-10 personas)
└─ Ciudadanía General (abierto)

Modalidad:
├─ Capacitaciones presenciales (3-4 horas cada una)
├─ Manuales impresos (fácil de consultar)
├─ Videos tutoriales (YouTube privado o QR)
└─ Asistencia técnica permanente (teléfono/correo)

Calendario:
├─ Semana 9: Capacitación operadores (2 jornadas)
├─ Semana 10: Socialización ciudadana (3 parroquias)
└─ Post-lanzamiento: Soporte y refuerzos trimestrales
```

### 2. Módulos de Capacitación

#### 2.1 MÓDULO 1: Operadores de Tránsito (2 horas)

**Objetivo:** Que operadores dominen el Dashboard de control

**Contenido:**

1. **Acceso y Navegación (20 min)**
   - Iniciar sesión en admin.transitoalertase.ec
   - Explorar interfaz general
   - Entender paneles y secciones

2. **Lectura e Interpretación de Reportes (40 min)**
   - Visualizar información del reporte en mapa
   - Acceder a foto, tipo, prioridad, ubicación
   - Entender timestamp de recepción
   - Validar coherencia foto vs. descripción
   - Identificar reportes sospechosos
   - Ejercicio práctico: 5 reportes simulados

3. **Gestión de Reportes (30 min)**
   - Cambiar estado: NUEVO → EN PROCESO → RESUELTO
   - Asignar patrulla desde lista de disponibles
   - Registrar notas de operador
   - Marcar como falso (con confirmación)
   - Ejercicio práctico: Flujo completo de un reporte

4. **Alertas y Notificaciones (15 min)**
   - Entender alertas sonoras (silenciar vs. snoozar)
   - Recibir notificaciones vía Telegram
   - Interpretar prioridades de color
   - Qué hacer si alerta no aparece

5. **Troubleshooting Básico (15 min)**
   - Qué hacer si se congela el Dashboard
   - Recargar página / limpiar caché
   - Contacto para soporte técnico
   - Escalación a supervisor

**Materiales:**
- Manual impreso (10 páginas, con capturas de pantalla)
- Acceso a sistema de staging para práctica
- Video tutorial (8 minutos) disponible en YouTube
- Certificado de participación (digital + impreso)

**Evaluación:**
- Prueba práctica en sistema staging
- Quiz de 10 preguntas (mínimo 80% para certificado)
- Feedback del facilitador

---

#### 2.2 MÓDULO 2: Supervisores (2 horas)

**Objetivo:** Que supervisores dominen monitoreo, escalación y análisis

**Contenido:**

1. **Acceso Administrativo (15 min)**
   - Iniciar sesión como Supervisor
   - Roles y permisos diferenciados
   - Acceso a reportes históricos

2. **Dashboard de Supervisión (30 min)**
   - Ver resumen de todas las operaciones
   - Indicadores en vivo: reportes sin atender, tiempo promedio
   - Gráficos de volumen por hora/día/semana
   - Filtros y búsquedas avanzadas
   - Ejercicio: Encontrar incidente específico

3. **Escalación y Alertas (30 min)**
   - Recibir notificaciones de Telegram
   - Interpretar alertas de SLA incumplidas
   - Contactar operadores si necesario
   - Reescalación a jefatura

4. **Reportes y Análisis (25 min)**
   - Exportar datos de reportes (CSV/JSON)
   - Análisis de puntos críticos (calor map)
   - Identificar tendencias (ej: accidentes viernes 18h)
   - Genera reportes para toma de decisiones

5. **Gestión de Recursos (20 min)**
   - Gestionar usuarios y credenciales
   - Cambiar roles de operadores
   - Backup de datos
   - Contacto con soporte técnico

**Materiales:**
- Manual supervisor (15 páginas)
- Video tutorial (10 minutos)
- Acceso a dashboards de análisis
- Plantillas de reportes mensuales

**Evaluación:**
- Capacidad de generar reportes
- Quiz de 15 preguntas (mínimo 80%)
- Aprobación de jefatura

---

#### 2.3 MÓDULO 3: Líderes Comunitarios (1.5 horas)

**Objetivo:** Que líderes comunitarios promuevan y enseñen a ciudadanía

**Contenido:**

1. **¿Qué es Tránsito Alerta SE? (15 min)**
   - Problema que resuelve
   - Beneficios para la comunidad
   - Casos de éxito (simulados o reales)

2. **Cómo Usar la App Ciudadana (30 min)**
   - Acceder sin descargar app
   - Autorizar GPS y cámara
   - Llenar formulario en 30 segundos
   - Seleccionar prioridad correcta
   - Enviar reporte
   - Ejercicio práctico con teléfonos reales

3. **Ventajas de Reportar (15 min)**
   - Anonimidad garantizada
   - Sin costo de datos (información general)
   - Respuesta rápida de autoridades
   - Contribuir a seguridad vial de todos

4. **Preguntas Frecuentes (15 min)**
   - ¿Es seguro dar mi ubicación?
   - ¿Puedo reportar si no tengo foto?
   - ¿Qué pasa si se envía sin conexión?
   - ¿Me pueden identificar?
   - Contacto de soporte

5. **Plan de Promoción (30 min)**
   - Distribuir códigos QR en paradas
   - Convocar a vecinos a usar
   - Recolectar feedback
   - Incentivar participación

**Materiales:**
- Folleto trilingüe (español/inglés, 2 páginas)
- Códigos QR para imprimir
- Video de 2 minutos (cómo reportar)
- Listas de contacto de técnico

**Evaluación:**
- Asistencia y participación
- Capacidad de enseñar a otros
- Certificado de líder comunitario

---

#### 2.4 MÓDULO 4: Ciudadanía General (Socialización)

**Formato:** Jornadas de 1.5 horas en espacios comunitarios (gabinetes parroquiales, cooperativas de transporte, mercados)

**Contenido:**
1. Presentación del proyecto (10 min)
2. Demo en vivo desde celular (10 min)
3. Práctica con teléfonos de participantes (30 min)
4. Preguntas y respuestas (20 min)
5. Entrega de códigos QR impresos (10 min)

**Jornadas Programadas:**
- Semana 10, Jueves: Parroquia Manglaralto (Gabinete Parroquial)
- Semana 10, Viernes: Parroquia Colonche (Escuela Pública)
- Semana 10, Sábado: Parroquia Chanduy (Cooperativa de Transporte)

**Meta de Asistencia:** Mínimo 50 personas por jornada

---

### 3. Soporte Post-Capacitación

#### 3.1 Canales de Soporte
```
PARA OPERADORES/SUPERVISORES:
  ├─ Teléfono directo: [Teléfono del Técnico]
  ├─ Correo: soporte@transitoalertase.ec
  ├─ WhatsApp grupo: Grupo de operadores
  └─ Horario: Lunes-Viernes 08:00-17:00

PARA CIUDADANÍA:
  ├─ FAQ en web (transitoalertase.ec/ayuda)
  ├─ Chat bot (responde preguntas comunes)
  ├─ Email: ciudadanos@transitoalertase.ec
  └─ Horario: Lunes-Viernes 09:00-16:00

EMERGENCIAS TÉCNICAS:
  ├─ Si Dashboard no funciona → Contactar supervisor
  ├─ Si app ciudadana no carga → Limpiar caché/cookies
  └─ Support técnico on-call 24/7
```

#### 3.2 Refuerzos Trimestrales
```
MES 4 (Post-Piloto):
  ├─ Reunión de lecciones aprendidas
  ├─ Ajustes a protocolo de operación
  └─ Actualización de credenciales

MES 7:
  ├─ Refresco de capacitación operadores (nuevas funciones)
  ├─ Análisis de indicadores KPI
  └─ Retroalimentación ciudadana

MES 12:
  ├─ Evaluación anual del sistema
  ├─ Renovación de certificaciones
  └─ Planificación de mejoras para Año 2
```

---

## PRESUPUESTO Y RECURSOS

### 1. Inversión Directa Requerida

| Rubro | Proveedor | Cantidad | Valor Unitario | Subtotal |
|-------|-----------|----------|----------------|----------|
| **Dominio .ec** | NIC.ec / Registrador | 1 año | $35.00 | $35.00 |
| **Adhesivos QR** (10x10 cm, material resistente) | Imprenta Local | 500 unidades | $0.12 | $60.00 |
| **Capacitación en Territorio** (gasolina, refrigerios, materiales impresos para 6 jornadas) | Presupuesto interno | 6 jornadas | $20.00 | $120.00 |
| **Manuales Impresos** (30 guías rápidas, 20 páginas c/u, a color) | Imprenta Local | 30 kits | $1.17 | $35.00 |
| **Contingencia** (10% buffer) | — | — | — | $25.00 |
| **TOTAL INVERSIÓN DIRECTA** | — | — | — | **$275.00** |

**Nota:** Presupuesto flexible. Puede reducirse a $200 si se usa material digital exclusivamente.

---

### 2. Aporte en Especie (Desarrollo Técnico)

| Rol | Especialidad | Horas | Tarifa de Mercado | Subtotal |
|-----|--------------|-------|-------------------|----------|
| **Fullstack Developer** | React, Node.js, PostgreSQL, PostGIS | 120 | $25/hr | $3,000.00 |
| **QA Engineer** | Testing, optimización, pruebas de campo | 40 | $20/hr | $800.00 |
| **UX/UI Designer + Materiales** | Diseño responsive, QR, collaterals | 20 | $20/hr | $400.00 |
| **Project Manager** (tiempo coordinación) | Reuniones, reportes, documentación | 30 | $15/hr | $450.00 |
| **Técnico Soporte** (Post-lanzamiento 3 meses) | Mantenimiento, soporte L1-L2 | 60 | $15/hr | $900.00 |
| **TOTAL APORTE TÉCNICO (Especie)** | — | 270 | — | **$5,550.00** |

**Interpretación:** El proyecto genera USD $5,550 en valor técnico que es financiado por el programa Jóvenes en Acción.

---

### 3. Costos Operativos (Anual, Post-Piloto)

| Rubro | Proveedor | Costo Mensual | Costo Anual |
|-------|-----------|--------------|------------|
| **Hosting Frontend** | Vercel Free Tier | $0.00 | $0.00 |
| **Base de Datos PostgreSQL + PostGIS** | Supabase Free Tier | $0.00 | $0.00 |
| **Mapas (OpenStreetMap + Leaflet)** | Open Source | $0.00 | $0.00 |
| **Certificado SSL** | Let's Encrypt | $0.00 | $0.00 |
| **Dominio .ec** | NIC.ec | $2.92 | $35.00 |
| **Soporte técnico emergencias** | On-demand | $0.00 | $0.00 |
| **TOTAL MENSUAL** | — | **$2.92** | — |
| **TOTAL ANUAL** | — | — | **$35.00** |

**Interpretación:** El costo operativo es negligible. La mayor inversión es el dominio anual.

---

### 4. Recursos Técnicos y Humanos

#### 4.1 Equipo de Desarrollo (10 semanas)

| Rol | Cantidad | Dedicación | Responsabilidades |
|-----|----------|-----------|-------------------|
| **Fullstack Developer** | 1 | 100% (40 hrs/semana) | Frontend PWA + Backend API + Base de datos |
| **Frontend Developer Junior** | 1 | 100% (40 hrs/semana) | Admin Dashboard + UI Components |
| **QA Engineer** | 1 | 50% (20 hrs/semana) | Testing, optimización, pruebas de campo |
| **UI/UX Designer** | 1 | 50% (20 hrs/semana) | Diseño, mockups, materiales |
| **Project Manager** | 1 | 30% (12 hrs/semana) | Coordinación, reportes, reuniones |

**Total:** 5 personas, 60 horas promedio/semana durante 10 semanas

#### 4.2 Equipo de Operación (Post-Lanzamiento)

| Rol | Cantidad | Dedicación | Responsabilidades |
|-----|----------|-----------|-------------------|
| **Operadores de Dashboard** | 2-3 | 40 hrs/semana c/u | Gestión de reportes, validación, despacho |
| **Supervisor de Turno** | 1 | 40 hrs/semana | Supervisión, escalación, análisis |
| **Técnico de Soporte** | 1 | 15 hrs/semana (shared con otros proyectos) | Mantenimiento, backups, troubleshooting |
| **Jefe de Tránsito** | 1 | 5 hrs/semana (coordinación) | Decisiones, escalaciones críticas |

---

### 5. Infraestructura Tecnológica Requerida

#### 5.1 Stack Elegido (Justificación)
```
FRONTEND:
  ├─ React 18+ (flexible, componentes reutilizables)
  ├─ Next.js (Server-Side Rendering, optimización SEO)
  ├─ Leaflet.js + OpenStreetMap (mapas sin costo)
  ├─ Workbox (Service Worker, offline-first)
  └─ Vercel/Netlify (hosting automático, zero-config)

BACKEND:
  ├─ Node.js + Express (JavaScript full-stack)
  ├─ Supabase (PostgreSQL managed + PostGIS)
  ├─ JWT tokens (autenticación stateless)
  ├─ Socket.io (WebSocket realtime)
  └─ CloudFlare (DNS, CDN, DDoS protection)

ALMACENAMIENTO:
  ├─ PostgreSQL + PostGIS (datos espaciales)
  ├─ Supabase Storage (imágenes en cloud)
  └─ Backups automáticos (diarios, 30 días retención)

OBSERVABILIDAD:
  ├─ Sentry (error tracking)
  ├─ Vercel Analytics (performance)
  └─ Supabase logs (BD y API logs)
```

#### 5.2 Capacidad de Servidor
```
ESTIMACIÓN DE CARGA:
  Día 1 (piloto limitado):     50 ciudadanos simultáneos
  Semana 2:                    200 ciudadanos/hora promedio
  Semana 8:                    500+ reportes/día

CAPACIDAD VERIFICADA:
  ├─ Supabase Free: 500 conexiones simultáneas ✅
  ├─ Vercel: 1000+ req/sec ✅
  ├─ PostgreSQL: Hasta 100 conexiones ✅
  ├─ WebSocket realtime: Hasta 1000 usuarios simultáneos ✅
  └─ Escalable a Plan Pagado sin modificación de código

CÁLCULOS DE ALMACENAMIENTO:
  ├─ 500 reportes × 150KB promedio (foto + datos) = 75 MB
  ├─ Supabase Free ofrece: 500 MB DB + 1 GB Storage ✅
  └─ Más que suficiente para piloto de 3 meses
```

---

### 6. Cronograma Presupuestario

| Fase | Concepto | Semana 1-2 | Semana 3-6 | Semana 7-8 | Semana 9-10 | Total |
|------|----------|-----------|-----------|-----------|------------|-------|
| **Infraestructura** | Dominio + Registros DNS | $35 | — | — | — | $35 |
| **Campo** | QR + Material impreso | — | — | $60 | — | $60 |
| **Capacitación** | Socialización (6 jornadas) | — | — | — | $120 | $120 |
| **Manuales** | Guías impresas + vídeos | — | $20 | — | $15 | $35 |
| **Contingencia** | Buffer 10% | — | — | — | $25 | $25 |
| **TOTAL INVERSIÓN** | | **$35** | **$20** | **$60** | **$160** | **$275** |

---

## ACTA DE COMPROMISO Y COLABORACIÓN

---

### ACTA DE COLABORACIÓN Y COMPROMISO INSTITUCIONAL

**PARA:** Comisión de Tránsito del Cantón Santa Elena  
**FECHA:** 31 de Julio de 2026  
**PROYECTO:** Tránsito Alerta SE (Sistema Web de Gestión Participativa de Incidencias Viales)

---

### I. PARTES INTERVINIENTES

#### PARTE A: Equipo de Desarrollo
- **Representante:** [Nombre del Coordinador del Proyecto]
- **Institución Afiliada:** Programa Jóvenes en Acción / [Universidad o Institución]
- **Correo:** desarrollo@transitoalertase.ec
- **Teléfono:** [Número de Contacto]

#### PARTE B: Comisión de Tránsito del Cantón Santa Elena
- **Representante:** [Nombre del Jefe/Director]
- **Cargo:** [Director/Comisionado de Tránsito]
- **Correo:** [Email Oficial]
- **Teléfono:** [Número Oficial]

---

### II. PROPÓSITO Y ALCANCE

Las partes acuerdan colaborar en el desarrollo, implementación y operación de **Tránsito Alerta SE**, una plataforma web progresiva de reporte ciudadano georreferenciado para mejorar la gestión de incidencias viales en el cantón Santa Elena.

**Alcance del Compromiso:**
- ✅ Desarrollo de plataforma web (PWA) ciudadana
- ✅ Desarrollo de Dashboard administrativo
- ✅ Implementación de infraestructura (hosting, base de datos)
- ✅ Capacitación a operadores y supervisores
- ✅ Soporte técnico durante pilotaje (3 meses)
- ✅ Transferencia de código fuente a la Comisión

**No incluido:**
- ❌ Modificaciones arquitectónicas mayores post-lanzamiento (evaluadas en fase 2)
- ❌ Integración con sistemas de terceros (ECU-911) sin especificación adicional
- ❌ Soporte técnico indefinido (limitado a 3 meses piloto)

---

### III. RESPONSABILIDADES DE CADA PARTE

#### A. Responsabilidades del Equipo de Desarrollo

1. **Desarrollo Técnico:**
   - ✅ Entregar PWA ciudadana funcional y responsive
   - ✅ Entregar Dashboard administrativo con mapas interactivos
   - ✅ Implementar arquitectura offline-first (IndexedDB + Service Worker)
   - ✅ Configurar PostGIS para validación geoespacial
   - ✅ Deploying en Vercel + Supabase (infraestructura seleccionada)

2. **Calidad y Testing:**
   - ✅ Realizar pruebas unitarias y E2E
   - ✅ Optimizar para conectividad lenta (2G/3G)
   - ✅ Validar en dispositivos móviles de gama baja
   - ✅ Realizar pruebas de campo con operadores reales

3. **Documentación:**
   - ✅ Documentación técnica (API, base de datos, arquitectura)
   - ✅ Manual de operación para usuarios institucionales
   - ✅ Guías de usuario para ciudadanía
   - ✅ Código fuente comentado y bien estructurado

4. **Capacitación:**
   - ✅ 2 sesiones de capacitación a operadores (2 hrs c/u)
   - ✅ 1 sesión de capacitación a supervisores (2 hrs)
   - ✅ 3 jornadas de socialización en parroquias (1.5 hrs c/u)
   - ✅ Materiales impresos (manuales, folletos, QR)

5. **Soporte Post-Lanzamiento:**
   - ✅ Soporte técnico durante 3 meses de pilotaje (L1-L2)
   - ✅ Hotline para emergencias técnicas
   - ✅ Backups diarios y plan de recuperación ante desastres
   - ✅ Actualizaciones críticas de seguridad

#### B. Responsabilidades de la Comisión de Tránsito

1. **Participación Institucional:**
   - ✅ Designar responsable de coordinación (1 persona)
   - ✅ Facilitar acceso a información y contexto vial
   - ✅ Participar en reuniones de diseño (Fase 1)
   - ✅ Proporcionar feedback en pruebas de campo

2. **Adopción y Operación:**
   - ✅ Asignar operadores para capacitación (mínimo 10 personas)
   - ✅ Proporcionar acceso a bases de datos de incidentes históricos (si disponibles)
   - ✅ Gestionar credenciales de Dashboard (usuarios/contraseñas)
   - ✅ Ejecutar protocolo de operación durante pilotaje
   - ✅ Reportar bugs y problemas al equipo técnico

3. **Compromiso de Recursos:**
   - ✅ Asignar 2-3 operadores en turnos para gestionar reportes
   - ✅ 1 supervisor de turno disponible
   - ✅ Proporcionar infraestructura para capacitaciones (sala, proyector, WiFi)
   - ✅ Disposición para cambios en procesos operativos

4. **Sostenibilidad Post-Pilotaje:**
   - ✅ Evaluar continuidad del sistema más allá de 3 meses
   - ✅ Definir plan de financiamiento (si fuera necesario)
   - ✅ Designar personal para mantenimiento local
   - ✅ Adopción de protocolos de seguridad y privacidad

---

### IV. INVERSIÓN Y FINANCIAMIENTO

#### Inversión Directa Requerida
- **Capital Semilla:** USD $250 (dominio, QR, socialización)
- **Aporte de Desarrollo:** USD $5,550 (desarrollo técnico, financiado por Jóvenes en Acción)
- **Costo Operativo Anual (Post-Piloto):** USD $35 (dominio)

#### Fuentes de Financiamiento
- **Inversión Directa (Capital Semilla):** A cargo de la Comisión de Tránsito o programa Jóvenes en Acción
- **Desarrollo Técnico:** Financiado 100% por Jóvenes en Acción (aporte en especie)

---

### V. CRONOGRAMA COMPROMETIDO

| Fase | Duración | Resultado Entregable | Responsable Primario |
|------|----------|---------------------|----------------------|
| **Fase 1** | Semanas 1-2 | Especificación técnica + Diseño | Equipo Desarrollo |
| **Fase 2** | Semanas 3-6 | MVP en staging + Testing | Equipo Desarrollo |
| **Fase 3** | Semanas 7-8 | Sistema validado en campo | Equipo + Comisión |
| **Fase 4** | Semanas 9-10 | Producción + Capacitación | Ambas partes |
| **Pilotaje** | Meses 1-3 | Operación con soporte | Comisión + Soporte L1 |

---

### VI. INDICADORES DE ÉXITO (KPI)

Ambas partes acuerdan medir el éxito según:

| Categoría | Indicador | Meta |
|-----------|-----------|------|
| **Técnico** | Disponibilidad del sistema | ≥ 99.5% uptime |
| **Técnico** | Precisión de geolocalización | ≤ 15 metros de error |
| **Operativo** | Tiempo de despacho (Alta Prioridad) | < 8 minutos |
| **Adopción** | Volumen de reportes válidos | ≥ 500 en 3 meses |
| **Cobertura** | Parroquias alcanzadas | 100% de parroquias cantonal |
| **Calidad** | Tasa de spam/falsos | < 8% del total |
| **Institucional** | Operadores capacitados | 100% del personal |

---

### VII. POLÍTICA DE PRIVACIDAD Y DATOS

- ✅ Sistema implementa anonimización por diseño (sin solicitar datos personales)
- ✅ Datos geoespaciales almacenados en servidor seguro (Supabase)
- ✅ Acceso restringido a operadores autorizados únicamente
- ✅ Datos históricos archivados tras 6 meses (LGPD Ecuador compliance)
- ✅ Auditoría de datos disponible a autoridades (bajo solicitud formal)

---

### VIII. TÉRMINOS DE TERMINACIÓN

#### 8.1 Terminación Mutua
Si una parte desea terminar la colaboración:
- Notificación formal con 15 días de anticipación
- Transferencia de código fuente a Comisión (si aplica)
- Documentación de estado del proyecto

#### 8.2 Causales de Resolución
- Incumplimiento grave de responsabilidades por una de las partes
- Cambios en políticas gubernamentales que hagan inviable el proyecto
- Falta de financiamiento de la inversión directa

---

### IX. DISPOSICIONES GENERALES

1. **Confidencialidad:** Ambas partes tratarán información sensible (datos ciudadanos, operacional) como confidencial.

2. **Propiedad Intelectual:** 
   - Código fuente: Licencia Open Source (MIT o GPL) — permitiendo uso y modificación de Comisión
   - Documentación: Pública y abierta
   - Marcas/logos: Acuerdo específico a definir

3. **Modificaciones:** Cualquier cambio a este acta requiere enmienda formal firmada por ambas partes.

4. **Legislación Aplicable:** Este acta se rige según leyes de la República del Ecuador.

---

### X. FIRMAS Y COMPROMISOS

**Por el Equipo de Desarrollo:**

Nombre: _________________________________  
Cargo: __________________________________  
Firma: __________________________________  
Fecha: __________________________________  

Nombre: _________________________________  
Cargo: __________________________________  
Firma: __________________________________  
Fecha: __________________________________  

---

**Por la Comisión de Tránsito del Cantón Santa Elena:**

Nombre: _________________________________  
Cargo: Jefe/Director de Tránsito  
Firma: __________________________________  
Fecha: __________________________________  

Nombre: _________________________________  
Cargo: __________________________________  
Firma: __________________________________  
Fecha: __________________________________  

---

### XI. TESTIGOS (Opcional)

Nombre: _________________________________  
Institución: _____________________________  
Firma: __________________________________  
Fecha: __________________________________  

---

**FIN DEL ACTA**

---

## ANEXOS RECOMENDADOS

Para complementar este documento, considere elaborar:

1. **ANEXO A:** Especificación Técnica Detallada (OpenAPI/Swagger)
2. **ANEXO B:** Políticas de Privacidad y Protección de Datos (LGPD Ecuador)
3. **ANEXO C:** Protocolo de Incident Response (Qué hacer si hay un incidente de seguridad)
4. **ANEXO D:** Matriz de Riesgos Detallada (con planes de mitigación específicos)
5. **ANEXO E:** Plan de Sostenibilidad Post-Pilotaje (opciones de financiamiento)

---

## DOCUMENTO PREPARADO POR

**Equipo de Desarrollo Técnico**  
Programa Jóvenes en Acción  
Fecha: 31 de Julio de 2026  

**Versión:** 1.0  
**Estado:** Listo para Presentación  

---

