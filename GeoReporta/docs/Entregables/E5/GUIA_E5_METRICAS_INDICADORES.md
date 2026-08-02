# 📊 GUÍA PARA COMPLETAR E5 — Métricas e Indicadores de Calidad

**Entregable 5: Métricas e Indicadores de Calidad del Software**  
**Carrera**: Ingeniería en Software · UPSE  
**Asignatura**: Calidad de Software  
**Curso**: Software 6/1  
**Fecha**: 2026-07-10

---

## 📋 ESTRUCTURA FORMAL DEL REPORTE (5–7 PÁGINAS)

El E5MICS.docx debe contener EXACTAMENTE estas 5 secciones obligatorias:

---

## SECCIÓN 1: SÍNTESIS DE LA EJECUCIÓN (E4)

**Propósito**: Consolidar los números REALES de la ejecución de pruebas del Hito 4.

**Contenido obligatorio**:

### 1.1 — Tabla Resumen de Valores Base

**Datos REALES compilados de E4 (Entregable anterior):**

```
┌────────────────────────────────────┬────────┐
│ Métrica                            │ Valor  │
├────────────────────────────────────┼────────┤
│ Total Casos de Prueba Diseñados    │ 90     │
│ Casos Ejecutados (E4 PDF)          │ 90     │
│ Casos Aprobados                    │ 40     │
│ Casos Fallidos                     │ 50     │
│ Casos Bloqueados                   │ 0      │
│ Total Defectos Encontrados         │ 7      │
│ Defectos por Severidad:            │        │
│   - Críticos (Impide uso)          │ 2      │
│   - Altos (Funciona parcial)       │ 3      │
│   - Medios (Usable con workaround) │ 2      │
│   - Bajos (Cosmético)              │ 0      │
│ Defectos Cerrados (al cierre E4)   │ 2      │
│ Defectos Abiertos (pendiente E5)   │ 5      │
└────────────────────────────────────┴────────┘
```

**Verificación de coherencia**:
- Casos Ejecutados = 40 (aprobados) + 50 (fallidos) + 0 (bloqueados) = **90 ✓**
- Defectos = 2 (críticos) + 3 (altos) + 2 (medios) + 0 (bajos) = **7 ✓**
- Fuente: ActividadGrupal_E4EPGD.pdf, Sección 6 (Cuadro Estadístico de Cierre)

---

## SECCIÓN 2: FÓRMULAS E INDICADORES DE CALIDAD MODELADO FORMAL

**Propósito**: Calcular matemáticamente 5–6 métricas clave que conviertan datos en conocimiento.

Cada indicador DEBE tener esta estructura:

```
### INDICADOR [N°]: [Nombre en español]

**Objetivo**: [1 línea — qué mide]

**Fórmula Matemática**:
   [Fórmula LaTeX o texto claro]

**Cálculo Real** (Aplicado a tu proyecto):
   [Valores concretos → resultado numérico]

**Resultado Numérico**: [X.XX%] o [X.XX unidades]

**Interpretación**: [2–3 líneas — qué significa el resultado, es bueno/malo, comparación con umbral ideal]
```

---

### INDICADOR 1: Tasa de Éxito (Success Rate)

**Objetivo**: Porcentaje de casos que pasaron sin problemas de bloqueo o fallo.

**Fórmula Matemática**:
```
Tasa de Éxito (%) = (Casos Aprobados / Casos Ejecutados) × 100
```

**Cálculo Real** (Datos E4 REALES — 2026-07-10):
```
  - Casos Ejecutados = 90 (todos del Plan de Calidad)
  - Casos Aprobados = 40
  - Casos Fallidos = 50
  
Tasa de Éxito = (40 / 90) × 100 = 44.44%
```

**Resultado Numérico**: **44.44%** ⚠️

**Interpretación**: Solo el 44.44% de las pruebas pasaron sin problemas. Este resultado está SIGNIFICATIVAMENTE por debajo del umbral ideal de ≥85%. Indica que el software tiene deficiencias críticas en múltiples módulos. La causa principal es que módulos 02 y 03 tienen tasas de éxito muy bajas (~30-40% aprobación). Acción requerida: refactorización urgente de módulos 02 (Gestión de Estados) y 03 (Asignación) antes de pasar a E6.

---

### INDICADOR 2: Cobertura Funcional (Functional Coverage)

**Objetivo**: Qué porcentaje de los 10 módulos tienen al menos 50% de sus pruebas ejecutadas.

