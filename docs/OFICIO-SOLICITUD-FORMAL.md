# OFICIO FORMAL DE SOLICITUD
## Requerimientos Técnicos para Proyecto Tránsito Alerta Santa Elena

---

**PARA:** Comisión de Tránsito del Cantón Santa Elena  
**DE:** Equipo de Desarrollo - Programa Jóvenes en Acción  
**FECHA:** 31 de Julio de 2026  
**ASUNTO:** Solicitud de Documentación Oficial - Proyecto Tránsito Alerta SE  
**REF:** TASE-2026-SOL-001  

---

## I. PROPÓSITO

En el marco del Proyecto **Tránsito Alerta SE**, requerimos acceso a documentación técnica y operativa oficial de la Comisión de Tránsito para elaborar la Especificación de Requerimientos del Sistema (SRS) y garantizar alineación con procesos, políticas y estándares institucionales.

Este oficio solicita **12 documentos clave** distribuidos en 6 categorías funcionales, necesarios antes de iniciar Fase 2 (Desarrollo) del proyecto.

---

## II. DOCUMENTOS SOLICITADOS

### **PRIORIDAD P0 - CRÍTICA (Semana 1)**

Estos documentos son bloqueadores. Desarrollo no puede avanzar sin ellos.

#### 1. **Catálogo Oficial de Incidentes Viales**
- **Responsable:** Departamento de Operaciones / CTE
- **Formato:** PDF, Excel o Lista digital
- **Contenido requerido:**
  - Tipología completa de incidencias (colisión, atropello, semáforo dañado, derrumbe, obstáculo, congestión, etc.)
  - Códigos internos o códigos ECU-911 (si existen)
  - Definición de cada categoría
- **Uso:** Configurar opciones del formulario PWA ciudadano + capacitación operadores

#### 2. **Capa Poligonal del Cantón Santa Elena (Datos GIS)**
- **Responsable:** Departamento de Planificación / Técnico
- **Formato:** Shapefile, GeoJSON o KML
- **Contenido requerido:**
  - Límites exactos del cantón Santa Elena
  - Vías bajo competencia de CTE vs. vías municipales/estatales
  - Tramos viales críticos ("puntos negros" de accidentalidad)
- **Uso:** Validación geofencing (aceptar/rechazar reportes según ubicación)

#### 3. **Manual de Operaciones y Protocolo de Despacho**
- **Responsable:** Jefe de Tránsito / Dirección Operativa
- **Formato:** PDF o documento institucional
- **Contenido requerido:**
  - Ciclo de vida oficial de un incidente (estados: Reportado → Verificación → Patrulla Despachada → En Sitio → Finalizado)
  - Protocolos de escalación (a qué supervisor, en cuánto tiempo)
  - Roles y responsabilidades operativas
  - Tiempos de respuesta por tipo de incidente
- **Uso:** Mapeo de estados en Dashboard + definición de SLA

#### 4. **Política de Manejo de Datos Personales y Privacidad (LGPD)**
- **Responsable:** Asesoría Legal / Cumplimiento normativo
- **Formato:** Documento de política institucional
- **Contenido requerido:**
  - ¿Se requieren datos personales (nombre, cédula, email, celular) para reportar?
  - ¿Política de anonimización de ciudadanos?
  - ¿Cómo se manejan fotografías de accidentes (consentimiento, difuminado)?
  - ¿Período de retención legal de datos e imágenes?
- **Uso:** Validar cumplimiento LGPD Ecuador + definir campos en formulario PWA

---

### **PRIORIDAD P1 - ALTA (Semana 1-2)**

Documentos importantes. Desarrollo puede usar valores preliminares mientras se reciben.

#### 5. **Matriz de Niveles de Priorización (SLA)**
- **Responsable:** Supervisor de Tránsito / Jefe de Tránsito
- **Formato:** Tabla o documento
- **Contenido requerido:**
  - Definición de Prioridad ALTA (con ejemplos)
  - Definición de Prioridad MEDIA (con ejemplos)
  - Definición de Prioridad BAJA (con ejemplos)
  - Tiempos de despacho por nivel (ej: ALTA < 8 minutos)
- **Uso:** Configurar niveles en formulario + alertas en Dashboard

