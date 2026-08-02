# Estándares IEEE para Ingeniería de Software

Documento de referencia sobre los principales estándares IEEE aplicables al desarrollo del Sistema Web de Gestión de Incidencias Georreferenciadas.

---

## 1. IEEE 29148:2018 — Ingeniería de Requisitos

**Título completo:** ISO/IEC/IEEE 29148:2018 — Systems and Software Engineering — Life Cycle Processes — Requirements Engineering

**Estado:** Activo. **Reemplazó a IEEE 830-1998.**

### ¿De qué trata?

Define el proceso de ingeniería de requisitos para sistemas y productos de software a lo largo del ciclo de vida. Especifica:

- Cómo redactar un **buen requisito** (atributos: necesario, verificable, no ambiguo, consistente, trazable)
- La estructura y contenido de documentos como el **SRS** (Software Requirements Specification), **SyRS** (System Requirements Specification) y **StRS** (Stakeholder Requirements Specification)
- Plantillas para cada tipo de documento
- Procesos de elicitación, análisis, especificación y validación de requisitos

### Relevancia para el proyecto

Es el estándar que dicta la estructura de nuestro SRS (`Especificaciones-Requisitos-Software.md`). Nuestro documento actual ya sigue su estructura base (introducción, descripción general, requisitos específicos, apéndices).

---

## 2. IEEE 830-1998 — Práctica Recomendada para SRS (SUPERSEDIDO)

**Título completo:** IEEE Recommended Practice for Software Requirements Specifications

**Estado:** **Supersedido** por ISO/IEC/IEEE 29148:2011 (luego 29148:2018).

### ¿De qué trata?

Fue el estándar de facto durante décadas para escribir especificaciones de requisitos de software. Definía:

- Las características de un buen SRS: correcto, no ambiguo, completo, consistente, clasificado por importancia, verificable, modificable, trazable
- La estructura de 3 secciones: Introducción, Descripción General, Requisitos Específicos
- Prototipos y mockups como complementos

### Relevancia

Vigente históricamente. Todo lo que definió IEEE 830 fue absorbido y mejorado por IEEE 29148. Nuestro SRS se referencia en IEEE 830 por legado.

---

## 3. IEEE 1012-2016 — Verificación y Validación (V&V)

**Título completo:** IEEE Standard for System, Software, and Hardware Verification and Validation

**Estado:** Activo.

### ¿De qué trata?**

Define procesos de Verificación y Validación (V&V) para determinar si los productos de desarrollo de una actividad dada:

- **Verificación:** ¿Construimos el producto correctamente? (conformidad con especificaciones)
- **Validación:** ¿Construimos el producto correcto? (satisface las necesidades del usuario)

Cubre V&V para sistemas, software y hardware a lo largo de todo el ciclo de vida: concepto, requisitos, diseño, implementación, prueba, instalación, operación y mantenimiento.

### Relevancia para el proyecto

Aplica a nuestras actividades de testing (PHPUnit), revisiones de código, y validación con el producto final. Define los niveles de integridad (niveles 1-4) según criticidad del software.

---

## 4. IEEE 1028-2008 — Revisiones y Auditorías de Software

**Título completo:** IEEE Standard for Software Reviews and Audits

**Estado:** Activo.

### ¿De qué trata?

Define cinco tipos de revisiones y auditorías de software con sus procedimientos:

1. **Management Review** — Revisión gerencial (monitoreo de progreso, estado, planes)
2. **Technical Review** — Revisión técnica (evaluación del producto técnico por pares)
3. **Inspection** — Inspección (detección y eliminación formal de defectos)
4. **Walk-through** — Recorrido (evaluación informal, aprendizaje del producto)
5. **Audit** — Auditoría (evaluación independiente de conformidad con estándares y procedimientos)

### Relevancia para el proyecto

Aplicable a revisiones de código entre los 3 integrantes del equipo, inspecciones del SRS, y auditorías de cumplimiento con los requisitos.

---

## 5. IEEE 730-2014 — Garantía de Calidad de Software (SQA)

**Título completo:** IEEE Standard for Software Quality Assurance Processes

**Estado:** Activo.

### ¿De qué trata?

Define los requisitos para iniciar, planificar, controlar y ejecutar los procesos de Software Quality Assurance (SQA) en un proyecto de desarrollo o mantenimiento de software.

Cubre:

- Planificación de SQA (Producto vs Proceso)
- Actividades de aseguramiento de calidad de producto de software
- Actividades de aseguramiento de calidad de proceso de software
- Reporting, gestión de no conformidades, acciones correctivas

### Relevancia para el proyecto

Complementa nuestro Plan de Calidad (`docs/Plan de calidad/Plan-de-Calidad.md`). Define cómo monitorear y asegurar la calidad durante todo el desarrollo.

---

## 6. IEEE 829-2008 — Documentación de Pruebas

**Título completo:** IEEE Standard for Software and System Test Documentation

**Estado:** Activo (parcialmente cubierto por ISO/IEC/IEEE 29119).

### ¿De qué trata?**

Define los documentos de prueba que deben generarse durante el proceso de testing:

- **Test Plan** — Plan de pruebas
- **Test Design Specification** — Especificación de diseño de pruebas
- **Test Case Specification** — Especificación de casos de prueba
- **Test Procedure Specification** — Especificación de procedimientos de prueba
- **Test Log** — Registro de ejecución de pruebas
- **Test Incident Report** — Reporte de incidentes/defectos
- **Test Summary Report** — Reporte resumen de pruebas

### Relevancia para el proyecto

Define la documentación esperada para nuestras pruebas con PHPUnit (unitarias, integración, features). Podemos usar esta estructura para documentar nuestros casos de prueba.

---

## 7. ISO/IEC 25000 (SQuaRE) — Calidad del Producto de Software

