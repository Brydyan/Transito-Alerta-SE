# PROPUESTA FORMAL DE PROYECTO - BORRADOR
## TRÁNSITO ALERTA SANTA ELENA
### Sistema Web Participativo de Gestión de Incidencias Viales

**Presentado a:** Comisión de Tránsito del Cantón Santa Elena  
**Fecha:** 31 de Julio de 2026  
**Estado:** BORRADOR - Validación pendiente  
**Versión:** 1.0  

---

## RESUMEN EJECUTIVO

**Tránsito Alerta SE** es plataforma web de reporte ciudadano georreferenciado que mejora gestión de incidencias viales en cantón Santa Elena.

### Problema
Incidentes viales (accidentes, semáforos dañados, vías bloqueadas) reportados de forma desorganizada → demoras de respuesta, riesgos secundarios, falta de trazabilidad.

### Solución
PWA accesible desde navegador (no requiere descargar app):
- Ciudadano reporta con GPS automático (< 30 segundos)
- Dashboard tiempo real para autoridades
- Offline-first para zonas sin cobertura
- Notificaciones automáticas

### Impacto (Piloto 3 meses)
- 30% reducción tiempo respuesta
- 100% cobertura parroquial
- 500+ reportes validados
- $0 costo operativo anual post-piloto

### Inversión
- **Directa:** USD $250 (dominio, QR, socialización)
- **Desarrollo (aporte):** USD $5,550 (Jóvenes en Acción)
- **Post-piloto:** USD $35/año (solo dominio)

---

## PROBLEMA Y JUSTIFICACIÓN

Santa Elena requiere herramienta tecnológica centralizada para:
- Mejorar atención ciudadana
- Optimizar tiempos respuesta
- Información georreferenciada
- Identificar zonas críticas
- Generar indicadores de gestión
- Fortalecer transparencia

Actualmente: reportes por llamadas/redes sociales → sin ubicación exacta, sin priorización, sin trazabilidad.

---

## SOLUCIÓN PROPUESTA

### Componentes

**1. Portal Ciudadano (PWA)**
- Acceso: Navegador web (sin app)
- Ubicación automática GPS
- Foto directa de cámara
- Validación offline (IndexedDB)
- Sincronización automática

**2. Dashboard Administrativo**
- Mapa interactivo tiempo real
- Gestión de reportes (NUEVO → EN PROCESO → RESUELTO)
- Asignación de patrullas
- Filtros y búsquedas
- Alertas sonoras (Prioridad ALTA)
- Notificaciones Telegram/WhatsApp

**3. Infraestructura**
- Frontend: Vercel/Netlify (USD $0)
- Base de datos: Supabase PostgreSQL + PostGIS (USD $0)
- Mapas: OpenStreetMap + Leaflet (USD $0)
- Certificado: Let's Encrypt (USD $0)

---

## OBJETIVOS

| Objetivo | Métrica |
|----------|---------|
| Interfaz intuitiva | ≤ 30 segundos/reporte |
| Dashboard en tiempo real | 99.5% disponibilidad |
| Cobertura ciudadana | ≥ 500 reportes piloto |
| Alcance geográfico | 100% parroquias |
| Tiempo despacho (ALTA) | < 8 minutos |
| Calidad datos | < 8% spam/falsos |

---

## TECNOLOGÍA

| Capa | Herramienta |
|------|------------|
| **Frontend** | React/Next.js, Leaflet.js, PWA |
| **Backend** | Node.js/Express, Supabase |
| **Base de Datos** | PostgreSQL + PostGIS |
| **Mapas** | OpenStreetMap |
| **Notificaciones** | WebSocket, Telegram, WhatsApp |
| **Hosting** | Vercel (Frontend), Supabase (Backend) |

**Justificación:** 100% Open Source, sin royalties, escalable, probado.

---

## CRONOGRAMA (8 SEMANAS)

### Fases

| Fase | Semanas | Deliverable |
|------|---------|------------|
| **1. Análisis & Diseño** | 1-2 | Especificación técnica completa |
| **2. Desarrollo MVP** | 3-6 | PWA + Dashboard en staging |
| **3. Pruebas de Campo** | 7-8 | Validación operativa, fixes |
| **4. Deploy & Capacitación** | 8 (final) | Producción, operadores certificados |

**Recursos:** 5 personas (1 PM, 2 Frontend, 1 Backend, 1 QA)  
**Total horas:** ~1,300 horas desarrollo

### Hitos Clave
- Día 1: Kickoff + Comisión
- Día 11: Especificación aprobada
- Día 42: MVP en staging
- Día 56: Pruebas de campo completadas
- Día 56: **SISTEMA EN PRODUCCIÓN**

---

## PRESUPUESTO

### Inversión Directa Requerida

