# MATRIZ DE CONTROL: Observaciones vs. Requerimientos vs. SRS
## Tránsito Alerta Santa Elena (TASE)

**Propósito:** Identificar gaps entre propuesta inicial (Observaciones.md), solicitudes formales (DocuSolicitar.md) y especificación técnica (SRS.md).

**Versión:** 1.0  
**Fecha:** 31 de Julio de 2026  
**Responsable:** Equipo de Desarrollo + Comisión de Tránsito  

---

## BLOQUEADORES CRÍTICOS (No avanzar sin validación)

### 1. CATEGORÍAS DE REPORTES

| Aspecto | Observaciones.md | DocuSolicitar.md | SRS.md | Gap | Acción |
|---------|-----------------|-----------------|--------|-----|--------|
| **Catálogo propuesto** | 16 tipos (línea 161-178) | Solicitar Catálogo Oficial CTE (P0) | Sección 3.2 (provisional) | Observaciones ≠ Standard oficial | Comisión valida semana 1 |
| **Códigos internos** | No asignados | Pedir códigos ECU-911 (P0) | I001-I010 (temp) | Falta mapeo a códigos estándar | Comisión entrega catálogo |
| **Ejemplos** | Genéricos | Validar con operadores | Descripción detallada | OK | ✅ SRS lista |

**Impacto:** Sin catálogo oficial, formulario PWA no pueda coincidir con términos CTE → confusión ciudadano + operador.

**Mitigación:** Usar baseline 16 tipos en MVP staging. Comisión valida en Semana 1.

---

### 2. INFORMACIÓN DEL REPORTE

| Campo | Observaciones.md | PROPUESTA-FORMAL | SRS.md | Conflicto | Decisión |
|-------|-----------------|-----------------|--------|----------|----------|
| **Nombre Ciudadano** | Requerido (línea 186) | NO requerido (anonimización) | Opcional anonimizado | Falta política oficial | Comisión decide |
| **Celular** | Requerido (línea 186) | NO (Device Fingerprint) | Opcional anónimo | Conflic LGPD vs. seguimiento | Comisión define |
| **Correo** | Requerido (línea 186) | NO (Device Fingerprint) | Opcional anónimo | Mismo problema | Comisión define |
| **Fotografía** | Requerido (línea 184) | SÍ (validación EXIF) | SÍ (< 200KB WebP) | ✅ Aligned | ✅ Go |
| **Ubicación GPS** | Requerido (línea 189) | SÍ (auto + manual) | SÍ (PostGIS validate) | ✅ Aligned | ✅ Go |
| **Prioridad** | Requerido (línea 188) | SÍ (ALTA/MEDIA/BAJA) | SÍ (matriz oficial) | ✅ Aligned | ✅ Go |
| **Descripción** | Requerido (línea 187) | SÍ (optional, max 140 chars) | SÍ (text libre) | ✅ Aligned | ✅ Go |

**Impacto Crítico:** Datos personales → LGPD Ecuador compliance. No puede ignorarse.

**Decisión Requerida:** Semana 1 - Comisión define política anonimización.

**Opciones:**
- A) Anonimización total (Device Fingerprint) → privacidad máxima
- B) Email únicamente (opción) → seguimiento + privacidad
- C) Nombre + Email → máxima trazabilidad, menor privacidad

---

### 3. ESTRUCTURA DE DEPARTAMENTOS

| Departamento | Observaciones.md | Organigrama CTE Actual | Necesidad SRS |
|--------------|-----------------|----------------------|---------------|
| Dirección Operativa | Sí (línea 104) | ? | Rol primario (operadores) |
| Señalización | Sí (línea 105) | ? | Asignación automática |
| Semaforización | Sí (línea 106) | ? | Asignación automática |
| Técnico | Sí (línea 107) | ? | Asignación automática |
| Movilidad | Sí (línea 108) | ? | Asignación automática |
| Planificación | Sí (línea 109) | ? | Análisis de datos |
| Jurídico | Sí (línea 110) | ? | Escalación crítica |
| Atención Ciudadana | Sí (línea 111) | ? | Notificaciones ciudadano |
| Administración | Sí (línea 112) | ? | Gestión usuario/facturación |

**Impacto:** Asignación automática requiere mapeo exacto categoría → departamento responsable.

**Sin organigrama oficial:** Sistema no sabe a quién routa cada reporte.

**Mitigación:** Dashboard admin permite asignación manual (fallback). Comisión configura routing en Semana 1.

---

## PENDIENTES DE VALIDACIÓN (Pueden usar baseline, ajustan después)

### 4. NIVELES DE PRIORIDAD

| Nivel | Observaciones.md | PROPUESTA-FORMAL | SRS.md | Status |
|-------|-----------------|-----------------|--------|--------|
| **ALTA** | No define | < 8 min despacho | Riesgo inmediato | 🟡 Baseline OK |
| **MEDIA** | No define | < 15 min despacho | Molestia importante | 🟡 Baseline OK |
| **BAJA** | No define | < 30 min despacho | Info menor | 🟡 Baseline OK |

**Validar:** ¿Tiempos de despacho coinciden con SLA real CTE?

---

### 5. CICLO DE VIDA DEL REPORTE

| Estado | Observaciones.md | PROPUESTA-FORMAL | SRS.md | Alineación |
|--------|-----------------|-----------------|--------|------------|
| Recibido | Sí (línea 137) | NUEVO | NUEVO | ✅ OK |
| En revisión | Sí (línea 137) | EN REVISIÓN | EN REVISIÓN | ✅ OK |
| En proceso | Sí (línea 137) | EN PROCESO | EN PROCESO | ✅ OK |
| Resuelto | Sí (línea 137) | RESUELTO | RESUELTO | ✅ OK |