**Título completo:** ISO/IEC 25000:2014 — Systems and Software Quality Requirements and Evaluation (SQuaRE)

**Estado:** Activo. **Reemplazó a ISO/IEC 9126 e ISO/IEC 14598.**

### ¿De qué trata?

Es la familia de estándares para calidad de producto de software y evaluación. La serie se divide en:

| División | Contenido |
|----------|-----------|
| ISO/IEC 2500n | Gestión de calidad (Quality Management) |
| ISO/IEC 2501n | Modelo de calidad (Quality Model) — incluye **ISO/IEC 25010** |
| ISO/IEC 2502n | Medición de calidad (Quality Measurement) |
| ISO/IEC 2503n | Requisitos de calidad (Quality Requirements) |
| ISO/IEC 2504n | Evaluación de calidad (Quality Evaluation) |

### ISO/IEC 25010 — Modelo de Calidad

Define 8 características de calidad:

1. **Funcionalidad** (Functional Suitability) — ¿Hace lo que debe?
2. **Rendimiento** (Performance Efficiency) — ¿Es rápido?
3. **Compatibilidad** (Compatibility) — ¿Coexiste e interactúa con otros?
4. **Usabilidad** (Usability) — ¿Es fácil de usar?
5. **Fiabilidad** (Reliability) — ¿Funciona sin fallos?
6. **Seguridad** (Security) — ¿Protege los datos?
7. **Mantenibilidad** (Maintainability) — ¿Es fácil de modificar?
8. **Portabilidad** (Portability) — ¿Se puede migrar a otro entorno?

### Relevancia para el proyecto

Nuestro SRS ya estructura los requisitos no funcionales siguiendo este modelo (secciones 3.3 a 3.8). El Plan de Calidad también se alinea con SQuaRE.

---

## 8. ISO/IEC/IEEE 12207:2017 — Procesos del Ciclo de Vida del Software

**Título completo:** Systems and Software Engineering — Software Life Cycle Processes

**Estado:** Activo.

### ¿De qué trata?

Establece un marco común para los procesos del ciclo de vida del software, con terminología definida que puede ser referenciada por la industria. Define procesos en 4 categorías:

1. **Procesos de Acuerdo** — Adquisición, suministro
2. **Procesos Organizacionales** — Gestión, infraestructura, mejora, recursos humanos
3. **Procesos Técnicos** — Análisis de negocio, requisitos, diseño, construcción, integración, pruebas, despliegue, operación, mantenimiento
4. **Procesos de Implementación Técnica** — Gestión de proyecto, aseguramiento de calidad, gestión de configuración

### Relevancia para el proyecto

Define el ciclo de vida completo que seguimos como proyecto integrador: desde requisitos hasta despliegue con Docker.

---

## 9. IEEE 1061-1998 — Metodología de Métricas de Calidad de Software

**Título completo:** IEEE Standard for a Software Quality Metrics Methodology

**Estado:** Activo.

### ¿De qué trata?**

Define una metodología para establecer requisitos de calidad e identificar, implementar, analizar y validar métricas de calidad de software. Establece el marco para:

- Identificar factores de calidad relevantes
- Seleccionar métricas directas e indirectas
- Establecer rangos objetivo para cada métrica
- Validar la relación entre métricas y factores de calidad

### Relevancia para el proyecto

Aplicable para definir métricas concretas del dashboard (tiempo promedio de resolución, cantidad por estado, etc.) y métricas de calidad del código (complejidad, cobertura de pruebas).

---

## 10. IEEE 828-2012 — Gestión de Configuración

**Título completo:** IEEE Standard for Configuration Management in Systems and Software Engineering

**Estado:** Activo.

### ¿De qué trata?

Define los procesos de gestión de configuración para sistemas y software: identificación, control, contabilidad de estado, y auditoría de configuración. Esencial para:

- Control de versiones (Git)
- Gestión de releases
- Trazabilidad de cambios
- Integridad de artefactos

### Relevancia para el proyecto

Fundamenta nuestras prácticas de Git, branching, versionado semántico, y gestión de dependencias con Composer.

---

## Resumen de Aplicabilidad al Proyecto

| Estándar | Aplica a | Estado |
|----------|----------|--------|
| **IEEE 29148:2018** | SRS (nuestro documento principal de requisitos) | ✅ En uso |
| **IEEE 830-1998** | Referencia histórica del SRS | ⚠️ Supersedido |
| **IEEE 1012-2016** | Testing (PHPUnit), validación con usuario | 🔲 A planificar |
| **IEEE 1028-2008** | Revisiones de código entre pares, inspecciones | 🔲 A planificar |
| **IEEE 730-2014** | Plan de Calidad | ✅ En uso |
| **IEEE 829-2008** | Documentación de casos de prueba | 🔲 A planificar |
| **ISO/IEC 25000/25010** | Requisitos no funcionales, Plan de Calidad | ✅ En uso |
| **ISO/IEC/IEEE 12207** | Ciclo de vida completo | ✅ Implícito |
| **IEEE 1061-1998** | Métricas del dashboard, cobertura de pruebas | 🔲 A planificar |
| **IEEE 828-2012** | Git, control de versiones | ✅ En uso |

---

## Referencias

- IEEE SA — Standards Association: https://standards.ieee.org/
- ISO/IEC 25000 SQuaRE: https://www.iso.org/standard/64764.html
- ISO/IEC/IEEE 29148:2018: https://www.iso.org/standard/72089.html
- IEEE 1012-2016 V&V: https://standards.ieee.org/ieee/1012/7324/
- IEEE 1028-2008 Reviews: https://standards.ieee.org/standard/1028-2008.html

---

*Documento generado como referencia para el proyecto integrador — Sistema Web de Gestión de Incidencias Georreferenciadas.*
