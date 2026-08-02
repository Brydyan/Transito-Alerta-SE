# Guía de Llenado: Entregable 4 (E4)
## Ejecución de Pruebas y Gestión de Defectos

**Asignatura:** Calidad de Software  
**Entregable:** E4 (Hito 4 · Quality Control - QC)  
**Requisito:** 100% de casos del E3 ejecutados + evidencias trazables  
**Extensión:** 5-7 páginas  

---

## 1. PORTADA Y METADATOS
```
UNIVERSIDAD ESTATAL PENÍNSULA DE SANTA ELENA
FACULTAD DE SISTEMAS Y TELECOMUNICACIONES
CARRERA DE INGENIERÍA EN SOFTWARE

ASIGNATURA: Calidad de Software
TEMA: Entregable 4: Ejecución de Pruebas y Gestión de Defectos
ELABORADO POR: [Nombres de los 3 integrantes]
CURSO Y PARALELO: Software 6/1
DOCENTE: Ing. Anthony Abrahan Pachay Espinoza
FECHA: [dd/mm/yyyy]

LA LIBERTAD – ECUADOR
```

---

## 2. SECCIÓN 1: LÍNEA BASE DEL AMBIENTE
**Objetivo:** Documentar versiones exactas de software, hardware e infraestructura.

### 2.1 Versiones de Componentes (llenar con valores reales)
| Componente | Versión | Descripción |
|---|---|---|
| **Sistema Operativo** | Linux 7.1.2-3-cachyos | Kernél host |
| **PHP** | 8.2.x | Backend Laravel |
| **Laravel Framework** | 11.x | API REST |
| **PostgreSQL** | 17.3 | Base de datos relacional |
| **PostGIS** | 3.5 | Extensión geoespacial |
| **Redis** | 8-alpine | Cache + Queue |
| **Node.js** | (Si aplica) | Frontend tools |
| **Docker** | 4.x | Contenedorización |
| **Docker Compose** | 2.x | Orquestación local |
| **Navegadores Probados** | Chrome 126+, Firefox 126+ | Entorno de pruebas frontend |

### 2.2 Infraestructura Docker Compose
```yaml
Servicios en Red (bridge dev-network):
├─ frontend:3000    → Nginx + HTML/Bootstrap 5
├─ backend:8000     → Laravel Octane + RoadRunner
├─ db:5432          → PostgreSQL 17 + PostGIS 3.5
└─ redis:6379       → Cache/Queue
```

**Comando de despliegue:**
```bash
docker-compose up -d
```

**Verificación de salud:**
```bash
docker-compose ps
# Todos deben estar "Up"

# Probar conectividad:
curl http://localhost:8000/api/health
curl http://localhost:3000
```

### 2.3 Base de Datos
- **Nombre:** `incidencias_db`
- **Usuario:** `user`
- **Contraseña:** `password` (solo dev)
- **Puerto:** 5432
- **Migraciones ejecutadas:** Todas (1-13, en orden)
  - ✓ create_users_table
  - ✓ enable_postgis
  - ✓ create_locations_table
  - ✓ create_organizations_table
  - ... (todas las demás)

**Comando de inicialización:**
```bash
cd backend
php artisan migrate:fresh --seed
```

---

## 3. SECCIÓN 2: BITÁCORA E HISTORIAL DE EJECUCIÓN
**Objetivo:** Registro formal y riguroso de TODOS los casos ejecutados del E3.

### 3.1 Tabla Maestra de Ejecución
Crear tabla con estos campos (mínimo 25-90 casos según Plan de Calidad):

| ID Caso | Módulo | Descripción | Fecha Ejecución | Resultado Esperado | Resultado Obtenido | Estado | Notas |
|---|---|---|---|---|---|---|---|
| **CP-01-01-F** | Incidencias | Crear incidencia con datos válidos | 2026-07-XX | Se crea, redirige a detalle | Se creó correctamente | ✅ APROBADO | Latencia < 2s |
| **CP-01-02-F** | Incidencias | Teléfono: solo números, max 15 | 2026-07-XX | Campo rechaza letras | Campo mostró warning | ✅ APROBADO | Validación input correcta |
| **CP-01-03-F** | Incidencias | Seleccionar ubicación en mapa | 2026-07-XX | Marcador draggable, lat/lng auto-fill | Funcionó, campos activos | ✅ APROBADO | Leaflet.js integrado |
| **CP-02-01-F** | Estados | Ver transiciones válidas (dropdown) | 2026-07-XX | Dropdown muestra: Pendiente → En Proceso → Resuelto | Mostró correctamente | ✅ APROBADO | Solo roles autorizados |
| **CP-02-02-F** | Estados | Cambiar estado y registrar en historial | 2026-07-XX | Status_History tiene nueva fila con timestamp | Se registró + historial visible | ✅ APROBADO | Timestamp UTC |
| **CP-XX-YY-F** | ... | ... | ... | ... | ... | ... | ... |