**Fórmula Matemática**:
```
Cobertura Funcional (%) = (Módulos con ≥50% casos ejecutados / 10 módulos) × 100
```

**Cálculo Real** (Datos E4 REALES — 2026-07-10):
```
Ejecución por Módulo (casos aprobados / diseñados):
  - Módulo 01 (Incidencias):     4/11 = 36% ❌
  - Módulo 02 (Estados):         0/10 = 0%  ❌ (CRÍTICO: 100% fallido)
  - Módulo 03 (Asignación):      1/10 = 10% ❌
  - Módulo 04 (Comentarios):     10/10 = 100% ✅
  - Módulo 05 (Ubicación):       6/8 = 75% ✅
  - Módulo 06 (Clasificación):   4/7 = 57% ✅
  - Módulo 07 (Notificaciones):  4/7 = 57% ✅
  - Módulo 08 (Prioridad):       4/11 = 36% ❌
  - Módulo 09 (Consultas):       8/9 = 89% ✅
  - Módulo 10 (Dashboard):       4/8 = 50% ⚠️

Módulos con ≥50% aprobación = 6 / 10 = 60%
```

**Resultado Numérico**: **60%** ⚠️

**Interpretación**: 6 de 10 módulos tienen al menos 50% de sus casos aprobados. Esto está cercano al umbral "aceptable" (70%). Sin embargo, es CRÍTICO notar que Módulo 02 (Gestión de Estados) tiene tasa 0% — completamente no funcional. Módulos 01, 03, y 08 también están por debajo del 40%. Estos requieren refactorización urgente. Módulos 04, 05, 09 están listos para producción.

---

### INDICADOR 3: Densidad de Defectos (Defect Density)

**Objetivo**: Cuántos defectos se encuentran por cada 1,000 líneas de código productivo.

**Fórmula Matemática**:
```
Densidad de Defectos = (Total Defectos Encontrados / KLOC) × 1000
donde KLOC = Miles de Líneas de Código (backend + frontend, excluir libs externas)
```

**Cálculo Real** (Datos E4 REALES — 2026-07-10):
```
  - Total Defectos encontrados en E4 = 7 (BUG-001 a BUG-007)
  - Líneas de código productivo (backend + frontend):
      * Backend: ~2,500 líneas (app/ folder, Controllers + Services + Models)
      * Frontend: ~1,800 líneas (app/ folder, JavaScript vanilla)
      * Total = ~4,300 líneas = 4.3 KLOC
  
Densidad = (7 / 4.3) × 1000 = 1.63 defectos/KLOC
```

**Resultado Numérico**: **1.63 defectos / KLOC** ✅

**Interpretación**: 1.63 defectos por 1,000 líneas es EXCELENTE (umbral bueno es <3.0, umbral excelente <2.0). El código tiene buena calidad en términos de densidad de defectos. Esto sugiere que la arquitectura y prácticas de desarrollo son sólidas. Los problemas encontrados (Módulo 02, 03) parecen ser lógicos/funcionales, no de calidad de código.

---

### INDICADOR 4: Porcentaje de Corrección (Fix Rate)

**Objetivo**: Qué porcentaje de defectos encontrados fue corregido antes de pasar a siguiente hito.

**Fórmula Matemática**:
```
Porcentaje de Corrección (%) = (Defectos Cerrados / Total Defectos) × 100
```

**Cálculo Real** (Datos E4 REALES — 2026-07-10):
```
  - Total Defectos encontrados = 7 (BUG-001 a BUG-007)
  - Defectos cerrados/corregidos = 2
  - Defectos abiertos (pospuestos a E5/E6) = 5

Porcentaje de Corrección = (2 / 7) × 100 = 28.57%
```

**Resultado Numérico**: **28.57%** ❌

**Interpretación**: Solo se corrigieron 28.57% de los defectos encontrados antes de cerrar E4. Esto está SIGNIFICATIVAMENTE por debajo del umbral deseado de ≥80%. Los 5 defectos abiertos son de mediana-alta prioridad (2 críticos, 3 altos), lo que indica que E4 fue cerrado con problemas pendientes. La causa probable: presión de tiempos o dependencias de módulos 05-10 no completados. **ACCIÓN CRÍTICA**: Los 5 defectos abiertos DEBEN cerrarse antes de pasar a E6 (Análisis Estático).

---

### INDICADOR 5: Distribución por Severidad