| Rubro | Costo |
|-------|-------|
| Dominio .ec (1 año) | $35 |
| QR adhesivos (500 unidades) | $60 |
| Socialización (6 jornadas) | $120 |
| Manuales impresos | $35 |
| Contingencia 10% | $25 |
| **TOTAL** | **$275** |

### Costo Operativo Anual (Post-Piloto)
- Hosting Frontend: $0 (Vercel Free)
- Base de Datos: $0 (Supabase Free Tier)
- Mapas: $0 (OpenStreetMap)
- SSL: $0 (Let's Encrypt)
- Dominio: $35/año

**COSTO ANUAL: $35 USD**

### Aporte Técnico (Financiado por Jóvenes en Acción)

| Rol | Horas | Valor |
|-----|-------|-------|
| Fullstack Developer | 120 | $3,000 |
| QA Engineer | 40 | $800 |
| UX/UI Designer | 20 | $400 |
| **Total Valor Agregado** | **180** | **$4,200** |

---

## DATOS BLOQUEADOS (Requiere Comisión)

⚠️ **IMPORTANTE:** Siguiente información requerida antes de Fase 2. Ver `DocuSolicitar.md` para detalle.

| Dato | Necesario Para | Status | Plazo |
|------|----------------|--------|-------|
| **Catálogo Oficial Incidentes** | Formulario PWA, SRS | 🔴 BLOQUEADO | Semana 1 |
| **Política Datos Personales (LGPD)** | Validación, privacidad | 🔴 BLOQUEADO | Semana 1 |
| **Capa Poligonal Cantón (GIS)** | Geofencing, validación | 🔴 BLOQUEADO | Semana 1-2 |
| **Organigrama Departamentos** | Routing automático reportes | 🔴 BLOQUEADO | Semana 1 |
| **Manual Operaciones CTE** | Ciclo de vida, SLA | 🟡 PENDIENTE | Semana 1 |
| **Matriz SLA Oficial** | Tiempos respuesta | 🟡 PENDIENTE | Semana 2 |

**Mitigación:** MVP usa baseline conservador (SRS.md). Comisión valida Semana 1, ajustes realizan antes Fase 2.

---

## CRONOGRAMA DE SOLICITUDES

| Semana | Acción | Responsable |
|--------|--------|------------|
| **S1** | Kickoff + Oficio solicitud 4 documentos bloqueadores | Equipo |
| **S1** | Comisión entrega documentos P0 + define política LGPD | Comisión |
| **S1-2** | Equipo incorpora datos en SRS.md, valida con Comisión | Equipo + Comisión |
| **S2** | Go/No-Go para iniciar Fase 2 desarrollo | PM |

---

## ACTA DE COMPROMISO (MÍNIMA)

**Las partes (Equipo de Desarrollo + Comisión de Tránsito) acuerdan:**

1. ✅ Desarrollar PWA ciudadana + Dashboard administrativo
2. ✅ Implementar en Vercel + Supabase (infraestructura gratuita)
3. ✅ Capacitar operadores y supervisores (2 jornadas)
4. ✅ Soporte técnico durante pilotaje 3 meses
5. ✅ Entregar código fuente y documentación completa
6. ✅ Transferencia de propiedad intelectual a Comisión (Licencia Open Source)

**Comisión se compromete a:**

1. ✅ Proporcionar 4 documentos requeridos (Semana 1)
2. ✅ Asignar 10-15 operadores para testing y capacitación
3. ✅ Operar sistema con personal asignado (3 meses piloto)
4. ✅ Decidir continuidad post-piloto en mes 3
5. ✅ Designar responsable técnico de coordinación

**Inversión directa:** USD $275 (capital semilla)  
**Costo operativo:** USD $35/año (post-piloto)  
**Plazo:** 8 semanas hasta producción

---

## REFERENCIAS TÉCNICAS

Para detalles completos, consultar:
- **SRS.md** → Especificación técnica funcional (13 secciones)
- **DocuSolicitar.md** → Detalle de 12 documentos a solicitar
- **MATRIZ-OBSERVACIONES-vs-REQUERIMIENTOS.md** → Gaps identificados
- **PROPUESTA-FORMAL-COMISION-TRANSITO.md** → Versión extendida (detalle completo)

---

## PRÓXIMOS PASOS

1. **Semana 1:** Presentar propuesta a Comisión
2. **Semana 1:** Entregar oficio formal (ver DocuSolicitar.md)
3. **Semana 1-2:** Recibir documentos requeridos
4. **Semana 2:** SRS.md validado y aprobado
5. **Semana 3:** Iniciar Fase 2 (desarrollo)

---

**Documento Preparado Por:** Equipo de Desarrollo  
**Responsable:** [Nombre PM]  
**Contacto:** desarrollo@transitoalertase.ec  

**ESTADO:** BORRADOR - Listo para revisión Comisión de Tránsito