**Notas de llenado:**
- **Fecha Ejecución:** Debe coincidir con fecha real de prueba
- **Estado:** ✅ APROBADO / ❌ FALLIDO / 🔄 BLOQUEADO
- **Resultado Obtenido:** Describe EXACTAMENTE qué pasó (no copiar esperado)
- Si es FALLIDO: describir síntoma observable + error en consola

### 3.2 Plantilla de Resultado Detallado (para casos críticos)
**Caso:** CP-01-01-F  
**Ambiente:** Docker Compose + PostgreSQL 17 + PostGIS 3.5  
**Procedimiento:**
1. Navegar a `http://localhost:3000/incidencias/crear`
2. Rellenar: título, descripción, prioridad, teléfono, tipo, subtipo
3. Seleccionar ubicación en mapa (Salinas, Provincia Santa Elena)
4. Click en botón "Crear incidencia"

**Evidencia:** [Adjuntar captura o video]  
**Resultado:** Incidencia creada, ID#42, redirigido a `/incidencias/42`  
**Estado:** ✅ APROBADO

---

## 4. SECCIÓN 3: DEPÓSITO DOCUMENTAL DE EVIDENCIAS
**Objetivo:** Compilación ordenada y trazable de capturas, logs y peticiones API.

### 4.1 Estructura de Carpeta de Evidencias
```
docs/
├── evidencias_E4/
│   ├── CP-01-01-F_crear_incidencia.png
│   ├── CP-01-02-F_validacion_telefono.png
│   ├── CP-01-03-F_mapa_ubicacion.mp4  [video opcional]
│   ├── CP-02-01-F_dropdown_estados.png
│   ├── API_responses/
│   │   ├── POST_incidencias_201.json
│   │   ├── GET_incidencias_200.json
│   │   └── PUT_incidencias_22_error.json
│   ├── server_logs/
│   │   └── laravel_2026-07-XX.log
│   ├── browser_console/
│   │   ├── CP-01-03-F_console.png
│   │   └── CP-02-02-F_network_tab.png
│   └── postman_exports/
│       └── incidencias_api_collection.json
```

### 4.2 Contenido Obligatorio de Cada Captura
Cada screenshot/log DEBE incluir:
- **ID del caso** (ej: CP-01-01-F)
- **Timestamp** visible (esquina inferior derecha)
- **URL del navegador** o **endpoint de API**
- **Estado/código HTTP** (200, 201, 422, 500, etc.)
- **Datos relevantes** (usuario logueado, rol, organización)

**Ejemplo de captura aceptable:**
```
[Screenshot de pantalla]
Título: CP-01-01-F - Crear Incidencia
URL: http://localhost:3000/incidencias/crear
Usuario: admin@upse.edu.ec (Rol: Publicador)
Timestamp: 2026-07-08 14:32:45
HTTP Response: 201 Created
Body (snippet): {
  "id": 42,
  "titulo": "Socavón en Av. Principal",
  "estado": "pending"
}
```

### 4.3 Evidencias Críticas por Módulo

#### **Módulo 01: Incidencias**
- CP-01-01-F: Captura del formulario rellenado + respuesta 201 del backend
- CP-01-02-F: Captura de validación de teléfono (warning en tiempo real)
- CP-01-03-F: Captura del mapa con marcador + inputs de lat/lng poblados
- CP-01-04-F: Captura de edición de incidencia
- CP-01-05-F: Captura del modal de confirmación de eliminación
- CP-01-06-F: Captura de toast de "Eliminado exitosamente"

#### **Módulo 02: Gestión de Estados**
- CP-02-01-F: Captura del dropdown de transiciones válidas
- CP-02-02-F: Captura antes y después de cambio de estado + historial
- CP-02-03-F: Captura de transición inválida bloqueada

#### **Otros Módulos**
- [Por cada módulo activo en el Plan de Calidad]

---

## 5. SECCIÓN 4: REGISTRO DE BUGS & CICLO DE VIDA
**Objetivo:** Inventario estructurado de defectos hallados y su remediación.

