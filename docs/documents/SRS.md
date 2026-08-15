# Software Requirements Specification (SRS)
## Tránsito Alerta Santa Elena (TASE)
### Sistema Web Participativo de Gestión de Incidencias Viales

**Versión:** 1.0  
**Fecha:** 31 de Julio de 2026  
**Estado:** BORRADOR - En espera de validación institucional  
**Responsable:** Equipo de Desarrollo + Comisión de Tránsito  

---

## TABLA DE CONTENIDOS

1. [Introducción](#introducción)
2. [Ciclo de Vida del Reporte](#ciclo-de-vida-del-reporte)
3. [Catálogo de Incidentes y Priorización](#catálogo-de-incidentes-y-priorización)
4. [Dominio Geográfico](#dominio-geográfico)
5. [Estructura de Usuarios y Roles](#estructura-de-usuarios-y-roles)
6. [Control de Calidad (Anti-Spam)](#control-de-calidad-anti-spam)
7. [SLA y Métricas de Rendimiento](#sla-y-métricas-de-rendimiento)
8. [Escalación y Alertas](#escalación-y-alertas)
9. [Integraciones Externas](#integraciones-externas)
10. [Sistema de Notificaciones](#sistema-de-notificaciones)
11. [Privacidad y Manejo de Imágenes](#privacidad-y-manejo-de-imágenes)
12. [Retención de Datos](#retención-de-datos)
13. [User Research y Validación Operativa](#user-research-y-validación-operativa)

---

## INTRODUCCIÓN

### Propósito
Especificar funcionalmente el sistema **Tránsito Alerta SE**, una plataforma web de reporte ciudadano georreferenciado que mejora la gestión de incidencias viales en el cantón Santa Elena.

### Alcance
- ✅ Aplicación web progresiva (PWA) para ciudadanía
- ✅ Dashboard administrativo para Comisión de Tránsito
- ✅ Integración con PostGIS para geofencing
- ✅ Notificaciones realtime via WebSocket
- ❌ Integración con ECU-911 (Fase 2)
- ❌ Integración con sistemas de patrullas (Fase 2)

### Stakeholders
| Rol | Representante | Responsabilidad |
|-----|---------------|-----------------|
| **Jefe de Tránsito** | [Por asignar] | Validar requisitos, aprobación |
| **Supervisor de Turno** | [Por asignar] | Operación y feedback UX |
| **Operadores** | 10-15 personas | Testing en staging, capacitación |
| **Comisión de Tránsito** | Junta directiva | Adopción institucional |
| **Equipo Técnico** | PM + Devs | Implementación |

---

## CICLO DE VIDA DEL REPORTE

### Estados Oficiales

**Fuente:** Manual de Operaciones CTE (Documento por solicitar)

```
FLUJO PRINCIPAL:
NUEVO → EN REVISIÓN → EN PROCESO → RESUELTO

ALTERNATIVA (Reporte Falso):
NUEVO → EN REVISIÓN → RECHAZADO
```

### Estados Detallados

| Estado | Descripción | Transiciones Válidas | Actor |
|--------|----------|----------------------|-------|
| **NUEVO** | Reporte acaba de llegar del ciudadano, sin revisar | EN REVISIÓN, RECHAZADO | Sistema |
| **EN REVISIÓN** | Operador está validando información y foto | EN PROCESO, RECHAZADO | Operador |
| **EN PROCESO** | Patrulla fue despachada y se dirige al sitio | EN ATENCIÓN, RESUELTO, RECHAZADO | Operador |
| **EN ATENCIÓN** | Patrulla llegó al sitio e interviene | RESUELTO, REABIERTO | Patrulla (confirmación) |
| **RESUELTO** | Incidente atendido y finalizado | REABIERTO (excepción) | Supervisor |
| **RECHAZADO** | Reporte marcado como falso o spam | — (final) | Operador + Supervisor |
| **REABIERTO** | Incidente resuelto pero reportan nueva ocurrencia | EN PROCESO | Supervisor (excepción) |

### Reglas de Transición

```
Regla 1: Todo reporte NUEVO debe pasar por EN REVISIÓN (no directo a EN PROCESO)
Regla 2: Solo Operador puede mover NUEVO → EN REVISIÓN
Regla 3: Si Operador marca RECHAZADO, requiere confirmación de Supervisor
Regla 4: Prioridad ALTA no puede quedar en EN REVISIÓN > 5 minutos
Regla 5: Tiempo total NUEVO → RESUELTO meta: < 45 minutos (Prioridad ALTA)
```

---

## CATÁLOGO DE INCIDENTES Y PRIORIZACIÓN

### Taxonomía de Incidentes

**Fuente:** Catálogo Oficial CTE / ECU-911 (Documento por solicitar)

**PROVISIONAL** (Usar como baseline hasta recibir catálogo oficial):

| Código | Tipo de Incidente | Descripción | Ejemplos |
|--------|------------------|------------|----------|
| **I001** | Colisión / Choque | Accidente entre vehículos | Choque de frente, alcance, lateral |
| **I002** | Atropello | Vehículo golpea peatón/ciclista | Peatón herido, ciclista atropellado |
| **I003** | Semáforo Averiado | Semáforo sin funcionar | Semáforo rojo permanente, parpadea |
| **I004** | Vía Bloqueada | Obstrucción total de calzada | Derrumbe, árbol caído, vehículo volcado |
| **I005** | Obstáculo en Calzada | Objeto o material en la vía | Bache, vidrio, neumático, escombros |
| **I006** | Vehículo Averiado | Vehículo descompuesto en vía | Auto parado, sin gasolina, panne |
| **I007** | Congestión Importante | Tráfico paralizado | Cuello de botella, embotellamiento |
| **I008** | Seguridad / Robo | Evento delictivo en vía | Asalto, hurto, violencia |
| **I009** | Servicio Técnico | Necesidad técnica urgente | Luminaria dañada, mantenimiento vial |
| **I010** | Otro | Incidente no clasificado | Descrito por ciudadano |

### Matriz de Priorización

**Fuente:** SLA Oficial CTE (Documento por solicitar)

**PROVISIONAL** (Usar hasta recibir definición institucional):

| Nivel | Definición | Criterios | Tiempo de Despacho | Color UI | Alerta Sonora |
|-------|-----------|----------|---|---|---|
| **🔴 ALTA** | Riesgo inmediato de accidentes secundarios | • Bloqueo total de vía<br>• Accidente activo<br>• Flujo invertido<br>• Peligro grave (derrumbe) | < 8 minutos | Rojo | SÍ (obligatorio) |
| **🟡 MEDIA** | Molestia importante sin peligro inmediato | • Semáforo dañado<br>• Congestión localizada<br>• Obstáculo < 1m<br>• Evento de baja urgencia | < 15 minutos | Amarillo | Suave (opcional) |
| **🟢 BAJA** | Información menor | • Bache pequeño<br>• Objeto menor<br>• Reporte informativo<br>• Sugerencias | < 30 minutos | Verde | No |

---

## DOMINIO GEOGRÁFICO

### Geofencing y Limites de Jurisdicción

**Fuente:** Shapefile / GeoJSON oficial de cantón (Documento por solicitar)

### Requisitos GIS

```sql
-- Tabla de referencia (PostGIS)
CREATE TABLE cantones (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(255),
  geom GEOMETRY(POLYGON, 4326),
  competencia VARCHAR(50) -- 'CTE', 'MUNICIPAL', 'ESTATAL'
);

-- Validación en reporte ciudadano:
SELECT ST_Contains(
  (SELECT geom FROM cantones WHERE id = 1),
  ST_GeomFromText('POINT(...)') 
) AS dentro_del_canton;
```

### Validación de Reportes

```
Validación Automática:
1. ¿Coordenadas dentro del cantón? 
   → SI: Continuar
   → NO: Rechazar con mensaje "Fuera de cobertura"

2. ¿Coordenadas dentro de vía bajo competencia CTE?
   → SI: Normal
   → NO: Marcar para validación manual (opcional)
```

---

## ESTRUCTURA DE USUARIOS Y ROLES

### Matriz de Roles y Permisos

**Fuente:** Organigrama oficial + Manual de Despacho (Documento por solicitar)

| Rol | Descripción | Usuarios | Permisos |
|-----|-----------|----------|---------|
| **Operador de Consola** | Revisa y gestiona reportes en Dashboard | 10-15 | Ver reportes, validar, cambiar estado, asignar patrulla |
| **Supervisor de Turno** | Supervisa operadores, escala, genera reportes | 3-4 | Todos permisos operador + validar descarte, generar reports |
| **Administrador de Sistema** | Gestión de infraestructura y usuarios | 1 | Full access + backups + auditoría |
| **Ciudadano** | Crea reportes desde PWA | Público | Solo crear reporte + ver confirmación |

---

## CONTROL DE CALIDAD (ANTI-SPAM)

### Políticas de Descarte y Validación

**Fuente:** Protocolo actual anti-spam CTE (Documento por solicitar)

| Filtro | Condición | Acción |
|--------|----------|--------|
| **Rate Limiting** | Device > 3 reportes en 10 minutos | Bloquear envío, mostrar "Espera X minutos" |
| **Geofencing Violation** | Coordenadas fuera del cantón | Rechazar automáticamente |
| **Ubicación Imposible** | Reportes de mismo device a 50km en 1 minuto | Marcar para revisión manual |
| **EXIF Inválido** | Foto con timestamp > 1 hora atrás | Requerir captura directa de cámara |
| **Duplicado Cercano** | Mismo tipo incidente, misma zona (< 500m), < 5 minutos | Merge o marcar como posible duplicado |

---

## SLA Y MÉTRICAS DE RENDIMIENTO

### Niveles de Servicio

**Fuente:** Matriz de SLA oficial CTE (Documento por solicitar)

| SLA | Prioridad ALTA | Prioridad MEDIA | Prioridad BAJA |
|-----|---|---|---|
| **Tiempo Recepción a Despacho** | < 8 minutos | < 15 minutos | < 30 minutos |
| **Tiempo Total (Reporte a Resuelto)** | < 45 minutos | < 90 minutos | < 2 horas |
| **Disponibilidad del Sistema** | 99.5% (por turno) | 99.5% | 99.0% |
| **Sincronización Offline** | < 2 minutos | < 5 minutos | < 10 minutos |

### Indicadores Clave (KPIs)

| Métrica | Meta | Frecuencia Medición |
|---------|------|---|
| **Tasa de Cumplimiento SLA (ALTA)** | ≥ 95% | Diaria |
| **Tiempo Promedio Despacho** | ≤ 8 min | Diaria |
| **Precisión GPS** | ≤ 15 metros | Mensual (validación) |
| **Sincronización Exitosa Offline** | ≥ 95% | Semanal |
| **Tasa de Falsos Positivos** | ≤ 8% | Semanal |
| **Disponibilidad Sistema** | ≥ 99.5% | Continuo (Sentry) |

---

## ESCALACIÓN Y ALERTAS

### Protocolo de Escalación

**Fuente:** Manual de Despacho + políticas de supervisor (Documento por solicitar)

| Evento | Trigger | Destinatario | Acción |
|--------|---------|--------------|--------|
| **Prioridad ALTA** | Reporte recibido | Todos operadores | Alerta sonora + visual |
| **ALTA Sin Interacción 15 min** | Timer expira | Supervisor de turno | Webhook Telegram |
| **ALTA Sin Resolver 45 min** | SLA crítico | Jefe de Tránsito | Email + SMS |
| **Múltiples ALTA (3+) en zona** | Cluster detection | Supervisor | Recomendación refuerzo |

---

## INTEGRACIONES EXTERNAS

### Sistemas y APIs

**Fuente:** Arquitectura TI actual (Documento por solicitar)

#### Fase 1 (MVP)

| Sistema | Integración | Status |
|---------|-----------|--------|
| **OpenStreetMap** | Mapas base | ✅ Incluido MVP |
| **PostGIS** | Geofencing | ✅ Incluido MVP |
| **Supabase Auth** | Autenticación | ✅ Incluido MVP |

#### Fase 2 (Post-Piloto)

| Sistema | Propósito | Status |
|---------|---------|--------|
| **ECU-911** | Coordinación nacional | 🔄 Evaluación |
| **API Patrullas** | Posición realtime | 🔄 Evaluación |
| **Base Datos Histórica CTE** | Contexto operador | 🔄 Evaluación |

---

## SISTEMA DE NOTIFICACIONES

### Canales Configurados

**Fuente:** Política de Comunicación Institucional (Documento por solicitar)

| Canal | Uso | Destinatario | Frecuencia |
|-------|-----|--------------|-----------|
| **Dashboard (Web)** | Alertas primarias | Operadores | Realtime |
| **Telegram Bot** | Alertas críticas | Supervisores | Inmediata |
| **WhatsApp API** | Escalada crítica | Jefe Tránsito | Si Telegram falla |
| **Email** | Reportes diarios | Supervisores | Fin de turno |

---

## PRIVACIDAD Y MANEJO DE IMÁGENES

### Política de Datos Personales

**Fuente:** Normativa LGPD Ecuador + Protocolo CTE (Documento por solicitar)

```
✅ Anonimización por Diseño:
  - No se solicita nombre, cédula o datos personales
  - Autenticación por Device Fingerprint (token UUID)
  - Reportes totalmente anónimos
```

### Manejo de Imágenes

| Aspecto | Norma Requerida | Propuesta |
|--------|-----------------|----------|
| **Captura** | ¿Solo cámara? | SÍ, no galería |
| **EXIF** | ¿Requiere validación? | SÍ (< 1h atrás) |
| **Difuminado** | ¿Rostros/placas? | Depende CTE |
| **Almacenamiento** | ¿Dónde guardar? | Supabase Storage |
| **Retención** | ¿Cuánto tiempo? | Ver Sección 12 |

---

## RETENCIÓN DE DATOS

### Ciclo de Vida de Información

**Fuente:** Normas legales LGPD + política institucional (Documento por solicitar)

| Tipo de Dato | Retención | Acceso |
|---|---|---|
| **Reportes Resueltos** | 12 meses | Supervisor + Admin |
| **Fotografías** | 6 meses | Operadores |
| **Datos Anónimos** | 30 días | Analytics |
| **Logs Sistema** | 90 días | Admin + Seguridad |
| **Logs Auditoría** | 24 meses | Admin + Legal |

---

## USER RESEARCH Y VALIDACIÓN OPERATIVA

### Entrevista con Operadores

**Formato:** Cuestionario guiado con 2-3 operadores clave  
**Timing:** Semana 3 de proyecto  

### Preguntas Clave

- ¿Cuántas patrullas operan en turno?
- ¿Cuáles son los 3 sectores más conflictivos?
- ¿Qué información ven PRIMERO al recibir reporte?
- ¿Cómo confirman despacho de patrulla?
- ¿Qué reportes falsos llegan más?
- ¿Cuántos reportes/turno aproximadamente?

### Resultado de Research (POR COMPLETAR)

```
Será completado después de entrevistas en Semana 3
```

---

## CRITERIOS DE ACEPTACIÓN

### Checklist Funcional

**Antes de Go-Live, validar:**

- [ ] Ciclo NUEVA → EN REVISIÓN → EN PROCESO → RESUELTO
- [ ] Alertas sonoras para Prioridad ALTA
- [ ] Geofencing rechaza ubicaciones fuera del cantón
- [ ] Rate limiting funciona (máx 3 reportes/10 min)
- [ ] Notificaciones Telegram < 30 segundos
- [ ] Offline-first sincroniza reportes
- [ ] Imágenes se comprimen a WebP < 200KB
- [ ] Dashboard mapa realtime (< 1 seg latencia)
- [ ] SLA < 8 min cumplido en 95%+ reportes ALTA

---

## DOCUMENTOS PENDIENTES

### Prioridad Crítica (Semana 1)
- [ ] Manual de Operaciones CTE
- [ ] Catálogo Oficial de Incidentes
- [ ] Shapefile/GeoJSON limites cantón
- [ ] Matriz SLA oficial

### Prioridad Alta (Semana 2)
- [ ] Estructura organizacional (roles)
- [ ] Protocolo anti-spam actual
- [ ] Política manejo de imágenes

### Prioridad Media (Semana 3)
- [ ] Validación operativa (entrevistas)

---

**Versión:** 1.0 | **Estado:** BORRADOR | **Próxima revisión:** Semana 3  
**Aprobación Requerida Por:** Jefe de Tránsito + Comisión