#### 6. **Organigrama Oficial de la Comisión de Tránsito**
- **Responsable:** Recursos Humanos / Dirección
- **Formato:** Organigrama PDF o documento
- **Contenido requerido:**
  - Estructura de departamentos (Operativa, Señalización, Semaforización, Técnico, etc.)
  - Roles por departamento (Operador, Supervisor, Jefe)
  - Responsables de cada área
- **Uso:** Configurar asignación automática de reportes por categoría + gestión de permisos Dashboard

#### 7. **Criterios y Protocolos Anti-Spam/Reportes Falsos**
- **Responsable:** Supervisor de Calidad / Operaciones
- **Formato:** Documento o guía
- **Contenido requerido:**
  - ¿Cómo detectan reportes falsos actualmente?
  - ¿Cuáles son los tipos más comunes de spam?
  - ¿Protocolo para marcar/bloquear reportes?
  - ¿Acciones ante reportes duplicados?
- **Uso:** Entrenar filtros automáticos + moderación manual en Dashboard

#### 8. **Política de Comunicación e Integración Institucional**
- **Responsable:** Dirección / Comunicaciones
- **Formato:** Documento de política
- **Contenido requerido:**
  - Canales preferidos para notificaciones críticas (Telegram, WhatsApp, Email)
  - ¿Integración con ECU-911 (sí/no/futuro)?
  - ¿Integración con sistema de despacho interno (sí/no)?
  - ¿Otros sistemas a conectar?
- **Uso:** Configurar notificaciones en Backend + integraciones futuras

---

### **PRIORIDAD P2 - MEDIA (Semana 2)**

Documentos de referencia. Menos críticos pero recomendados para completitud.

#### 9. **Reglas de Escalación Automática**
- **Responsable:** Jefe de Tránsito / Supervisor
- **Formato:** Documento o tabla
- **Contenido requerido:**
  - ¿A cuántos minutos sin respuesta se escala a supervisor?
  - ¿A cuántos minutos se escala a jefe de tránsito?
  - ¿Cuáles son los criterios de escalación (por prioridad, por tiempo, por múltiples reportes)?
- **Uso:** Configurar alertas automáticas + notificaciones Telegram en Dashboard

#### 10. **Especificaciones de Puntos Críticos o Zonas de Riesgo**
- **Responsable:** Departamento de Planificación
- **Formato:** Listado, mapa o documento
- **Contenido requerido:**
  - Identificación de zonas con mayor accidentalidad
  - Sectores que requieren monitoreo especial
  - Horarios pico de congestión
- **Uso:** Heatmaps en Dashboard + alertas especiales por zona

---

### **PRIORIDAD P3 - BAJA (Semana 3)**

Datos complementarios para validación operativa. Pueden recolectarse post-lanzamiento.

#### 11. **Validación Operativa (Entrevista con Operadores)**
- **Responsable:** PM del Proyecto (PM conduce entrevista)
- **Formato:** Notas de entrevista con 2-3 operadores clave
- **Contenido requerido:**
  - ¿Cuántas patrullas operan por turno?
  - ¿Cuáles son los 3 sectores más conflictivos?
  - ¿Qué información ven PRIMERO al recibir reporte?
  - ¿Cómo se coordinan operador-supervisor-patrulla?
  - ¿Qué tipos de reportes falsos llegan más frecuentemente?
- **Uso:** Validación UX/UI del Dashboard + optimización de flujos

#### 12. **Políticas de Retención de Datos**
- **Responsable:** Asesoría Legal / TI
- **Formato:** Documento de política
- **Contenido requerido:**
  - ¿Cuánto tiempo guardar reportes resueltos?
  - ¿Cuánto tiempo guardar fotografías?
  - ¿Política de auditoría y logs?
  - ¿Procedimiento de eliminación de datos expirados?
- **Uso:** Configurar políticas de base de datos + cumplimiento normativo

---

## III. MATRIZ RESUMEN