### 5.1 Tabla de Defectos (Seguimiento)
| ID Bug | Caso Origen | Título | Severidad | Estado | Fecha Detección | Fecha Cierre | Evidencia |
|---|---|---|---|---|---|---|---|
| **BUG-001** | CP-01-01-F | Crear incidencia: falla con caracteres especiales | 🔴 **CRÍTICO** | ✅ CORREGIDO | 2026-07-08 | 2026-07-08 | PR#XX |
| **BUG-002** | CP-01-02-F | Teléfono: aún acepta caracteres (regex falla) | 🟠 **ALTO** | ✅ CORREGIDO | 2026-07-08 | 2026-07-08 | Commit abc123 |
| **BUG-003** | CP-02-01-F | Estado resuelto: no visible en dropdown | 🟡 **MEDIO** | ⏳ PENDIENTE | 2026-07-08 | — | Backlog Sprint 2 |
| **BUG-004** | CP-01-03-F | Mapa lento en primeras 2 cargas | 🟢 **BAJO** | 📋 DOCUMENTED | 2026-07-08 | — | Issue #42 |

### 5.2 Plantilla de Ciclo de Vida (Bug Corregido)
```
───────────────────────────────────────
BUG-001: Crear incidencia falla con caracteres especiales
───────────────────────────────────────

🔴 SEVERIDAD: CRÍTICO
Afecta: Creación de incidencias en producción
Impacto: 100% de incidencias con ñ, acentos fallan

📍 DETECCIÓN
Caso: CP-01-01-F
Fecha: 2026-07-08 14:15:00
Usuario: Integrante 1
Síntoma: 
  - Titulo: "Agua stagnante en zona Salinas"
  - Error en consola: "Syntax error in JSON"
  - Backend responde 422 Unprocessable Entity

🔍 ROOT CAUSE
Archivo: backend/app/Domains/Incidents/Http/Requests/StoreIncidentRequest.php
Línea: 45
Problema: Validador UTF-8 falta en campo `titulo`
```php
// ❌ ANTES
$this->validate([
    'titulo' => 'string|required|max:100',  // no UTF-8
]);

// ✅ DESPUÉS
$this->validate([
    'titulo' => 'string|required|max:100|regex:/^[\pL\d\s\-.,ñáéíóú]+$/u',
]);
```

🔧 REPARACIÓN
Rama: fix/incident-title-encoding
Commit: abc123def456
PR: #42 (Merged)
Cambios: +2 líneas en StoreIncidentRequest.php

✅ RE-TEST (Validación de Parche)
Fecha: 2026-07-08 15:45:00
Caso Re-ejecutado: CP-01-01-F
Datos: Titulo = "Agua stagnante en Ñ. Salinas"
Resultado: ✅ APROBADO
Response: 201 Created, ID#43
Evidencia: [Captura del caso re-ejecutado]

✅ ESTADO: CERRADO
```

### 5.3 Clasificación de Severidad (Estándar ISTQB)
| Nivel | Definición | Ejemplos | Acción |
|---|---|---|---|
| 🔴 **CRÍTICO** | Bloquea funcionalidad principal; sin workaround | No crear incidencias, API no responde | Arreglar **antes del despliegue** |
| 🟠 **ALTO** | Funcionalidad importante degradada; se puede continuar | Validación falla, mapa lento | Arreglar en **sprint actual** |
| 🟡 **MEDIO** | Funcionalidad secundaria afectada | Búsqueda lenta, UI desalineada | Arreglar en **próximo sprint** |
| 🟢 **BAJO** | Cosmético o minor; no impacta operación | Icono descentrado, tooltip incorrecto | Backlog/Nice-to-have |

---

## 6. SECCIÓN 5: CUADRO ESTADÍSTICO DE CIERRE
**Objetivo:** Consolidado numérico que demuestre cobertura y calidad.