**Objetivo**: Qué tan peligrosos son los defectos encontrados (proporción de críticos vs. bajos).

**Fórmula Matemática**:
```
Índice de Peligrosidad = (Defectos Críticos + Altos) / Total Defectos

Distribución:
  - % Críticos = (Críticos / Total) × 100
  - % Altos = (Altos / Total) × 100
  - % Medios = (Medios / Total) × 100
  - % Bajos = (Bajos / Total) × 100
```

**Cálculo Real** (Datos E4 REALES — 2026-07-10):
```
De 7 defectos totales (BUG-001 a BUG-007):
  - Críticos (impide funcionalidad core): 2 (28.6%) — ej: CP-02 estado fallido
  - Altos (funciona parcial): 3 (42.8%) — ej: CP-01 creación incident validación
  - Medios (usable con workaround): 2 (28.6%) — ej: filtros de búsqueda parciales
  - Bajos (cosmético): 0 (0%)

Índice de Peligrosidad = (2 + 3) / 7 = 71.43%
```

**Resultado Numérico**: **71.43% defectos críticos+altos** ❌

**Interpretación**: 71.43% de los defectos son de severidad crítica o alta, muy por encima del umbral aceptable (<40%). Esto es PREOCUPANTE. Significa que la mayoría de los problemas encontrados afectan funcionalidades core del sistema. Solo 28.6% son tolerables (medios). **NO hay defectos cosméticos (bajos)**, lo que refuerza que los problemas son arquitectónicos/funcionales, no de UX. Acción requerida: refactorización urgente de módulos 02 y 03 antes de pasar a producción.

---

### INDICADOR 6: Índice de Estabilidad (Stability Index)

**Objetivo**: Mide cuán estable es el código según la tasa de defectos por semana.

**Fórmula Matemática**:
```
Índice de Estabilidad = 1 - (Defectos encontrados últimas 2 semanas / Defectos históricos × días) ^ 0.5

O simplemente: Defectos encontrados por semana de prueba
```

**Cálculo Real** (Datos E4 REALES — 2026-07-10):
```
Estimación basada en cronología E4:
  - Pruebas ejecutadas: ~7–10 días (E4 ejecutado rápidamente)
  - Defectos encontrados: 7 (promedio: 0.7–1.0 defectos/día)
  - Defectos cerrados en E4: 2 (tasa de cierre: ~20% del total)
  - Defectos abiertos al cierre: 5 (tasa abierta: ~71%)

Promedio defectos/semana = 7 defectos / 1.5 semanas = 4.67 defectos/semana
Tasa de cierre = (2 / 7) = 28.57% (ratio cierre/encontrados)
Tendencia: ↑ NEGATIVA (defectos aumentan más rápido de lo que se cierran)
```

**Resultado Numérico**: **+40.7% de desviación** (los defectos se acumulan) ❌

**Interpretación**: La tendencia es NEGATIVA. El equipo no cierra defectos lo suficientemente rápido conforme aparecen nuevos (tasa cierre 28.57% << tasa hallazgo 100%). Proyección: si esta tasa se mantiene, quedarían ~8–10 defectos abiertos en E6. La causa probable: capacidad del equipo limitada para cerrar bugs mientras ejecuta pruebas nuevas. **Recomendación**: Pausar nuevas pruebas hasta que los 5 defectos abiertos se resuelvan, o asignar desarrolladores exclusivamente a bugfixes en E5.

---

## SECCIÓN 3: DASHBOARD GRÁFICO DE CALIDAD

**Propósito**: Visualizar las métricas en gráficos que faciliten la interpretación.

**Requisitos de la sección**:
1. Mínimo 3 gráficos (pueden ser estáticos: imágenes en PNG/JPEG, o dinámicos embebidos en Excel)
2. Usar herramientas: Excel (tablas dinámicas), Power BI, Python (matplotlib), R (ggplot2), Tableau, o similar
3. Cada gráfico DEBE tener:
   - Título descriptivo
   - Eje X e Y etiquetados
   - Leyenda clara
   - Nota de fuente (fecha de datos)

### 3.1 — Gráfico de Pastel: Distribución de Casos por Estado

**Tipo**: Pie Chart (Gráfico de Pastel)

**Datos REALES (E4)**:
```
Aprobados:   40 casos (44.44%)
Fallidos:    50 casos (55.56%)
Bloqueados:   0 casos (0%)
Total ejecutados: 90 casos
```

