# 📋 Pasos Prácticos — Cómo Rellenar ActividadGrupal_E6AECES.docx

**Objetivo**: Transformar la guía analítica GUIA_E6_COMPLETAR.md → Word con capturas, evidencias, formato oficial UPSE.

**Tiempo estimado**: 4-5 horas (división de trabajo recomendada)

---

## PASO 1: Preparar Evidencias Visuales (45 min)

### 1.1 Capturas de Herramientas de Análisis

**Quién**: Integrante de Backend (Andy)

**Qué capturar**:

```bash
# Terminal 1: Composer audit
cd backend/
composer audit

# Captura: Pantalla con "0 vulnerabilities" output (si existe)
# Si no hay comando, usar: composer show | head -20
```

**Capturas necesarias** (total 4-5):
1. ✅ `composer audit` output (o `composer show` si audit no está)
2. ✅ `npm audit` output (frontend)
3. ✅ `docker-compose ps` mostrando 4 servicios running
4. ✅ `docker-compose logs db | grep "ready"` (DB healthy)
5. ✅ Navegador: `http://localhost:8000/api/health` (si existe endpoint)

**Cómo guardar**:
```bash
# Terminal screenshot tools
gnome-screenshot  # Linux
# O: Alt+PrintScreen (ventana actual)
# Guardar en: docs/Entregables/E6/capturas/
```

---

### 1.2 Capturas de Base de Datos

**Quién**: Integrante de BD (Yandris)

**Qué capturar**:

```bash
# Terminal: Acceder a psql
docker-compose exec db psql -U user -d incidencias_db

# Comando 1: Ver migraciones
\dt  # Muestra todas las tablas

# Comando 2: Ver constraints
SELECT constraint_name, constraint_type, table_name 
FROM information_schema.table_constraints 
WHERE table_schema = 'public' 
LIMIT 20;

# Comando 3: Ver índices
SELECT tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
LIMIT 15;

# Comando 4: Verificar PostGIS
SELECT PostGIS_version();
```

**Capturas necesarias** (total 3-4):
1. ✅ `\dt` output mostrando 15+ tablas
2. ✅ Constraints query resultado (20+ filas)
3. ✅ Índices query resultado
4. ✅ PostGIS_version() output (prueba que PostGIS está habilitado)

---

### 1.3 Capturas del Código Fuente

**Quién**: Integrante Frontend (Alisson)

**Qué capturar** (usar VS Code):

1. **Validación Frontend (XSS Prevention)**:
   ```
   Archivo: frontend/app/utils/format.js (líneas 21-26)
   Captura: función escapeHtml() completa
   ```

2. **Validación Backend (Email)**:
   ```
   Archivo: backend/app/Domains/Auth/Local/Http/Requests/LoginRequest.php (líneas 14-18)
   Captura: método rules() mostrando validación 'email'
   ```

3. **Hashing Contraseña**:
   ```
   Archivo: backend/app/Domains/Auth/Local/Http/Requests/RegisterRequest.php (líneas 26-33)
   Captura: regex password validation
   ```

4. **Rate Limiting Config** (si existe):
   ```
   Archivo: backend/app/Http/Middleware/ThrottleRequests.php
   Captura: middleware config
   ```

5. **Security Headers** (si se agrega):
   ```
   Archivo: docker-compose.yml o nginx.conf
   Captura: headers configuration
   ```

**Total capturas código**: 5-6 (pequeñas, inline)

---

## PASO 2: Estructurar Documento Word (1 hora)

**Quién**: Cualquiera

### 2.1 Plantilla de Portada

Copiar esta estructura al inicio del .docx:

```
═══════════════════════════════════════════════════════════════
UNIVERSIDAD ESTATAL PENÍNSULA DE SANTA ELENA
FACULTAD DE SISTEMAS Y TELECOMUNICACIONES
CARRERA DE INGENIERÍA EN SOFTWARE

ENTREGABLE 6: ANÁLISIS ESTÁTICO DEL CÓDIGO Y EVALUACIÓN DE SEGURIDAD

Asignatura: Calidad de Software
Profesores: Ing. Anthony Abrahan Pachay Espinoza
Estudiantes: 
  - Andy Bryan Alejandro Vera
  - Alisson Yamel Reyes Ricardo
  - Yandris Miguel Rivera Torres

Curso: Software 6/1
Fecha: 2026-07-14
La Libertad – Ecuador
═══════════════════════════════════════════════════════════════
```

### 2.2 Tabla de Contenidos

