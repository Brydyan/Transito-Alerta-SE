# 📋 Requerimientos Normativos y Datos para SRS
## Checklist de Documentos a Solicitar a Comisión de Tránsito

---

## I. REQUISITOS FUNCIONALES DEL SISTEMA

### 1. Taxonomía de Incidentes Viales
**Documento a Solicitar:** Catálogo Oficial de Tipos de Incidencias  
**Responsable:** Comisión de Tránsito / Operaciones

| Información | Propósito |
|-----------|-----------|
| Lista formal de tipos (colisión, atropello, semáforo dañado, derrumbe, obstáculo, vehículo averiado, etc.) | Mapear opciones exactas en formulario PWA ciudadano |
| Códigos de clasificación (ej: E101, E104, E205) | Integrar con terminología institucional/ECU-911 |
| Definición de cada categoría | Entrenar operadores + documentación SRS |

**Integración SRS:** Sección 3.2 - Catálogo de Incidentes

---

### 2. Matriz de Priorización (Triaje)
**Documento a Solicitar:** Criterios de Urgencia por Gravedad  
**Responsable:** Supervisor de Tránsito

| Nivel | Criterios | Tiempos Respuesta |
|-------|----------|------------------|
| **ALTA** | Riesgo inmediato (accidente activo, bloqueo total) | < 8 minutos despacho |
| **MEDIA** | Molestia importante (semáforo, congestión) | < 15 minutos |
| **BAJA** | Información menor (bache, objeto pequeño) | < 30 minutos |

**Integración SRS:** Sección 3.3 - Niveles de Prioridad

---

## II. REQUISITOS DE DOMINIO (Geofencing)

### 3. Datos Geográficos Oficiales
**Documento a Solicitar:** Capa Poligonal de Jurisdicción  
**Formato:** Shapefile / GeoJSON / KML  
**Responsable:** Departamento GIS / Planificación Cantonal

| Dato | Uso Técnico |
|------|-----------|
| Límites exactos del cantón Santa Elena | Configurar PostGIS geofencing |
| Vías bajo competencia CTE vs. municipales | Validar reportes dentro de jurisdicción |
| Tramos viales críticos ("puntos negros") | Markups en mapa + alertas especiales |

**Integración SRS:** Sección 4 - Dominio Geográfico

---

## III. REQUISITOS DE SISTEMA Y OPERACIÓN

### 4. Ciclo de Vida Oficial del Reporte
**Documento a Solicitar:** Manual de Operaciones y Protocolo de Despacho  
**Responsable:** Comisión de Tránsito

```
FLUJO OFICIAL:
Reportado → Verificación → Patrulla Despachada → En Sitio → Finalizado / Falso Positivo
```

**Mapping SRS:**
| Estado Oficial | Estado en Dashboard | Trigger |
|---|---|---|
| Reportado | NUEVO | Ciudadano envía reporte |
| Verificación | EN REVISIÓN | Operador valida información |
| Patrulla Despachada | EN PROCESO | Operador asigna unidad |
| En Sitio | EN ATENCIÓN | Confirmación patrulla |
| Finalizado / Falso | RESUELTO / RECHAZADO | Cierre operador/supervisor |

**Integración SRS:** Sección 3.1 - Ciclo de Vida

---

### 5. Matriz de Roles y Permisos
**Documento a Solicitar:** Estructura Organizacional y Responsabilidades  
**Responsable:** Jefe de Tránsito

| Rol | Permisos en Dashboard | Acceso a Datos |
|-----|----------------------|---|
| **Operador** | Ver reportes, asignar patrullas, cambiar estado | Reportes actuales + 24h |
| **Supervisor de Turno** | Validar, escalar, generar reportes | Histórico completo + analytics |
| **Administrador** | Gestionar usuarios, backups, auditoría | Full access |

**Integración SRS:** Sección 5 - Estructura de Usuarios

---

### 6. Protocolo Anti-Spam
**Documento a Solicitar:** Criterios Actuales para Descartar Reportes  
**Responsable:** Supervisor de Calidad

| Tipo de Descarte | Acción Automática | Acción Manual |
|---|---|---|
| Múltiples reportes mismo device < 10 min | Rate limiting | Blacklist temporal |
| Ubicación imposible (de cantón A a B en 30s) | Rechazar | Supervisar |
| EXIF inválido o foto antigua | Requerir recaptura | Validar manualmente |
| Reportes duplicados (misma zona < 5 min) | Merge | Operador revisa |