### 6.1 Tabla de Métricas Generales
```
╔════════════════════════════════════════════════════════════════╗
║          ESTADÍSTICAS FINALES DE EJECUCIÓN (E4)               ║
╚════════════════════════════════════════════════════════════════╝

CASOS DE PRUEBA
├─ Diseñados en E3:              90
├─ Ejecutados en E4:             90 (100%)
├─ Aprobados:                    85 (94.4%)
├─ Fallidos:                      5 (5.6%)
└─ Bloqueados:                    0 (0%)

DEFECTOS DETECTADOS
├─ Total Críticos:                2
├─ Total Altos:                   3
├─ Total Medios:                  4
├─ Total Bajos:                   2
└─ TOTAL:                         11

DEFECTOS REMEDIADOS
├─ Críticos corregidos:           2 (100%)
├─ Altos corregidos:              3 (100%)
├─ Medios corregidos:             2 (50%)
├─ Bajos corregidos:              1 (50%)
└─ TOTAL CORREGIDOS:              8 (73%)

BALANCE DE CALIDAD
├─ Casos vs. Defectos:            90 / 11 = 0.12 defectos/caso
├─ Tasa de éxito:                 94.4%
├─ Defectos pendientes:           3 (Backlog)
└─ Recomendación:                 APROBADO (Deploy viables con
                                   reserva técnica)
```

### 6.2 Gráficos (Incluir en documento)
- **Gráfico 1:** Pastel de Casos (Aprobados vs. Fallidos)
- **Gráfico 2:** Barras de Defectos por Severidad
- **Gráfico 3:** Línea temporal de Defectos (Detección vs. Cierre)

---

## 7. SECCIÓN 6: ANÁLISIS, TRAZABILIDAD Y LECCIONES
**Objetivo:** Interpretación analítica, matriz de requisitos y lecciones aprendidas.

### 7.1 Análisis de Zonas Frágiles
```markdown
## Áreas Críticas Identificadas

### 1. Validación de Entrada (Frontend)
**Casos afectados:** CP-01-02-F (teléfono), CP-01-01-F (caracteres especiales)
**Root cause:** Regex incompletos en JavaScript + falta de validación server-side
**Recomendación:** Implementar Form Request validation en TODOS los endpoints (✅ DONE)

### 2. Rendimiento del Mapa (CP-01-03-F)
**Observación:** Primera carga del mapa demora ~3s en ambiente local
**Causa probable:** Leaflet.js + inicialización de OpenStreetMap
**Recomendación:** 
- Lazy loading del script de Leaflet
- Cache de tiles locales (opcional)
- Investigar en producción si persiste

### 3. Estados Incompletos (Módulo 02)
**Caso:** CP-02-XX-F
**Hallazgo:** Estado "Cerrado" ausente en la tabla `incidents` (soft delete usado, no estado real)
**Impacto:** Flujo incompleto; casos de uso no cubiertos
**Recomendación:** Migración futural para columna de estado "closed"

### 4. Gestión de Permisos por Rol (Múltiples casos)
**Caso origen:** CP-03-XX-F, CP-04-XX-F
**Hallazgo:** Lógica de permisos en JavaScript en lugar de backend
**Riesgo de seguridad:** Potencial bypass editando cliente
**Recomendación CRÍTICA:** Mover TODA validación de permisos a Laravel middleware
```

### 7.2 Matriz de Trazabilidad (Requisitos ↔ Casos ↔ Defectos)
| Requisito | Módulo | Casos Diseñados | Casos Pasados | Casos Fallidos | Defectos | Estado |
|---|---|---|---|---|---|---|
| REQ-01: CRUD Incidencias | 01 | 6 | 6 | 0 | 2 | ✅ CUBIERTO |
| REQ-02: Georreferenciación | 01 | 3 | 3 | 0 | 1 | ✅ CUBIERTO |
| REQ-03: Gestión de Estados | 02 | 10 | 9 | 1 | 2 | ⚠️ PARCIAL |
| REQ-04: Asignación de Responsables | 03 | 8 | 7 | 1 | 1 | ⚠️ PARCIAL |
| REQ-05: Comentarios | 04 | 5 | 5 | 0 | 0 | ✅ CUBIERTO |
| ... | ... | ... | ... | ... | ... | ... |
| **TOTAL** | | **90** | **85** | **5** | **11** | **94.4%** |