```
1. LÍNEA BASE Y TOOLKIT DE ANÁLISIS
2. RADIOGRAFÍA DE CALIDAD INTERNA & DEUDA TÉCNICA
3. DIAGNÓSTICO DE MANTENIBILIDAD Y COMPLEJIDAD
4. AUDITORÍA DE SEGURIDAD OWASP TOP 10
5. GESTIÓN DE DEPENDENCIAS INSEGURAS
6. CATÁLOGO DE HALLAZGOS Y REFACTORIZACIÓN
7. CONCLUSIONES — ISO/IEC 25010 Y APTITUD PARA CARGA
8. ANEXOS Y EVIDENCIAS
```

---

## PASO 3: Copiar Contenido de GUIA_E6_COMPLETAR.md (1.5 horas)

**Quién**: Cualquiera (trabajo distribuido)

### 3.1 División de trabajo sugerida:

| Sección | Responsable | Tiempo |
|---|---|---|
| Sección 1 (Toolkit) | Andy (Backend) | 15 min |
| Sección 2 (Métricas) | Yandris (BD) | 20 min |
| Sección 3 (Modularidad) | Andy (Backend) | 15 min |
| Sección 4 (OWASP) | Alisson (Frontend) | 30 min |
| Sección 5 (Dependencias) | Andy (Backend) | 15 min |
| Sección 6 (Hallazgos) | Yandris (BD) | 20 min |
| Sección 7 (ISO/IEC) | Alisson (Frontend) | 15 min |

### 3.2 Formato Word recomendado:

- **Títulos H1**: Calibri 16pt Bold, azul (#0066CC)
- **Títulos H2**: Calibri 14pt Bold, negro
- **Párrafos**: Calibri 11pt, interlineado 1.5
- **Tablas**: Bordes negros 1pt, encabezados gris (#E8E8E8)
- **Códigos**: Courier New 10pt, fondo gris (#F5F5F5)
- **Márgenes**: 2.5cm (estándar UPSE)

---

## PASO 4: Insertar Evidencias Visuales (1 hora)

**Quién**: Responsable de cada sección

### 4.1 Sección 1 (Toolkit) — Agregar:
- ✅ Captura de `composer show` (versión Laravel, dependencias)
- ✅ Captura de `npm audit` output
- ✅ Captura de `docker-compose ps` (4 servicios running)

**Posición en Word**: Después de párrafo "Configuración de Stack Técnico..."

### 4.2 Sección 2 (Métricas) — Agregar:
- ✅ Captura de DB schema (`\dt` en psql)
- ✅ Captura de constraints query
- ✅ Captura de índices query

**Posición**: Después de tabla "Métricas de Software Cuantificadas"

### 4.3 Sección 4 (OWASP) — Agregar:
- ✅ Código escapeHtml() de frontend (líneas 21-26)
- ✅ Código login validation backend (líneas 14-18)
- ✅ Código password regex (líneas 26-33)
- ✅ Captura Mercure secret fallback (línea 206 AuthController)

**Posición**: Dentro de cada categoría OWASP (A03, A05, etc.)

### 4.4 Sección 5 (Dependencias) — Agregar:
- ✅ Tabla con versiones (copiar de análisis)
- ✅ Captura de CVE scan results (0 vulnerabilidades)

**Posición**: Después de tabla "Auditoría de Dependencias"

### 4.5 Sección 7 (ISO/IEC) — Agregar:
- ✅ Tabla ISO/IEC 25010 ratings
- ✅ Captura de logs (si hay ejecución)

**Posición**: Después de "Conclusiones" principales

---

## PASO 5: Validar Checklist Pre-Entrega (30 min)

**Quién**: Cualquiera (revisor final)

Ejecutar esta checklist EN EL WORD:

```
DOCUMENTO WORD — VALIDACIÓN FINAL
═════════════════════════════════════════════════════

CONTENIDO:
☐ Portada con datos de equipo + fecha
☐ Tabla de contenidos automática (Insert → TOC)
☐ Sección 1 completa (toolkit + stack + justificación)
☐ Sección 2 completa (métricas cuantificadas + tabla)
☐ Sección 3 completa (modularidad + complejidad + recomendaciones)
☐ Sección 4 completa (OWASP A01-A10 individual + recomendaciones)
☐ Sección 5 completa (inventario dependencias + CVE results)
☐ Sección 6 completa (matriz hallazgos 9 items × severity)
☐ Sección 7 completa (ISO/IEC 25010 + dictamen final)
☐ Anexos (archivos analizados, comandos, referencias)

EVIDENCIAS VISUALES:
☐ ≥4 capturas herramientas (composer, npm, docker, logs)
☐ ≥3 capturas base de datos (schema, constraints, índices)
☐ ≥5 snippets código (escapeHtml, validation, hashing, etc.)
☐ ≥1 evidencia OWASP (código vulnerable vs secure)
☐ ≥1 tabla resumen (ISO/IEC ratings o matriz hallazgos)

FORMATO:
☐ Portada centrada + datos equipo correctos
☐ Márgenes 2.5cm en todas páginas
☐ Títulos H1 formato azul 16pt Bold
☐ Títulos H2 formato negro 14pt Bold
☐ Párrafos Calibri 11pt, interlineado 1.5
☐ Tablas con bordes + encabezados sombreados
☐ Códigos en Courier New 10pt fondo gris
☐ Numeración de página (Insert → Page Number)
☐ Pies de página: "Entregable 6 — Análisis de Código"

REDACCIÓN:
☐ Sin faltas ortográficas (Revisar → Ortografía)
☐ Sin frases coloquiales (lenguaje técnico formal)
☐ Cada hallazgo tiene: Descripción + Evidencia + Recomendación
☐ Tablas tienen encabezados descriptivos
☐ Capturas tienen pie de foto explicativo

EXTENSIÓN:
☐ Mínimo 5 páginas (máximo 7)
☐ Máximo 8 capturas (no exceso visual)

FECHA Y FIRMA:
☐ Fecha análisis: 2026-07-14
☐ Responsable análisis: [Nombres equipo]
☐ Docente revisor: Ing. Anthony Abrahan Pachay Espinoza
```

---

## PASO 6: Exportar y Entregar (15 min)

**Quién**: Cualquiera

### 6.1 Exportar PDF (como backup):
```
Word → File → Export as PDF
Guardar: docs/Entregables/E6/ActividadGrupal_E6AECES.pdf
```

### 6.2 Verificar compatibilidad:
```
# Abrir en LibreOffice/Google Docs para verificar formato
libreoffice docs/Entregables/E6/ActividadGrupal_E6AECES.docx
```

### 6.3 Guardar final:
```
Archivo: docs/Entregables/E6/ActividadGrupal_E6AECES.docx
Tamaño esperado: 2-4 MB (con imágenes embebidas)
```

---

## 🎯 PUNTOS CRÍTICOS (No olvidar)

1. **OWASP Individual**: Cada categoría A01-A10 debe tener:
   - ¿Existe el riesgo? (Sí/No/Parcial)
   - Evidencia de código
   - Vulnerabilidades detectadas
   - Recomendación

2. **Hallazgos con Esfuerzo**: Cada hallazgo debe indicar:
   - Severidad (CRÍTICO / ALTO / MEDIO / BAJO)
   - Archivo + línea exacta
   - Refactorización propuesta
   - Horas estimadas

3. **Capturas Relevantes**: Mínimo 10-12 imágenes con pie de foto:
   - Qué muestra
   - Por qué es importante para E6
   - Archivo/línea si código

4. **ISO/IEC 25010**: Rating 1-5 estrellas para cada característica:
   - Funcionalidad
   - Confiabilidad
   - Usabilidad
   - Rendimiento
   - Seguridad
   - Mantenibilidad
   - Portabilidad
   - Compatibilidad

5. **Dictamen Final**: Debe concluir con:
   - ✅/🟡/❌ APTO PARA PRODUCCIÓN
   - Críticos pre-release (qué se debe hacer ANTES de ir a prod)
   - Phase 2 items (mejoras futuras)

---

## 📞 SOPORTE RÁPIDO

**Si tienes duda sobre...**:

| Duda | Respuesta Rápida |
|---|---|
| "¿Dónde pongo la captura de composer audit?" | Sección 1, después de "Configuración Stack" + Sección 5 |
| "¿Cuántas páginas debe tener?" | 5-7 (máximo UPSE); conteo automático en Word (Insert → Page Count) |
| "¿Qué capturas son obligatorias?" | Mín 4 herramientas + 3 BD + 5 código = 12 imágenes |
| "¿Cómo sé si OWASP está completo?" | Checklist: A01-A10 × (riesgo?+evidencia+recomendación) = 30 items |
| "¿Uso template UPSE official?" | Sí; ver Google Drive compartida de asignaturas (si existe) o usa formato sugerido aquí |

---

## ⏱️ TIMELINE RECOMENDADO

| Fase | Responsable | Cuando | Duración |
|---|---|---|---|
| **Paso 1** | Andy + Yandris + Alisson | HOY 14:00 | 45 min |
| **Paso 2** | Alisson | HOY 15:00 | 1h |
| **Paso 3** | Todos (distribuido) | HOY 16:00 | 1.5h |
| **Paso 4** | Todos (secciones) | HOY 17:30 | 1h |
| **Paso 5** | Revisor final | HOY 18:30 | 30 min |
| **Paso 6** | Cualquiera | HOY 19:00 | 15 min |
| **ENTREGA** | — | **HOY 19:15** | — |

**Total**: ~5 horas trabajo paralelo (= ~2 horas real si trabajan 3 personas simultaneando)

---

**¡Éxito en la entrega!** 🎓

Usa GUIA_E6_COMPLETAR.md como fuente; estos pasos son solo estructuración + evidencias visuales.