| # | Documento | Prioridad | Plazo | Responsable | Estado |
|---|-----------|-----------|-------|------------|--------|
| 1 | Catálogo Incidentes | P0 | S1 | Operaciones | ⏳ |
| 2 | Capa Poligonal GIS | P0 | S1 | Planificación | ⏳ |
| 3 | Manual Operaciones | P0 | S1 | Jefe Tránsito | ⏳ |
| 4 | Política Privacidad (LGPD) | P0 | S1 | Legal | ⏳ |
| 5 | Matriz SLA Prioridades | P1 | S1-S2 | Supervisor | ⏳ |
| 6 | Organigrama | P1 | S1-S2 | RRHH | ⏳ |
| 7 | Protocolo Anti-Spam | P2 | S2 | Calidad | ⏳ |
| 8 | Política Comunicación | P2 | S2 | Dirección | ⏳ |
| 9 | Reglas Escalación | P2 | S2 | Jefe Tránsito | ⏳ |
| 10 | Puntos Críticos | P2 | S2 | Planificación | ⏳ |
| 11 | Validación Operativa | P3 | S3 | PM (entrevistas) | ⏳ |
| 12 | Política Retención | P3 | S3 | Legal/TI | ⏳ |

---

## IV. FORMATOS Y CANALES DE ENTREGA

**Formato preferido:** Digital  
- PDF, Excel, Shapefile (.shp), GeoJSON (.geojson), Word o formato nativo

**Medio de entrega:**
- Email: `desarrollo@transitoalertase.ec`
- O entregar presencialmente en reunión de coordinación

**Estructura de carpeta sugerida:**
```
TASE_DOCUMENTACION_CTE/
├─ P0_CRITICA/
│  ├─ Catálogo_Incidentes.xlsx
│  ├─ Capa_Poligonal_Santa_Elena.geojson
│  ├─ Manual_Operaciones_Despacho.pdf
│  └─ Politica_Privacidad_LGPD.pdf
├─ P1_ALTA/
│  ├─ Matriz_SLA.xlsx
│  ├─ Organigrama_CTE.pdf
│  └─ ...
└─ NOTAS/
   └─ Contactos_Responsables.txt
```

---

## V. IMPACTO Y JUSTIFICACIÓN

Estos documentos son **críticos** para:

1. **Alineación Técnica:** Garantizar que sistema refleje procesos reales de CTE
2. **Cumplimiento Normativo:** Validar LGPD Ecuador en manejo de datos
3. **Usabilidad:** Diseñar Dashboard con jerarquía de información correcta
4. **Sostenibilidad:** Asegurar adopción institucional post-piloto

**Sin estos documentos:**
- ❌ Formulario PWA no alineado con terminología CTE
- ❌ Asignación automática de reportes fallará
- ❌ Incumplimiento LGPD (riesgo legal)
- ❌ Dashboard no refleja flujo operativo real

---

## VI. PRÓXIMOS PASOS

1. **Kickoff (Esta semana):** Presentar oficio + designar contacto técnico en Comisión
2. **Semana 1:** Comisión confirma recepción + entrega documentos P0
3. **Semana 2:** Recolección documentos P1 + validación de datos
4. **Semana 3:** Validación operativa (entrevistas) + recepción documentos P3
5. **Semana 4:** Equipo incorpora datos en SRS.md versión 1.1
6. **Semana 5:** Revisión conjunta Comisión + aprobación final SRS

---

## VII. CONTACTO

**Coordinador Técnico Proyecto:**  
Nombre: [Nombre PM]  
Correo: desarrollo@transitoalertase.ec  
Teléfono: [Número]  
Disponibilidad: Lunes-Viernes 08:00-17:00

**Enlace Sugerido en Comisión:**  
Nombre: [A definir]  
Cargo: [A definir]  
Correo: [A definir]

---

## VIII. REFERENCIAS

Para detalles técnicos de cada documento, consultar:
- **DocuSolicitar.md** → Especificaciones detalladas por documento
- **SRS.md** → Especificación de requerimientos (versión provisional)
- **PROPUESTA-FORMAL-BORRADOR.md** → Contexto general del proyecto

---

**Atentamente,**

```
Equipo de Desarrollo
Programa Jóvenes en Acción

Fecha: 31 de Julio de 2026
Proyecto: Tránsito Alerta Santa Elena (TASE)
Versión Oficio: 1.0
```

---

## APÉNDICE: DEFINICIONES TÉCNICAS RÁPIDAS

**Geofencing:** Validación automática de ubicación para aceptar/rechazar reportes fuera del cantón.

**ECU-911:** Sistema nacional integrado de emergencias del Ecuador.

**LGPD:** Ley Orgánica de Protección de Datos Personales de Ecuador.

**SLA:** Service Level Agreement (Acuerdos de Nivel de Servicio).

**Dashboard:** Panel administrativo para gestión de reportes.

**PWA:** Progressive Web App (aplicación web que funciona offline).
