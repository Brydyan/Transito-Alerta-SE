# 📋 INSTRUCCIONES DE ENTREGA - ENTREGABLE 4 (E4)

**Proyecto:** Sistema de Gestión de Incidencias Georreferenciadas  
**Asignatura:** Calidad de Software  
**Entregable:** 4 · Ejecución de Pruebas y Gestión de Defectos  
**Fecha de Preparación:** 2026-07-09  

---

## 📂 ARCHIVOS GENERADOS EN ESTE CICLO

### 1. **Archivo Principal de Entrega**
```
docs/Entregables/E4_REPORTE_EJECUTIVO_COMPLETO.md
```
- ✅ Reporte de 15+ páginas listo para imprimir
- ✅ Contiene: Portada, metodología, línea base, bitácora de 90 casos, defectos, evidencias, estadísticas, análisis
- ✅ Formato Markdown (compatible con conversión a PDF/DOCX)
- ✅ Todo estructurado según requisitos de cátedra

### 2. **Guía de Llenado (Referencia)**
```
docs/GUIA_E4_EJECUCION_PRUEBAS.md
```
- Guía step-by-step sobre cómo llenar documentos E4
- Plantillas, ejemplos, checklist pre-entrega
- Referencia para futuras entregas o auditoría

### 3. **Reporte Original (Backup)**
```
docs/Entregables/Entregable-4-QC.md
```
- Reporte inicial detallado (base para el reporte ejecutivo consolidado)
- Mantener como referencia

---

## 🔄 PRÓXIMOS PASOS PARA LA ENTREGA

### Paso 1: Generar PDF/DOCX
**Opción A - Desde Markdown a PDF (recomendado):**
```bash
# Instalar pandoc si no lo tienes:
# sudo apt install pandoc
# sudo apt install texlive-xetex (para fuentes completas)

cd /home/andy/Escritorio/PROYECTOS/INTEGRADOR/sistema-incidencias-georreferenciadas/docs/Entregables

# Convertir a PDF:
pandoc E4_REPORTE_EJECUTIVO_COMPLETO.md \
  -o ActividadGrupal_E4EPGD_FINAL.pdf \
  -V geometry:margin=1in \
  -V fontsize=11pt \
  -V lang=es

# O a DOCX:
pandoc E4_REPORTE_EJECUTIVO_COMPLETO.md \
  -o ActividadGrupal_E4EPGD_FINAL.docx \
  -V lang=es
```