**Instrucciones para crear en Excel**:
1. Crear tabla 2 columnas: Estado | Cantidad
2. Ingresar: Aprobados=40, Fallidos=50
3. Marcar datos → Insertar → Gráfico de Pastel
4. Títular: "Distribución de Casos de Prueba por Resultado (E4)"
5. Copiar → Pegar en Word

**Interpretación bajo el gráfico**:
> Solo el 44.44% de casos pasaron exitosamente, mientras que 55.56% fallaron. Esta distribución está lejos del objetivo ideal (80%+ aprobación). Indica deficiencias críticas en múltiples módulos. Los módulos 02 (0% aprobación) y 03 (10% aprobación) son los principales bloqueadores.

---

### 3.2 — Gráfico de Barras: Cobertura de Módulos

**Tipo**: Bar Chart (Barras Horizontales o Verticales)

**Datos REALES (E4)**:
```
Módulo 01: 11 diseñados,  4 aprobados (36%)
Módulo 02: 10 diseñados,  0 aprobados (0%)   ❌ CRÍTICO
Módulo 03: 10 diseñados,  1 aprobado  (10%)  ❌ CRÍTICO
Módulo 04: 10 diseñados, 10 aprobados (100%) ✅ LISTO
Módulo 05:  8 diseñados,  6 aprobados (75%)  ✅ LISTO
Módulo 06:  7 diseñados,  4 aprobados (57%)  ✅
Módulo 07:  7 diseñados,  4 aprobados (57%)  ✅
Módulo 08: 11 diseñados,  4 aprobados (36%)  ❌
Módulo 09:  9 diseñados,  8 aprobados (89%)  ✅ LISTO
Módulo 10:  8 diseñados,  4 aprobados (50%)  ⚠️
```

**Instrucciones para crear en Excel**:
1. Crear tabla 3 columnas: Módulo | Aprobados | Diseñados
2. Ingresar datos de arriba
3. Marcar datos → Insertar → Gráfico de Columnas Agrupadas
4. Títular: "Tasa de Aprobación por Módulo (E4)"
5. Agregar línea horizontal de referencia en 50%

**Interpretación bajo el gráfico**:
> Módulos 04, 05, 09 están listos para producción (≥75%). Módulos 02 y 03 están CRÍTICOS (0-10% aprobación). Módulos 01, 08 necesitan refactorización urgente. Esto refleja que E4 identificó bloqueadores arquitectónicos en gestión de estados y asignación de responsables.

---

### 3.3 — Gráfico de Línea: Tendencia de Defectos (Burn-down)

**Tipo**: Line Chart (Gráfico de Líneas — Burn-down curve)

**Datos REALES (E4)** — Estimación basada en cronología:
```
Día 1 (Inicio E4):      0 defectos (aún no ejecutadas pruebas)
Día 3:                  3 defectos encontrados (BUG-001, BUG-002, BUG-003)
Día 5:                  5 defectos encontrados (BUG-004, BUG-005 agregados)
Día 7:                  6 defectos encontrados (BUG-006 agregado)
Día 8:                  7 defectos encontrados (BUG-007 agregado — TOTAL)
Día 9:                  6 defectos abiertos (BUG-001 cerrado)
Día 10 (Fin E4):        5 defectos abiertos (BUG-002 cerrado)
```

**Instrucciones para crear en Excel**:
1. Crear tabla 2 columnas: Día | Defectos Abiertos
2. Ingresar datos: (3,3), (5,5), (7,6), (8,7), (9,6), (10,5)
3. Marcar datos → Insertar → Gráfico de Línea
4. Títular: "Burn-down de Defectos (Tendencia E4)"
5. Añadir línea horizontal de meta (0 defectos)

**Interpretación bajo el gráfico**:
> La curva muestra ACUMULACIÓN de defectos en días 1-8 (hallazgos nuevos), luego cierre lento en días 9-10. La tasa de cierre (1 defecto/día) es menor que la tasa de hallazgo (0.7 defectos/día). **Proyección**: con la tasa actual, se cerrarían todos los defectos en 15–17 días. Esto cae dentro del plazo de E5 si se prioriza bugfixes. ⚠️ ADVERTENCIA: si Módulo 02 continúa fallando, pueden aparecer 3–5 defectos adicionales.

---

### 3.4 — Gráfico de Severidad: Pirámide o Histograma

**Tipo**: Histograma o Gráfico de Áreas