**Integración SRS:** Sección 6 - Control de Calidad

---

## IV. REQUISITOS NO FUNCIONALES (Performance)

### 7. Matriz SLA y Tiempos de Respuesta
**Documento a Solicitar:** Normas de Nivel de Servicio  
**Responsable:** Jefe de Tránsito

| Métrica | Meta | Penalización |
|---------|------|--------------|
| Recepción a despacho (Prioridad ALTA) | < 8 min | Alerta a supervisor en 15 min |
| Recepción a despacho (Prioridad MEDIA) | < 15 min | Notificación a supervisor |
| Disponibilidad del sistema | 99.5% uptime | Soporte técnico 24/7 |
| Tiempo de sincronización offline | < 2 min (recuperación de conexión) | Reintentos automáticos |

**Integración SRS:** Sección 7 - SLA y KPIs

---

### 8. Reglas de Escalación
**Documento a Solicitar:** Protocolo de Escalada a Supervisor  
**Responsable:** Jefe de Tránsito

```
Regla 1: Prioridad ALTA sin interacción → 15 min → Notificación Telegram a supervisor
Regla 2: Prioridad ALTA sin resolver → 45 min → Escalar a jefe de turno
Regla 3: Múltiples ALTA en mismo sector → Considerar refuerzo de patrullas
```

**Integración SRS:** Sección 8 - Escalación

---

## V. REQUISITOS DE INTERFAZ EXTERNA

### 9. Integración con Sistemas Existentes
**Documento a Solicitar:** Arquitectura Técnica Actual  
**Responsable:** Departamento TI / CTE

| Sistema | ¿Integración Requerida? | Datos a Compartir |
|---------|-----------|---|
| ECU-911 | Opcional (Fase 2) | Reportes de tránsito, estadísticas |
| Sistema de Despacho Interno | Opcional | Ubicación de patrullas, asignaciones |
| Base de datos histórica | Sí (lectura) | Consultar incidentes previos |
| Radio de comunicación | No (manual) | Operador notifica vía radio |

**Integración SRS:** Sección 9 - Integraciones

---

### 10. Canales de Notificación Preferidos
**Documento a Solicitar:** Política de Comunicación Institucional  
**Responsable:** Supervisión

| Canal | Uso | Frecuencia |
|-------|-----|-----------|
| **Telegram Bot** | Alertas críticas (Prioridad ALTA) | Inmediata |
| **WhatsApp API** | Notificaciones a supervisores | Si Telegram no responde |
| **Dashboard (Web)** | Notificaciones primarias | Realtime + sonido |
| **Email** | Reportes diarios/estadísticas | Fin de turno / fin de semana |

**Integración SRS:** Sección 10 - Notificaciones

---

## VI. REQUISITOS DE SEGURIDAD Y PRIVACIDAD

### 11. Política de Manejo de Imágenes
**Documento a Solicitar:** Protocolo de Evidencia Digital  
**Responsable:** Jefe de Tránsito + Asesoría Legal

| Aspecto | Norma Requerida |
|--------|-----------------|
| **Consentimiento Ciudadano** | ¿Fotografía de accidente requiere permiso? |
| **Anonimización** | ¿Difuminar rostros / placas automáticamente? |
| **Uso de Imágenes** | ¿Solo para operaciones o también reporte público? |
| **Retención Legal** | ¿Cuánto tiempo guardar archivos después de resolución? |

**Integración SRS:** Sección 11 - Privacidad

---

### 12. Retención de Datos
**Documento a Solicitar:** Política de Ciclo de Vida de Datos  
**Responsable:** Asesoría Legal / TI

| Tipo de Dato | Período Retención | Acceso Permitido |
|---|---|---|
| Reportes resueltos | 1 año (auditoría) | Supervisor + Admin |
| Imágenes | 6 meses | Acceso restringido |
| Datos de usuario anónimo | 30 días | Análisis de patrones |
| Logs de sistema | 90 días | Admin + seguridad |

**Integración SRS:** Sección 12 - Retención

---

## VII. DATOS COMPLEMENTARIOS (UX Validation)