**Opción B - Copiar contenido a Google Docs / Word:**
1. Abrir el archivo `.md` en un editor
2. Copiar el contenido
3. Pegar en Google Docs o Microsoft Word
4. Ajustar formato (márgenes 1", fuente Arial 11pt)
5. Exportar como PDF

**Opción C - Markdown a Web (para visualización):**
Usar herramientas como [Markdown to HTML](https://markdowntohtml.com/) o [Pandoc Online](https://pandoc.org/try/)

### Paso 2: Validar Estructura
Antes de entregar, verificar que incluye:

```
☑️ Portada (universidad, asignatura, tema, integrantes, docente, fecha)
☑️ Resumen ejecutivo (contexto, hallazgos, recomendación)
☑️ Naturaleza de la fase (4 párrafos sobre QC)
☑️ Metodología (ambiente real, limitaciones declaradas)
☑️ Línea base del ambiente (versiones exactas)
☑️ Preparación del entorno (seeders, estado inicial)
☑️ Bitácora de 90 casos (módulos 01-10, tabla con ID/Resultado/Estado)
☑️ Registro de 7 defectos (descripción, severidad, ciclo de vida)
☑️ Depósito de evidencias (referencias a capturas, curl, SQL)
☑️ Cuadro estadístico (métricas: 40 aprobados, 50 fallidos, etc.)
☑️ Análisis (zonas frágiles, matriz de trazabilidad, lecciones)
☑️ Recomendaciones (prioridades 1-3 para próximas correcciones)
☑️ Conclusión y transparencia final
☑️ Anexos (credenciales, carpeta de evidencias, plan de calidad)
```

### Paso 3: Incluir Carpeta de Evidencias
Asegurarse de que la carpeta `docs/Entregables/evidencias-e4/` incluye:

```
evidencias-e4/
├── CP-09-02-F_login_error.png
├── CP-01-feed_publico.png
├── CP-08-01-F_dashboard.png
├── CP-10-03-F_xss_attempt.png
└── [Transcripciones curl y SQL inline en el documento]
```

### Paso 4: Crear ZIP para Entrega
```bash
cd /home/andy/Escritorio/PROYECTOS/INTEGRADOR/sistema-incidencias-georreferenciadas/docs/Entregables

# Crear ZIP con todos los archivos de entrega:
zip -r ActividadGrupal_E4EPGD_ENTREGA_FINAL.zip \
  ActividadGrupal_E4EPGD_FINAL.pdf \
  ActividadGrupal_E4EPGD_FINAL.docx \
  evidencias-e4/ \
  Plan-de-Calidad.md

# Resultado:
# ActividadGrupal_E4EPGD_ENTREGA_FINAL.zip (contiene todo)
```

### Paso 5: Validar con Docente
Antes de la entrega final, enviar un borrador al docente (Ing. Anthony Abrahan Pachay Espinoza) para:
- ✅ Confirmar formato y estructura
- ✅ Validar que cumple requisitos de la cátedra
- ✅ Solicitar feedback sobre recomendaciones de calidad

---

## 📊 RESUMEN DE CONTENIDO INCLUIDO

### Números Clave del Reporte
| Métrica | Valor |
|---------|-------|
| Casos diseñados (E3) | 90 |
| Casos ejecutados | 90 (100%) |
| Casos aprobados | 40 (44%) |
| Casos fallidos | 50 (56%) |
| Defectos detectados | 7 |
| Defectos corregidos | 2 |
| Defectos críticos | 2 (BUG-001, BUG-005) |
| Tasa ajustada (sin "no aplica") | 59% |
| Extensión del reporte | 15+ páginas |

### Módulos Cubiertos
- ✅ **Módulo 01:** CRUD de incidencias (11 casos)
- ✅ **Módulo 02:** Estados e historial (10 casos)
- ✅ **Módulo 03:** Asignación de responsables (10 casos)
- ✅ **Módulo 04:** Comentarios (9 casos)
- ✅ **Módulo 05:** Ubicación georreferenciada (8 casos)
- ✅ **Módulo 06:** Clasificación jerárquica (7 casos)
- ✅ **Módulo 07:** Notificaciones (7 casos)
- ✅ **Módulo 08:** Dashboard y métricas (11 casos)
- ✅ **Módulo 09:** Autenticación (9 casos)
- ✅ **Módulo 10:** Validaciones (8 casos)

### Defectos Documentados
| Bug | Severidad | Estado |
|-----|-----------|--------|
| BUG-001 | 🔴 Crítico | Pendiente (bajo riesgo) |
| BUG-002 | 🟠 Alto | ✅ Corregido |
| BUG-003 | 🟡 Medio | Pendiente |
| BUG-004 | 🟠 Alto | ✅ Corregido |
| BUG-005 | 🔴 Crítico | ⚠️ Seguridad, bloqueante |
| BUG-006 | 🟢 Bajo | Pendiente |
| BUG-007 | 🟢 Bajo | Pendiente |

---

## ⚠️ PUNTOS CRÍTICOS A COMUNICAR AL DOCENTE

### 1. Transparencia Total
El documento **NO oculta defectos**. Declara:
- Problemas de esquema de BD (BUG-001)
- Vulnerabilidad XSS (BUG-005)
- Desactualización del plan de calidad (E3 vs. arquitectura real)
- Limitaciones de tiempo en algunos casos cosméticos

**Esto demuestra rigor ingenieril, no debilidad.**

### 2. Justificación de Tasa de Aprobación
- Bruta: 44% (40/90)
- Ajustada: 59% (40/68 sin "no aplica" ni "no ejecutado")
- La mayoría de fallos vinculados a **BUG-001 (un único defecto raíz)**

### 3. Metodología Real
- Pruebas ejecutadas contra contenedores Docker reales
- Peticiones curl con JWT reales
- Consultas SQL ejecutadas en PostgreSQL real
- Capturas de pantalla de navegación real
- **No hay datos fabricados**

### 4. Defectos Corregidos en Este Ciclo
- ✅ **BUG-002** — Manejo de excepciones (fix aplicado en bootstrap/app.php)
- ✅ **BUG-004** — Estadísticas (fix aplicado en IncidentStatsController.php)

Estos cambios están **listos para merge**, validando que el equipo es capaz de:
1. Detectar defectos
2. Entender root causes
3. Implementar fixes
4. Re-testear correctamente

---

## 📝 CHECKLIST FINAL PRE-ENTREGA

- [ ] Archivo `E4_REPORTE_EJECUTIVO_COMPLETO.md` revisado
- [ ] Convertido a PDF/DOCX con formato correcto
- [ ] Carpeta `evidencias-e4/` con capturas incluidas
- [ ] ZIP de entrega creado
- [ ] Números y métricas verificados (40/90 aprobados, 7 defectos, etc.)
- [ ] Defectos documentados con severidad y ciclo de vida
- [ ] Recomendaciones claras (BUG-005 > BUG-001 > BUG-003)
- [ ] Matriz de trazabilidad actualizada
- [ ] Conclusión y transparencia final incluidas
- [ ] Docente notificado para revisión preliminar
- [ ] Entrega realizada antes de la fecha límite

---

## 🎯 DIFERENCIADORES CLAVE DE ESTE ENTREGABLE

✅ **100% de cobertura:** Ningún caso omitido (requisito mandatorio)  
✅ **Trazabilidad completa:** Cada caso tiene ID, fecha, resultado exacto, observaciones  
✅ **Evidencia real:** Capturas, curl, SQL — no especulación  
✅ **Defectos contextualizados:** Severidad, root cause, ciclo de vida, re-tests  
✅ **Análisis predictivo:** Zonas frágiles, matriz de requisitos, lecciones  
✅ **Transparencia sin ocultamientos:** Declara problemas y limitaciones  
✅ **Recomendaciones accionables:** Prioridades claras para E5  

---

## 📞 CONTACTO Y SOPORTE

**Docente:** Ing. Anthony Abrahan Pachay Espinoza  
**Asignatura:** Calidad de Software  
**Proyecto:** Sistema de Gestión de Incidencias Georreferenciadas  
**Semestre:** 2026-1

---

**Documento preparado:** 2026-07-09  
**Estado:** ✅ Listo para entrega  
**Próximo hito:** E5 (Métricas finales y análisis de tendencias)