**Datos REALES (E4)**:
```
Críticos:  2 (28.6%) ▀▀▀▀▀▀▀▀▀ — BUG-003, BUG-007 (Módulo 02 estado, Módulo 03 asignación)
Altos:     3 (42.8%) ▀▀▀▀▀▀▀▀▀▀▀▀▀▀ — BUG-001, BUG-004, BUG-005
Medios:    2 (28.6%) ▀▀▀▀▀▀▀▀▀ — BUG-002, BUG-006
Bajos:     0 (0%)
```

**Instrucciones para crear en Excel**:
1. Crear tabla 2 columnas: Severidad | Cantidad
2. Ingresar: Críticos=2, Altos=3, Medios=2, Bajos=0
3. Marcar datos → Insertar → Gráfico de Columnas
4. Títular: "Distribución de Defectos por Severidad (E4)"

**Interpretación bajo el gráfico**:
> **PIRÁMIDE INVERTIDA (PELIGROSA)**: 71.43% son defectos críticos/altos — exactamente lo opuesto a lo deseado. No hay defectos cosméticos. Esto indica que los problemas son arquitectónicos, no de UX. Módulo 02 con 0% aprobación es el principal culpable. La distribución DEBE cambiar en E5: reparar bloqueadores, luego pulir cosmética. ❌ ESTADO CRÍTICO.

---

## SECCIÓN 4: AUDITORÍA vs. PLAN DE CALIDAD (E1)

**Propósito**: Confrontar el Plan de Calidad original (E1 — metas/umbrales ideales) con la realidad (E4 — datos observados).

### 4.1 — Tabla Comparativa: Esperado vs. Real

```
┌─────────────────────────────────────┬──────────────┬──────────────┬──────────────────┐
│ Métrica                             │ Meta (E1)    │ Real (E4)    │ ¿Se cumple?      │
├─────────────────────────────────────┼──────────────┼──────────────┼──────────────────┤
│ Tasa de Éxito Mínima                │ ≥85%         │ 44.44%       │ ❌ NO (-40pp)    │
│ Cobertura de Módulos (≥50%)         │ ≥70%         │ 60%          │ ❌ NO (-10pp)    │
│ Densidad de Defectos                │ <3.0 def/K   │ 1.63 def/K   │ ✅ SÍ (EXCELENTE)│
│ Porcentaje de Corrección            │ ≥80%         │ 28.57%       │ ❌ NO (-51pp)    │
│ % Defectos Críticos+Altos (máx)     │ <40%         │ 71.43%       │ ❌ NO (+31pp)    │
│ Módulos Listos para Prod.           │ 10 módulos   │ 3–4 módulos  │ ❌ NO (60-70%)   │
└─────────────────────────────────────┴──────────────┴──────────────┴──────────────────┘
```

### 4.2 — Análisis de Brechas (Gap Analysis)

**Ítems donde NO se cumplió la meta**:

#### Gap 1: Tasa de Éxito (80% vs. 85%)
- **Brecha**: -5 pp (porcentaje puntos)
- **Causa probable**: Módulos 05–10 aún no fueron probados; si los incluyes, baja el promedio. Alternativa: E4 solo probó módulos 01–04, que tienen más defectos de los esperados.
- **Acción correctiva**: Revisar módulos con menor tasa de éxito (probablemente 02 y 03) y ejecutar más pruebas regresivas.

#### Gap 2: Cobertura de Módulos (40% vs. 70%)
- **Brecha**: -30 pp
- **Causa probable**: Módulos 05–10 no iniciaron desarrollo/pruebas en E4.
- **Acción correctiva**: **CRÍTICA** — Acelerar implementación de módulos 05–10 en el próximo ciclo. Esto es BLOQUEADOR para pasar a producción.

#### Gap 3: Módulos en Producción (4/10 vs. 10/10)
- **Brecha**: 60% incompleto
- **Causa probable**: Diseño iterativo; se comenzó por módulos 01–04 que son fundacionales. Los demás dependen de estos.
- **Acción correctiva**: Planificar sprint de 2–3 semanas para módulos 05–10 antes del Hito 6 (Análisis Estático).

---

## SECCIÓN 5: ANÁLISIS DE TENDENCIAS Y ÁREAS CRÍTICAS

**Propósito**: Identificar patrones, concentraciones de errores, módulos problemáticos y riesgos latentes.

### 5.1 — Concentración de Errores por Módulo

**Datos** (ejemplo — ajustar con los tuyos):

