# PROPUESTA FORMAL DE PROYECTO - BORRADOR
## TRÁNSITO ALERTA SANTA ELENA
### Sistema Web Participativo de Gestión de Incidencias Viales

**Presentado a:** Comisión de Tránsito del Cantón Santa Elena  
**Fecha:** 31 de Julio de 2026  
**Tipo:** Documento de Borrador - Validación de Estructura  
**Estado:** PARA CONSULTA Y RETROALIMENTACIÓN  
**Versión:** 1.0  

---

## TABLA DE CONTENIDOS

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Diagnóstico](#diagnóstico)
3. [Solución Propuesta](#solución-propuesta)
4. [Objetivos y Alcance](#objetivos-y-alcance)
5. [Viabilidad](#viabilidad)
6. [Cronograma](#cronograma)
7. [Presupuesto](#presupuesto)
8. [Matriz de Riesgos](#matriz-de-riesgos)
9. [Datos Requeridos de Comisión](#datos-requeridos-de-comisión)
10. [Acta de Compromiso](#acta-de-compromiso)

---

## RESUMEN EJECUTIVO

### Proyecto
**Tránsito Alerta SE** es plataforma web de reporte ciudadano georreferenciado que centraliza gestión de incidencias viales mediante participación comunitaria, análisis geoespacial y notificaciones en tiempo real.

### Alcance
- Aplicación web progresiva (PWA) para ciudadanía
- Dashboard administrativo para Comisión de Tránsito
- Notificaciones automáticas (Telegram, WhatsApp, Email)
- Base de datos geoespacial (PostgreSQL + PostGIS)
- Sincronización offline-first

### Impacto Esperado
- **30%** reducción en tiempos de respuesta
- **100%** cobertura de parroquias cantonal
- **500+** reportes validados (piloto 3 meses)
- **$0** costo operativo anual post-piloto

### Inversión
- **Capital semilla:** USD $250
- **Desarrollo (aporte Jóvenes en Acción):** USD $5,550
- **Costo anual post-piloto:** USD $35

---

## DIAGNÓSTICO

### Problema Actual
En cantón Santa Elena, incidencias viales (accidentes, semáforos dañados, vías bloqueadas, congestión) se reportan mediante redes sociales o llamadas telefónicas, sin:
- Ubicación geográfica exacta
- Clasificación de urgencia
- Trazabilidad de incidentes
- Base de datos histórica

**Consecuencias:** Demoras en respuesta (20-45 min), riesgos de accidentes secundarios, decisiones basadas en datos anecdóticos.

### Contexto
Santa Elena requiere herramienta digital que permita:
- Mejorar atención ciudadana y tiempos respuesta
- Generar información georreferenciada para análisis
- Identificar patrones y zonas críticas
- Fortalecer coordinación inter-departamental
- Alinearse con iniciativas nacionales de Gobierno Digital

---

## SOLUCIÓN PROPUESTA

### Componentes del Sistema

```
┌─────────────────────────────────────────────────────────┐
│         TRÁNSITO ALERTA SANTA ELENA                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  PORTAL CIUDADANO (PWA)    →    DASHBOARD ADMIN        │
│  ├─ GPS automático              ├─ Mapa realtime      │
│  ├─ Foto directa                ├─ Gestión reportes  │
│  ├─ Priorización                ├─ Alertas sonoras   │
│  ├─ Offline-first               ├─ Notificaciones    │
│  └─ Sinc automática             └─ Análisis/KPI      │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  INFRAESTRUCTURA (PostgreSQL + PostGIS + Supabase)     │
└─────────────────────────────────────────────────────────┘
```

### Características Principales

| Función | Detalle |
|---------|---------|
| **Acceso Ciudadano** | Web sin descargar app (navegador estándar) |
| **Ubicación** | GPS automático + validación manual |
| **Fotografía** | Captura directa (no galería), compresión WebP |
| **Categorización** | Tipo de incidente + prioridad (ALTA/MEDIA/BAJA) |
| **Offline-first** | Sincroniza reportes al recuperar conexión |
| **Dashboard Admin** | Mapa interactivo, filtros, asignación patrullas |
| **Alertas** | Telegram (ALTA prioritario), WhatsApp (fallback), Email (reportes) |
| **Disponibilidad** | 99.5% uptime, backup automático diario |

### Tecnología (100% Open Source)

| Componente | Herramienta | Costo |
|-----------|-----------|-------|
| Frontend | React/Next.js + Leaflet.js | $0 |
| Backend | Node.js + Express | $0 |
| Base de Datos | PostgreSQL + PostGIS | $0 |
| Hosting Frontend | Vercel Free Tier | $0 |
| Hosting Backend | Supabase Free Tier | $0 |
| Mapas | OpenStreetMap | $0 |
| SSL | Let's Encrypt | $0 |
| **Dominio .ec** | **NIC.ec** | **$35/año** |

---

## OBJETIVOS Y ALCANCE

### Objetivo General
Implementar plataforma web participativa que reduce tiempos de respuesta ante incidencias viales mediante reporte ciudadano georreferenciado y gestión administrativo centralizada.

### Objetivos Específicos

| # | Objetivo | KPI | Meta |
|---|----------|-----|------|
| 1 | Interfaz intuitiva | Tiempo reporte | ≤ 30 segundos |
| 2 | Dashboard operativo | Disponibilidad | 99.5% uptime |
| 3 | Participación ciudadana | Volumen reportes | ≥ 500 (piloto) |
| 4 | Cobertura territorial | Parroquias | 100% alcance |
| 5 | Respuesta rápida | Despacho ALTA | < 8 minutos |
| 6 | Calidad datos | Spam/falsos | < 8% total |

### Alcance del Piloto (3 meses)
✅ Desarrollo MVP completo  
✅ Pruebas de campo en 3 parroquias  
✅ Capacitación operadores  
✅ Soporte técnico L1-L2  
❌ Integración ECU-911 (Fase 2)  
❌ Integración sistemas patrullas (Fase 2)  

---

## VIABILIDAD

### Viabilidad Técnica ✅
- Stack comprobado (React, Node, PostgreSQL, PostGIS)
- Tecnologías Open Source = evita licencias
- Equipo con experiencia en PWA + GIS
- Infraestructura gratuita en capas pagadas disponibles

### Viabilidad Financiera ✅
- Inversión mínima (USD $250)
- Costo operativo negligible (USD $35/año)
- Aporte técnico financiado por Jóvenes en Acción
- Sin dependencia de proveedores propietarios

### Viabilidad Social ✅
- Acceso sin barreras (navegador web)
- Participación ciudadana incentivada
- Apoyo de autoridades de tránsito
- Alineación con políticas de Gobierno Digital

### Viabilidad de Escalabilidad ✅
- Modelo replicable a otros cantones
- Base de datos escalable (PostGIS)
- Arquitectura cloud-native

---

## CRONOGRAMA

### Fases Ejecutivas (8 semanas)

| Fase | Semanas | Resultado | Hito |
|------|---------|-----------|------|
| **1. Análisis & Diseño** | 1-2 | Especificación técnica completa | Día 14: Go para Fase 2 |
| **2. Desarrollo MVP** | 3-6 | PWA + Dashboard en staging | Día 42: MVP funcional |
| **3. Pruebas de Campo** | 7-8 | Sistema validado operativamente | Día 56: Ready producción |
| **4. Deploy & Cierre** | 8 (final) | Sistema vivo, operadores capacitados | Día 56: Go-live |

### Timeline Visual

```
SEMANA  |  1-2   |    3-6      |   7-8   |   8
        | DISEÑO |  DESARROLLO | PRUEBAS | DEPLOY
        |[====]  |  [========] | [===]   |[===]
Hitos:   D14    D25    D42      D56      D70
         ↓      ↓      ↓        ↓        ↓
        Spec   Frontend Backend Testing LIVE
```

**Recursos:** 5 personas (PM, 2x Frontend, Backend, QA)  
**Total:** ~1,300 horas

*Para cronograma detallado día a día, ver PROPUESTA-FORMAL-COMISION-TRANSITO.md sección 6.*

---

## PRESUPUESTO

### Inversión Directa (Capital Semilla)

| Rubro | Detalle | Costo |
|-------|---------|-------|
| Dominio .ec | 1 año hosting | $35 |
| Códigos QR | 500 unidades adhesivos | $60 |
| Socialización | 6 jornadas parroquias | $120 |
| Manuales impresos | 30 guías operador | $35 |
| Contingencia (10%) | Buffer | $25 |
| **TOTAL INVERSIÓN** | | **$275** |

### Costo Operativo Anual (Post-Piloto)
- Vercel (Frontend): $0
- Supabase (Backend): $0
- OpenStreetMap: $0
- Let's Encrypt (SSL): $0
- Dominio .ec: $35

**COSTO ANUAL TOTAL: USD $35**

### Aporte de Desarrollo (Jóvenes en Acción)

| Rol | Horas | Tarifa | Subtotal |
|-----|-------|--------|----------|
| Fullstack Developer | 120 | $25/h | $3,000 |
| QA Engineer | 40 | $20/h | $800 |
| UX/UI Designer | 20 | $20/h | $400 |
| PM & Support | 30 | $15/h | $450 |
| **TOTAL VALOR TÉCNICO** | **210** | | **$4,650** |

**Total inversión + desarrollo: USD $4,925**

---

## MATRIZ DE RIESGOS

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|------------|--------|-----------|
| Cobertura débil en zonas rurales | Alta | Alto | Arquitectura offline-first + IndexedDB |
| Reportes falsos/spam | Media | Alto | Rate limiting + geofencing + moderación manual |
| Imprecisión GPS gama baja | Media | Medio | Permitir corrección manual + margen error visible |
| Baja adopción ciudadana | Media | Alto | Socialización presencial + QR en transporte público |
| Saturación ancho banda (imágenes) | Baja | Medio | Compresión WebP client-side (200KB máx) |
| Incumplimiento SLA operador | Media | Medio | Alertas sonoras + escalación automática a supervisor |

---

## DATOS REQUERIDOS DE COMISIÓN

⚠️ **CRÍTICO:** Siguiente información necesaria antes de iniciar Fase 2. Comisión debe entregar en **Semana 1** (máximo Semana 2).

| Dato | Para Qué | Prioridad | Plazo |
|------|----------|-----------|-------|
| Catálogo Oficial de Incidentes | Opciones formulario PWA | 🔴 P0 | S1 |
| Política Datos Personales (LGPD) | Validación privacidad | 🔴 P0 | S1 |
| Capa Poligonal Cantón (Shapefile/GeoJSON) | Validación geofencing | 🔴 P0 | S1-S2 |
| Organigrama Departamentos | Routing automático reportes | 🔴 P0 | S1 |
| Manual Operaciones + Despacho | Ciclo de vida estados, SLA | 🟡 P1 | S2 |
| Matriz SLA Oficial | Tiempos respuesta exactos | 🟡 P1 | S2 |

**Documento de solicitud formal:** Ver `DocuSolicitar.md`  
**Análisis de gaps:** Ver `MATRIZ-OBSERVACIONES-vs-REQUERIMIENTOS.md`  
**Especificación técnica:** Ver `SRS.md` (versión provisional)

---

## ACTA DE COMPROMISO Y COLABORACIÓN

### PARTES INTERVINIENTES

**Parte A - Equipo de Desarrollo:**
- Representante: [Nombre Coordinador]
- Institución: Programa Jóvenes en Acción
- Contacto: desarrollo@transitoalertase.ec

**Parte B - Comisión de Tránsito del Cantón Santa Elena:**
- Representante: [Nombre Jefe de Tránsito]
- Cargo: [Cargo Oficial]
- Contacto: [Email Comisión]

### COMPROMISOS

#### Del Equipo de Desarrollo
✅ Desarrollar PWA ciudadana + Dashboard administrativo funcional  
✅ Implementar en infraestructura gratuita (Vercel + Supabase)  
✅ Realizar 2 sesiones de capacitación a operadores y supervisores  
✅ Ejecutar 3 jornadas de socialización comunitaria  
✅ Soporte técnico durante 3 meses de pilotaje  
✅ Entregar código fuente + documentación + SLA  

#### De la Comisión de Tránsito
✅ Proporcionar 4 documentos requeridos (Semana 1)  
✅ Asignar 10-15 operadores para testing, capacitación y operación  
✅ Designar supervisor de turno responsable de coordinación  
✅ Operar sistema con personal asignado durante pilotaje  
✅ Decidir continuidad post-piloto antes de Día 90  

### TÉRMINOS

| Aspecto | Detalle |
|---------|---------|
| **Inversión Directa** | USD $275 (capital semilla) |
| **Costo Operativo** | USD $35/año post-piloto |
| **Duración Pilotaje** | 3 meses (Día 56 - Día 140) |
| **Go/No-Go Producción** | Día 56 (luego validación de campo) |
| **Propiedad Intelectual** | Código abierto (MIT/GPL), transferencia a Comisión |
| **Soporte Post-Piloto** | A definir en mes 3 |
| **Terminación** | Mutua con 15 días notificación |

### FIRMAS

```
Equipo de Desarrollo:

Nombre: _________________________________
Cargo:  _________________________________
Firma:  _________________________________
Fecha:  _________________________________


Comisión de Tránsito:

Nombre: _________________________________
Cargo:  Jefe de Tránsito
Firma:  _________________________________
Fecha:  _________________________________


Testigo:

Nombre: _________________________________
Institución: ____________________________
Firma:  _________________________________
Fecha:  _________________________________
```

---

## REFERENCIAS Y DOCUMENTOS ASOCIADOS

| Documento | Propósito |
|-----------|----------|
| **SRS.md** | Especificación técnica funcional (13 secciones detalladas) |
| **DocuSolicitar.md** | Detalle de 12 documentos a solicitar a Comisión + plantilla oficio |
| **MATRIZ-OBSERVACIONES-vs-REQUERIMIENTOS.md** | Análisis de gaps, bloqueadores identificados, acciones permitidas |
| **PROPUESTA-FORMAL-COMISION-TRANSITO.md** | Versión extendida con detalles de protocolo operación y capacitación |

---

## PRÓXIMOS PASOS

1. **Esta semana:** Comisión revisa propuesta + retroalimenta
2. **Semana 1:** Kickoff meeting + entrega oficio formal de solicitud
3. **Semana 1:** Recibir documentos P0 (Catálogo, GIS, política LGPD)
4. **Semana 2:** Comisión valida información + SRS.md v1.1
5. **Semana 2:** Aprobación final para iniciar desarrollo
6. **Semana 3:** Inicio Fase 2 (Desarrollo MVP)

---

## NOTAS IMPORTANTES

- ⚠️ **Documento de Consulta:** Retroalimentación sobre estructura, objetivos, y términos bienvenida
- ⚠️ **Datos Provisionales:** Algunos valores son conservadores (baseline). Comisión ajusta en Semana 1
- ⚠️ **Bloqueadores Identificados:** Ver MATRIZ para riesgos críticos y acciones no permitidas
- ✅ **Sostenible:** Modelo de costo ultra-bajo garantiza continuidad post-piloto

---

**Preparado por:** Equipo de Desarrollo - Programa Jóvenes en Acción  
**Responsable PM:** [Nombre]  
**Correo:** desarrollo@transitoalertase.ec  

**Versión:** 1.0  
**Estado:** BORRADOR - A CONSULTA CON COMISIÓN  
**Próxima revisión:** Post-feedback Comisión