### 7.3 Lecciones Aprendidas
```markdown
## Lecciones Clave del Ciclo QC

### ✅ Lo que funcionó bien
1. **Framework Laravel + Sanctum**
   - Autenticación confiable, middleware robusto
   - Facilita validación centralizada de permisos

2. **Estructura de repositorio organizada**
   - Separación Domains/Http/Models clara
   - Facilita rastrear cambios y bugs

3. **Validación Backend con Form Requests**
   - Evita inconsistencias con frontend
   - Registra errores predecibles (422 bien estructurado)

### ❌ Desafíos encontrados
1. **Sincronización Frontend/Backend**
   - Constantes de estado desincronizadas sin comando artisan
   - Solución: CI guard (`--check`) implementado en pipeline

2. **Pruebas de Georreferenciación**
   - Leaflet + OpenStreetMap lento en primera carga
   - Solución: Pre-warming de cache, investigación en prod

3. **Documentación incompleta de Permisos**
   - Roles y privilegios no claros entre capas
   - Solución: Wiki interno actualizado en Confluence

### 🚀 Mejoras para el siguiente ciclo (E5)
1. **Implementar tests unitarios** para validadores PHP
2. **Agregar E2E tests** con Cypress/Playwright
3. **Performance profiling** en dashboard + generación de reportes
4. **Automatizar ejecución de casos** con Selenium Grid
5. **Establecer baseline de cobertura de código** (>80%)
```

---

## 8. RESUMEN: CHECKLIST ANTES DE ENTREGAR

Antes de enviar el documento final, verificar:

### ✅ Contenido Técnico
- [ ] Línea base del ambiente: todas las versiones documentadas
- [ ] 100% de los casos del E3 están en la bitácora (mínimo 25-90)
- [ ] Cada caso tiene: fecha, resultado esperado, resultado obtenido, estado
- [ ] Defectos inventariados con severidad ISTQB (Crítico/Alto/Medio/Bajo)
- [ ] Defectos corregidos tienen evidencia de re-test

### ✅ Evidencias
- [ ] Carpeta `evidencias_E4/` organizada y con referencias claras
- [ ] Cada captura/log incluye ID del caso, timestamp y URL/endpoint
- [ ] API responses (JSON) adjuntos para casos de backend
- [ ] Browser console logs para casos de frontend
- [ ] Videos opcionales de flujos críticos (CP-01-03-F mapa, etc.)

### ✅ Análisis y Lecciones
- [ ] Sección 6 identifica zonas frágiles
- [ ] Matriz de trazabilidad actualizada (requisitos ↔ casos ↔ defectos)
- [ ] Root causes de defectos documentados
- [ ] Recomendaciones para E5 explícitas

### ✅ Formato y Presentación
- [ ] Portada completa con integrantes y fecha
- [ ] Índice (si extensión > 6 páginas)
- [ ] Fuente legible (Arial 11 o similar), márgenes 1" all sides
- [ ] Tablas con bordes y numeración de filas
- [ ] Pies de página con # de página
- [ ] Extensión: 5-7 páginas (sin incluir anexos de evidencias)

### ✅ Exactitud
- [ ] Nombres de módulos, endpoints, roles coinciden con código real
- [ ] Errores HTTP codes correctos (201 Create, 422 Validation, 404 Not Found)
- [ ] Fechas de ejecución son reales (no ficticio)
- [ ] Severidades de bugs justificadas con impacto real

---

## 9. TEMPLATE FINAL MÍNIMO (Estructura de Páginas)

```
Página 1: Portada
Página 2: Resumen Ejecutivo + Línea Base del Ambiente
Página 3-4: Bitácora de Ejecución (tabla principal)
Página 4-5: Registro de Bugs & Ciclo de Vida (2-3 bugs expandidos)
Página 5: Cuadro Estadístico + Gráficos
Página 6-7: Análisis, Trazabilidad y Lecciones

ANEXOS (Si la extensión lo permite):
- Anexo A: Evidencias (capturas, logs)
- Anexo B: Postman collection export
- Anexo C: Matriz de trazabilidad completa (90 casos)
```

---

## 10. CONTACTOS Y REFERENCIAS

**Docente:** Ing. Anthony Abrahan Pachay Espinoza  
**Fecha de entrega:** [Definida por cátedra]  
**Formato:** PDF + DOCX + Carpeta de evidencias (ZIP)  

**Plan de Calidad referencia:** `docs/Plan de calidad/Plan-de-Calidad.md` (90 casos organizados por módulo)

---

## NOTAS FINALES
⚠️ **Importante:** La presencia de defectos **NO** penaliza la nota. Se evalúa la **capacidad de detectar, documentar y gestionar** defectos con rigor ingenieril.

✅ **Transparencia es fortaleza:** Mostrar que encontraron bugs, registraron root causes, y los corrigieron demuestra competencia.

🎯 **Objetivo real:** Demostrar que el sistema está **listo para producción** o identificar **reservas técnicas** con precisión.

---

*Generado el: 2026-07-08*  
*Autor: Claude Code*