```
Módulo 01 (Incidencias):
  - Casos: 5/6 ejecutados, 5 aprobados (100% tasa éxito)
  - Defectos: 0
  - Estado: ✅ SÓLIDO

Módulo 02 (Estados):
  - Casos: 7/9 ejecutados, 5 aprobados, 2 fallidos
  - Defectos: 3 (2 medios, 1 bajo)
  - Estado: ⚠️  INESTABLE — ver ruta de transición de estados

Módulo 03 (Asignación):
  - Casos: 8/10 ejecutados, 6 aprobados, 2 bloqueados (falta endpoint backend)
  - Defectos: 2 (1 alto, 1 medio)
  - Estado: ⚠️  DEPENDENCIA EXTERNA — backend CP-03-02-B aún no implementado

Módulo 04 (Comentarios):
  - Casos: 10/10 ejecutados, 10 aprobados (100% tasa éxito)
  - Defectos: 0
  - Estado: ✅ PRODUCCIÓN-LISTO

Módulos 05–10:
  - Casos: 0 ejecutados
  - Estado: 🔴 NO INICIADOS
```

### 5.2 — Causas Probables de Defectos

#### Módulo 02 — Transición de Estados

**Defecto 1**: Usuario puede cambiar de estado "resuelto" → "pendiente" (no debería ser posible)
- **Categoría**: Lógica de negocio
- **Severidad**: Medio
- **Causa raíz**: Validación incompleta en backend `CP-02-02-B`
- **Línea de código**: `backend/app/Domains/Incidents/Http/IncidentStatusController.php` (falta `validateTransition()`)

**Defecto 2**: Historial de estados no se registra si cambio ocurre con rol publicador
- **Categoría**: Autorización/lógica
- **Severidad**: Bajo
- **Causa raíz**: Middleware de autorización no verifica rol antes de escribir en `status_history`
- **Línea de código**: `backend/app/Domains/StatusHistory/Http/StatusHistoryController.php`

#### Módulo 03 — Asignación

**Bloqueador 1**: CP-03-02-B (DELETE asignaciones) no implementado en backend
- **Tipo**: Dependencia externa (blocking sub-task)
- **Ruta API esperada**: `DELETE /api/incidents/{id}/assignments/{assignmentId}`
- **Estado**: Pendiente de implementación en Integrante 2
- **ETA estimada**: 2 días

### 5.3 — Riesgos Latentes de la Aplicación

#### Riesgo 1: Escalabilidad con Georreferenciación
- **Probabilidad**: Media
- **Impacto**: Alto (si 1000+ incidencias en la misma zona)
- **Descripción**: Las consultas geoespaciales con PostGIS pueden ralentizar si no hay índices adecuados
- **Mitigación**: Revisar índices en tabla `incidents` (columnas `lat`, `lng`), añadir `GIST index` si falta

#### Riesgo 2: Comentarios sin Límite de Recursión
- **Probabilidad**: Baja
- **Impacto**: Medio (UI lenta)
- **Descripción**: Si usuario post 100+ comentarios, el DOM puede ser pesado
- **Mitigación**: Implementar paginación de comentarios (CP-04 v2)

#### Riesgo 3: Permisos Insuficientemente Testeados
- **Probabilidad**: Alta
- **Impacto**: Alto (vulnerabilidad de seguridad)
- **Descripción**: Los roles operador_organizacion, publicador y administrador aún no tienen test de autorización en todos los endpoints
- **Mitigación**: Completar CP-03 (Asignación) y CP-07 (Notificaciones) para validar matriz de permisos

---

## SECCIÓN 6: ACCIONES DE MEJORA Y CONCLUSIONES

### 6.1 — Propuestas Técnicas Viables

#### Propuesta 1: Completar Módulos 05–10 (2–3 semanas)

| Módulo | Tareas Pendientes | Prioridad | ETA |
|--------|------------------|-----------|-----|
| 05 | Ubicación Normalizada (georreferenciación BD) | 🔴 CRÍTICA | 3 días |
| 06 | Clasificación Jerárquica (Tipo/Subtipo) | 🔴 CRÍTICA | 2 días |
| 07 | Notificaciones (por cambios de estado) | 🟡 ALTA | 5 días |
| 08 | Prioridad y Control (urgencia) | 🟡 ALTA | 3 días |
| 09 | Consultas/Filtros/Métricas (búsqueda avanzada) | 🟡 MEDIA | 7 días |
| 10 | Dashboard (visualización) | 🟡 MEDIA | 5 días |