### 13. Validación Operativa (Cuestionario Breve)
**Formato:** Entrevista con 2-3 operadores clave  
**Responsable:** PM del Proyecto

```
Preguntas clave:
1. ¿Cuántas patrullas operan por turno? → Dimensionar dashboard
2. ¿Cuáles son los sectores más conflictivos? → Highlightear en mapa
3. ¿Qué información ven PRIMERO al recibir reporte? → Jerarquía UI
4. ¿Cómo coordinan entre operador-supervisor-patrulla? → Flujo de comunicación
5. ¿Qué reportes falsos son más frecuentes? → Entrenar filtros
```

**Integración SRS:** Sección 13 - User Research

---

## VIII. MATRIZ DE SOLICITUD FORMAL

| Documento | Prioridad | Plazo | Responsable | Entregable |
|-----------|-----------|-------|------------|-----------|
| Manual Operaciones + Despacho | **P0 - Crítica** | Semana 1 | Comisión | PDF + guía |
| Catálogo Incidentes | **P0 - Crítica** | Semana 1 | Comisión | Matriz Excel/JSON |
| Capa Poligonal (GIS) | **P0 - Crítica** | Semana 1 | Planificación | Shapefile / GeoJSON |
| Criterios Priorización | **P1 - Alta** | Semana 1 | Supervisor | Documento SLA |
| Estructura Roles | **P1 - Alta** | Semana 2 | RR.HH. | Organigrama + permisos |
| Protocolo Anti-Spam | **P2 - Media** | Semana 2 | Calidad | Guía descarte |
| Política Imágenes | **P2 - Media** | Semana 2 | Legal | Documento privacidad |
| Validación Operativa | **P3 - Baja** | Semana 3 | PM | Notas entrevista |

---

## IX. PLANTILLA FORMAL DE OFICIO

**Asunto:** Solicitud de Documentación Oficial para Especificación de Requerimientos (SRS) - Proyecto Tránsito Alerta SE

```
[ENCABEZADO INSTITUCIONAL]

Estimado [Nombre Jefe de Tránsito],

En el marco del Proyecto Tránsito Alerta SE (TASE), requerimos acceso a la siguiente 
documentación para elaborar la Especificación de Requerimientos del Sistema (SRS):

[Tabla de Solicitud - Ver Sección VIII]

Plazo solicitado: [14 días hábiles]
Formato preferido: Digital (PDF, Excel, GeoJSON, etc.)
Contacto técnico: [Nombre PM] - [Email] - [Teléfono]

Agradeceríamos la asignación de un responsable de enlace técnico para validar 
la información durante la elaboración de la SRS.

Atentamente,
[Equipo de Desarrollo]
```

---

## X. MAPEO DIRECTO A SRS.md

| Sección SRS | Datos Requeridos | Documento Fuente |
|---|---|---|
| **3.1 - Ciclo de Vida** | Estados oficiales | Manual Operaciones |
| **3.2 - Taxonomía** | Catálogo incidentes | Catálogo CTE/ECU-911 |
| **3.3 - Priorización** | Criterios ALTA/MEDIA/BAJA | SLA + Despacho |
| **4 - Dominio Geográfico** | Límites + puntos críticos | Capa Poligonal GIS |
| **5 - Estructura Usuarios** | Roles y permisos | Organigrama + Despacho |
| **6 - Control Calidad** | Reglas anti-spam | Protocolo descarte |
| **7 - SLA y KPIs** | Tiempos respuesta | Matriz SLA |
| **8 - Escalación** | Reglas escalada | Manual Operaciones |
| **9 - Integraciones** | Sistemas conectados | Arquitectura TI |
| **10 - Notificaciones** | Canales preferidos | Política Comunicación |
| **11 - Privacidad** | Manejo imágenes | Protocolo Evidencia |

---

## ✅ PRÓXIMOS PASOS

1. **Semana 1:** Presentar oficio formal a Comisión + designar contacto técnico
2. **Semana 1-2:** Recolectar documentos P0 y P1
3. **Semana 2-3:** Validar información con operadores (entrevistas)
4. **Semana 3:** Incorporar datos en SRS.md (versión 1.0)
5. **Semana 4:** Revisión conjunta Comisión + Equipo técnico
6. **Semana 5:** SRS.md finalizado y aprobado