**Alineación:** Perfecta. Usar baseline.

---

### 6. INFORMACIÓN GEOGRÁFICA

| Dato | Observaciones.md | DocuSolicitar.md | SRS.md | Status |
|-----|-----------------|-----------------|--------|--------|
| **Capa Poligonal Cantón** | Asume existe | Solicitar Shapefile (P0) | PostGIS validate | 🔴 BLOQUEADO |
| **Puntos Críticos** | Menciona mapas calor (línea 157) | Solicitar "puntos negros" (P2) | Heatmap feature | 🟡 PENDIENTE |
| **Vías Competencia** | Asume CTE gestiona | Solicitar delimitación (P1) | Geofencing filter | 🟡 PENDIENTE |

---

### 7. NOTIFICACIONES

| Canal | Observaciones.md | PROPUESTA-FORMAL | SRS.md | Validar |
|-------|-----------------|-----------------|--------|---------|
| **Dashboard Web** | Sí (implícito) | SÍ (realtime) | SÍ (WebSocket) | ✅ Standard |
| **Telegram** | No menciona | SÍ (alertas ALTA) | SÍ (Webhook) | 🟡 Comisión ok? |
| **WhatsApp** | Opcional (línea 214) | SÍ (fallback) | SÍ (API) | 🟡 Comisión aprova? |
| **Email** | Menciona (línea 214) | SÍ (reportes fin turno) | SÍ (cron) | ✅ Standard |

---

### 8. INDICADORES / KPIs

| Indicador | Observaciones.md | SRS.md | Status |
|-----------|-----------------|--------|--------|
| Tiempo promedio atención | Sí (línea 248) | SÍ (SLA KPI) | ✅ OK |
| Incidencias por parroquia | Sí (línea 249) | SÍ (Geographic analytics) | ✅ OK |
| Reportes atendidos vs. pendientes | Sí (línea 251) | SÍ (Dashboard widget) | ✅ OK |
| Mapas de calor | Sí (línea 253) | SÍ (Heatmap feature) | ✅ OK |

---

## MATRIZ DE RIESGOS POR BLOQUEO

| Bloqueador | Semana Descubrimiento | Impacto si No Resuelve | Severidad | Mitigación |
|-----------|---------------------|----------------------|-----------|------------|
| Catálogo Incidentes | S1 | Formulario PWA no coincide con estándares CTE | 🔴 CRÍTICA | Usar baseline 16 tipos en staging, Comisión valida S1 |
| Info Reporte (Datos Personales) | S1 | Incumplimiento LGPD, lawsuit | 🔴 CRÍTICA | Comisión define política en kickoff |
| Organigrama Departamentos | S1 | Asignación automática falla, manual overload | 🔴 CRÍTICA | Dashboard permite routing manual, config S1 |
| Capa Poligonal GIS | S1-S2 | Geofencing no funciona, aceptar reportes fuera cantón | 🟠 ALTA | Comisión entrega shapefile, PostGIS config S2 |

---

## CHECKLIST: OFICIO DE SOLICITUD A COMISIÓN

### Semana 1 - Kickoff Meeting
- [ ] Presentar matriz esta (justifica por qué necesitamos datos)
- [ ] Solicitar 3 documentos P0 (Catálogo, Capa GIS, Manual Operaciones)
- [ ] Designar responsable técnico contacto
- [ ] Confirmar departamentos exactos (9 sugeridos vs. real)

### Semana 1-2
- [ ] Recibir Catálogo Oficial Incidentes
- [ ] Recibir Capa Poligonal (Shapefile/GeoJSON)
- [ ] Recibir Manual Operaciones + Despacho

### Semana 2
- [ ] Comisión decide política datos personales (LGPD)
- [ ] Recibir organigrama + definición roles
- [ ] Validar niveles prioridad SLA

### Semana 3
- [ ] Incorporar datos en SRS.md v1.1
- [ ] Actualizar PROPUESTA-FORMAL con valores reales
- [ ] Revisión conjunta Comisión + Equipo

---

## ACCIONES INMEDIATAS (SIN ESPERAR DATOS)

✅ **Desarrollo puede avanzar en:**
- PWA Frontend (formulario responsive, mapa, cámara, GPS)
- Backend API base (Express, Supabase setup)
- Dashboard UI/UX (componentes, layout)
- Service Worker (offline-first, IndexedDB)

❌ **Desarrollo BLOQUEADO en:**
- Dropdown categorías incidentes (necesita catálogo)
- Lógica asignación automática (necesita organigrama)
- Validación geofencing (necesita shapefile)
- Política privacidad datos (necesita LGPD CTE)

---

## REFERENCIAS CRUZADAS

| Documento | Sección | Propósito |
|-----------|---------|----------|
| Observaciones.md | Líneas 161-193 | Baseline de categorías + campos |
| DocuSolicitar.md | Sección I-VI | Detalle de 12 documentos a solicitar |
| SRS.md | Secciones 2-7 | Especificación con placeholders |
| PROPUESTA-FORMAL | Sección "Datos Bloqueados" | Tabla de validación en documento oficial |

---

## VERSIONES Y EVOLUCIÓN

| Versión | Fecha | Estado | Cambios |
|---------|-------|--------|---------|
| 1.0 | 31-07-2026 | ACTIVA | Matriz inicial, 3 bloqueadores identificados |
| 1.1 | TBD | PENDIENTE | Post-recepción datos Comisión |
| 2.0 | TBD | PENDIENTE | Post-aprobación SRS v1.2 |

---

**Último Update:** 31 de Julio de 2026  
**Próxima Revisión:** Post-kickoff Comisión (Semana 1)  
**Responsable:** PM del Proyecto