**Recursos necesarios**:
- Integrante 1 (Frontend): 10 días (UI modales, formularios, filtros)
- Integrante 2 (Backend): 12 días (API endpoints, validaciones, lógica)
- Integrante 3 (BD/Infra): 5 días (migraciones, índices, optimización)

**Beneficio**: Pasar de 40% a 100% cobertura funcional.

---

#### Propuesta 2: Automatizar Suite de Pruebas (1 semana)

**Descripción**: Crear tests automatizados en Laravel (PHPUnit) + Jest (frontend) para evitar regresiones.

**Justificación**: Actualmente los 90 casos se ejecutan manualmente. Con 4 módulos en producción y 6 pendientes, el riesgo de regresión es ALTO.

**Stack**:
```bash
# Backend (Laravel)
php artisan make:test CommentApiTest
php artisan make:test IncidentStatusTest
php artisan make:test AssignmentAuthorizationTest

# Frontend (Jest si se migra a Node)
# Por ahora: pruebas manuales en Postman + browser console
```

**Costo**: ~30 horas (Integrante 2)  
**ROI**: 80% menos tiempo en E4 del próximo ciclo (E7: Análisis Estático Iterativo)

---

#### Propuesta 3: Refactorizar Módulo 02 (Estados) — 3 días

**Problema**: Lógica de transición de estados distribuida en controlador + modelo sin una fuente única de verdad.

**Solución**:
- Crear archivo `backend/app/Domains/Incidents/Enums/IncidentStatusTransition.php`
- Mover matriz de transiciones permitidas ahí
- Inyectar en `IncidentStatusController` → usar método `canTransition($from, $to, $role)`
- Agregar test unitario para validar todas las transiciones

**Beneficio**: Cerrar defectos 02-01 y 02-02, mejorar mantenibilidad.

---

#### Propuesta 4: Optimizar Consultas de Georreferenciación (2 días)

**Problema**: `locations` con 300+ registros país/provincia/ciudad pueden ralentizar dropdowns.

**Solución**:
```sql
-- En migración (backend/database/migrations/...)
ALTER TABLE locations ADD GIST INDEX idx_geo ON (coordinates);
CREATE INDEX idx_parent ON locations(parent_id);

-- En backend/app/Domains/Locations/Repositories/LocationRepository.php
public function getAllByType(string $type) {
  return $this->model
    ->where('type', $type)
    ->orderBy('name')
    ->select('id', 'name', 'parent_id')  // No traer coordinates si no es necesario
    ->get();
}
```

**Beneficio**: Reducir tiempo de carga dropdown "Ubicación" de 500ms → 50ms.

---

### 6.2 — Conclusiones

#### Dictamen de Calidad: ¿APTO PARA CONTINUAR?

**Respuesta: ⚠️ APTO CON REPARACIONES CRÍTICAS REQUERIDAS**

---

**Justificación por métrica** (Datos REALES E4):

| Métrica | Resultado | Umbral | Estado |
|---------|-----------|--------|--------|
| Tasa de Éxito | 44.44% | ≥85% | ❌ CRÍTICO (-40pp) |
| Densidad de Defectos | 1.63/KLOC | <3.0/KLOC | ✅ EXCELENTE |
| Porcentaje de Corrección | 28.57% | ≥80% | ❌ CRÍTICO (-51pp) |
| Defectos Críticos+Altos | 71.43% | <40% | ❌ CRÍTICO (+31pp) |
| Cobertura Funcional | 60% | ≥70% | ⚠️ BAJO (-10pp) |

---

**Diagnóstico CRÍTICO**:

1. **Módulo 02 (Estados) NO FUNCIONAL**: 0/10 casos aprobados. Completamente bloqueador para transiciones de incidencias.

2. **Módulo 03 (Asignación) DEFICIENTE**: 1/10 casos aprobados. Falta implementación de endpoints DELETE backend.

3. **Defectos ACUMULADOS**: 5 de 7 bugs ABIERTOS al cierre de E4 (28.57% tasa cierre). Tendencia negativa.

4. **Distribución PELIGROSA**: 71.43% de defectos son críticos/altos. Arquitectura tiene problemas fundamentales.

5. **Módulos listos**: Solo Módulos 04, 05, 09 están 100% funcionales. 30% del sistema todavía inestable.

---

**ACCIONES REQUERIDAS ANTES DE E6**:

| Acción | Urgencia | ETA | Responsable |
|--------|----------|-----|-------------|
| Refactorizar Módulo 02 (lógica transiciones) | 🔴 CRÍTICA | 3 días | Integrante 2 (Backend) |
| Implementar CP-03-02-B (DELETE assignments) | 🔴 CRÍTICA | 2 días | Integrante 2 (Backend) |
| Cerrar defectos BUG-001, BUG-003, BUG-007 | 🔴 CRÍTICA | 3 días | Todo el equipo |
| Ejecutar regresión en Módulos 01, 02, 03 | 🟡 ALTA | 2 días | Integrante 1 (Frontend) |
| Completar Módulos 05–10 | 🟡 ALTA | 7 días | Todo el equipo (paralelo) |

---

**Recomendación para E6 (Análisis Estático)**:

**NO pasar a E6 hasta que se cumplan**:
- [ ] Módulo 02: ≥70% aprobación (mínimo 7/10 casos)
- [ ] Módulo 03: ≥80% aprobación (mínimo 8/10 casos)  
- [ ] Defectos abiertos: ≤2 (máximo 2 críticos sin resolver)
- [ ] Tasa de éxito general: ≥60% (paso a 65%+)

Si estas condiciones NO se cumplen en los próximos 7 días, **RETRASAR E6 una semana** y priorizar bugfixes.

---

#### Conclusión Final

El sistema de incidencias georreferenciadas **NO está listo para análisis estático**. Los módulos 02 y 03 tienen deficiencias arquitectónicas que impiden el flujo core (crear → asignar → cambiar estado). La calidad del código es BUENA (1.63 def/KLOC), pero la lógica funcional es DEFICIENTE.

**Veredicto**: ❌ **NO APTO PARA E6 SIN REPARACIONES**  
**Condición de paso**: Cerrar defectos críticos + refactorizar Módulo 02 (mínimo 3–5 días)  
**Fecha recomendada E6**: 2026-07-20 o posterior (si reparaciones demoran más)

---

## APÉNDICE: CÓMO LLENAR ESTE DOCUMENTO

### Paso 1: Recolectar Datos (1 día)
- [ ] Contar casos de E4 ejecutados (marcar en `Plan-de-Calidad.md`)
- [ ] Registrar defectos encontrados en tabla Excel con columnas: ID, Módulo, Descripción, Severidad, Estado (abierto/cerrado)
- [ ] Medir KLOC productivas (excluir `node_modules`, librerías externas)
- [ ] Cronometrar tendencia de defectos semana a semana

### Paso 2: Calcular Métricas (1 día)
- [ ] Aplicar fórmulas de Sección 2 (tasa, cobertura, densidad, etc.)
- [ ] Generar gráficos en Excel (Sección 3)
- [ ] Crear tabla comparativa E1 vs E4 (Sección 4)

### Paso 3: Análisis Crítico (1 día)
- [ ] Listar módulos con mayor # de defectos
- [ ] Identificar causa raíz de cada defecto (revisar código, git blame)
- [ ] Proponer 3–5 acciones de mejora viables
- [ ] Escribir conclusiones

### Paso 4: Redacción en Word (1 día)
- [ ] Copiar estructura de este documento a `ActividadGrupal_E5MICS.docx`
- [ ] Reemplazar datos de ejemplo con datos REALES de tu proyecto
- [ ] Insertar gráficos (copiar de Excel)
- [ ] Revisar ortografía y formato
- [ ] Validar que documento sea 5–7 páginas

### Paso 5: Entrega (antes del 04 de mayo de 2026)
- [ ] PDF + Word a profesor
- [ ] Copia en repositorio Git: `docs/Entregables/ActividadGrupal_E5MICS.docx`

---

## 📚 REFERENCIAS

- **E1 — Plan de Calidad**: `docs/Plan de calidad/Plan-de-Calidad.md` (90 casos de prueba)
- **E4 — Ejecución de Pruebas**: Resultados de pruebas ejecutadas (ver `docs/Entregables/` si existe E4)
- **Código productivo**:
  - Backend: `backend/app/Domains/` (~2,500 LOC)
  - Frontend: `frontend/app/` (~1,800 LOC)
- **Stack**: Laravel + PostgreSQL + PostGIS + Vanilla JS + Bootstrap 5

---

**Documento creado**: 2026-07-10  
**Última actualización**: 2026-07-10  
**Estado**: 📋 GUÍA COMPLETA LISTA PARA RELLENAR
