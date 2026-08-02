# Especificación de Requisitos de Software (SRS)

## Sistema Web de Gestión de Incidencias Georreferenciadas

---

**Versión del Documento:** 1.0
**Fecha:** 08 de junio de 2026
**Estado:** Aprobado para Desarrollo
**Nivel de Confianza:** Preliminar

---

## Historial de Revisiones

| Versión | Fecha | Descripción | Autor |
|---------|-------|-------------|-------|
| 1.0 | 08/06/2026 | Creación inicial del documento SRS | Equipo de Proyecto |

---

## Tabla de Contenidos

1. [Introducción](#1-introducción)
   - 1.1 Propósito
   - 1.2 Alcance del Producto
   - 1.3 Definiciones, Acrónimos y Abreviaturas
   - 1.4 Referencias
   - 1.5 Visión General del Documento

2. [Descripción General](#2-descripción-general)
   - 2.1 Perspectiva del Producto
   - 2.2 Funcionalidades del Producto
   - 2.3 Clases de Usuario y Características
   - 2.4 Ambiente Operativo
   - 2.5 Restricciones de Diseño e Implementación
   - 2.6 Suposiciones y Dependencias

3. [Requisitos Específicos](#3-requisitos-específicos)
   - 3.1 Requisitos de Interfaces Externas
     - 3.1.1 Interfaces de Usuario
     - 3.1.2 Interfaces de Hardware
     - 3.1.3 Interfaces de Software
     - 3.1.4 Interfaces de Comunicación
   - 3.2 Requisitos Funcionales
     - 3.2.1 Gestión de Incidencias (CRUD)
     - 3.2.2 Gestión de Estados e Historial
     - 3.2.3 Asignación de Responsables
     - 3.2.4 Sistema de Comentarios
     - 3.2.5 Ubicación Georreferenciada
     - 3.2.6 Clasificación Jerárquica (Tipo/Subtipo)
     - 3.2.7 Sistema de Notificaciones
     - 3.2.8 Dashboard y Métricas
     - 3.2.9 Autenticación y Control de Acceso
     - 3.2.10 Consultas y Filtros
   - 3.3 Requisitos de Rendimiento
   - 3.4 Requisitos de Fiabilidad
   - 3.5 Requisitos de Disponibilidad
   - 3.6 Requisitos de Seguridad
   - 3.7 Requisitos de Mantenibilidad
   - 3.8 Requisitos de Portabilidad
   - 3.9 Otros Requisitos

4. [Modelo de Datos](#4-modelo-de-datos)
   - 4.1 Entidades Principales
   - 4.2 Diagrama de Relaciones (ER)

5. [Apéndices](#5-apéndices)
   - 5.1 Matriz de Trazabilidad
   - 5.2 Glosario

---

## 1. Introducción

### 1.1 Propósito

Este documento establece la especificación completa de requisitos de software para el **Sistema Web de Gestión de Incidencias Georreferenciadas**. El propósito principal es definir de manera precisa y completa todas las funcionalidades, restricciones y características del sistema que será desarrollado como proyecto integrador.

El SRS servirá como acuerdo contractual entre el equipo de desarrollo y las asignaturas involucradas, proporcionando una referencia común para todas las partes interesadas y estableciendo los criterios de aceptación del producto final.

### 1.2 Alcance del Producto

El sistema consistirá en una aplicación web completa que permitirá:

- El registro, gestión y seguimiento completo de incidencias georreferenciadas
- La asignación de responsables con roles diferenciados (responsable principal y apoyo)
- El seguimiento mediante comentarios y notificaciones
- La clasificación jerárquica de incidencias por tipo y subtipo
- La visualización de métricas y dashboards con filtros avanzados
- La gestión de ubicaciones normalizadas (País → Provincia → Ciudad)
- Sistema de Roles y Permisos

El sistema NO incluirá (dentro del alcance inicial):

- Aplicaciones móviles nativas
- Integración con sistemas externos de terceros
- Módulo de reportes avanzados con exportación a PDF/Excel

### 1.3 Definiciones, Acrónimos y Abreviaturas

| Término | Definición |
|---------|------------|
| **API** | Application Programming Interface - Interfaz de Programación de Aplicaciones |
| **BD** | Base de Datos |
| **CRUD** | Create, Read, Update, Delete - Operaciones de creación, lectura, actualización y eliminación |
| **Docker** | Plataforma de contenedores para automatización de despliegues |
| **ER** | Entity Relationship - Modelo Entidad-Relación |
| **FK** | Foreign Key - Llave Foránea |
| **HTTP** | Hypertext Transfer Protocol - Protocolo de Transferencia de Hipertexto |
| **JSON** | JavaScript Object Notation - Notación de Objetos de JavaScript |
| **Laravel** | Framework de desarrollo web en PHP |
| **MySQL** | Sistema de Gestión de Bases de Datos Relacional |
| **PostgreSQL** | Sistema de Gestión de Bases de Datos Objeto-Relacional |
| **REST** | Representational State Transfer - Estilo arquitectural para servicios web |
| **SRS** | Software Requirements Specification - Especificación de Requisitos de Software |
| **SQL** | Structured Query Language - Lenguaje de Consultas Estructurado |
| **UI** | User Interface - Interfaz de Usuario |
| **UX** | User Experience - Experiencia de Usuario |

### 1.4 Referencias

| Referencia | Descripción |
|------------|-------------|
| IEEE 830-1998 | IEEE Recommended Practice for Software Requirements Specifications |
| ISO/IEC 25000 | SQuaRE - Software Quality Requirements and Evaluation |
| ISO/IEC 25010 | Modelo de calidad de producto de software |
| PSR-12 | Guía de estilos de codificación para PHP |
| Proyecto Integrador 2026 | Lineamientos del proyecto para estudiantes de TecDesWeb-2 |

### 1.5 Visión General del Documento

Este documento está organizado siguiendo la estructura estándar IEEE 830 para SRS. La Sección 2 proporciona la descripción general del producto, estableciendo el contexto y las restricciones. La Sección 3 contiene todos los requisitos específicos organizados por categorías. La Sección 4 presenta el modelo de datos conceptual. La Sección 5 incluye apéndices con información complementaria.

---

## 2. Descripción General

### 2.1 Perspectiva del Producto

El Sistema Web de Gestión de Incidencias Georreferenciadas es una aplicación web completa desarrollada como proyecto integrador. El sistema será construido como una arquitectura de tres capas:

- **Capa de Presentación (Frontend):** Aplicación web responsiva desarrollada en HTML5, CSS3, Bootstrap y JavaScript vanilla con Fetch API para comunicación asíncrona.
- **Capa de Lógica de Negocio (Backend):** API REST desarrollada en Laravel (PHP) que procesa las solicitudes del cliente y ejecuta la lógica del negocio.
- **Capa de Datos:** Sistema de gestión de base de datos relacional (MySQL o PostgreSQL) que almacena la información del sistema.

El sistema interactuará con los usuarios a través de un navegador web estándar, sin necesidad de instalar software adicional en los equipos clientes. El despliegue se realizará utilizando contenedores Docker para garantizar portabilidad y consistencia del entorno.

### 2.2 Funcionalidades del Producto

El sistema proporcionará las siguientes funcionalidades principales:

1. **Gestión de Incidencias:** CRUD completo con validación de datos en frontend y backend
2. **Estados e Historial:** Transiciones de estado controladas con registro histórico completo
3. **Asignación de Responsables:** Asignación de uno o varios usuarios con roles diferenciados
4. **Sistema de Comentarios:** Registro y visualización de comentarios por incidencia
5. **Ubicación Georreferenciada:** Selección jerárquica normalizada de País → Provincia → Ciudad
6. **Clasificación Jerárquica:** Selección de Tipo y Subtipo relacionados
7. **Notificaciones:** Sistema de notificaciones por eventos con lectura/no lectura
8. **Dashboard:** Visualización de métricas, gráficos y filtros avanzados
9. **Autenticación:** Login/logout con control de acceso por sesiones
10. **Consultas:** Filtros por estado, tipo, ubicación, rango de fechas

### 2.3 Clases de Usuario y Características

#### 2.3.1 Administrador del Sistema

| Característica | Descripción |
|----------------|-------------|
| **Rol** | Usuario con privilegios completos de gestión |
| **Permisos** | Crear, editar, eliminar incidencias; gestionar usuarios; ver dashboard completo |
| **Frecuencia de uso** | Media-alta |
| **Nivel de expertise** | Intermedio |

#### 2.3.2 Usuario Operador

| Característica | Descripción |
|----------------|-------------|
| **Rol** | Usuario con permisos operativos estándar |
| **Permisos** | Crear y editar incidencias asignadas; agregar comentarios; ver dashboard personal |
| **Frecuencia de uso** | Alta |
| **Nivel de expertise** | Básico a intermedio |

#### 2.3.3 Visitante (Sin autenticación)

| Característica | Descripción |
|----------------|-------------|
| **Rol** | Usuario sin acceso al sistema |
| **Permisos** | Ninguno - debe autenticarse para acceder |
| **Frecuencia de uso** | N/A |
| **Nivel de expertise** | N/A |

### 2.4 Ambiente Operativo

#### 2.4.1 Plataforma de Hardware

| Componente | Especificación Mínima | Especificación Recomendada |
|------------|----------------------|---------------------------|
| Servidor de Aplicaciones | CPU: 2 cores, RAM: 4GB | CPU: 4 cores, RAM: 8GB |
| Servidor de Base de Datos | CPU: 2 cores, RAM: 4GB | CPU: 4 cores, RAM: 8GB |
| Almacenamiento | 20 GB SSD/HDD | 50 GB SSD/HDD |
| Red | 100 Mbps | 1 Gbps |

#### 2.4.2 Plataforma de Software

| Componente | Requisito |
|------------|-----------|
| Sistema Operativo del Servidor | Linux (Ubuntu 22.04 LTS o equivalente) |
| Contenedores | Docker Engine 20.10+ con Docker Compose |
| Servidor Web | Nginx |
| Runtime PHP | PHP 8.2+ |
| Framework Backend | Laravel 10.x |
| Base de Datos | MySQL 8.0 o PostgreSQL 15 |
| Navegador Cliente | Chrome 90+, Firefox 90+, Safari 14+, Edge 90+ |

#### 2.4.3 Ambiente de Red

El sistema operará en un entorno de red estándar con las siguientes consideraciones:

- El frontend se comunicará con el backend exclusivamente a través de la API REST
- Se implementará configuración CORS para permitir comunicación entre dominios
- El tráfico entre cliente y servidor utilizará HTTPS (cuando esté disponible)
- Los contenedores Docker utilizarán una red interna para comunicación entre servicios

### 2.5 Restricciones de Diseño e Implementación

| Restricción | Descripción |
|-------------|-------------|
| **Tecnología Backend** | Obligatorio: Laravel (API REST en PHP) |
| **Tecnología Frontend** | Obligatorio: HTML5, CSS3, Bootstrap, JavaScript vanilla |
| **Base de Datos** | Obligatorio: MySQL o PostgreSQL (motor relacional) |
| **Despliegue** | Obligatorio: Contenedores Docker con Docker Compose |
| **Comunicación** | Obligatorio: Fetch API (JavaScript vanilla) - No frameworks JS |
| **Estilo de Código** | PSR-12 para código PHP |
| **Arquitectura** | API REST con separación clara frontend/backend |
| **Tiempo de entrega** | Según calendario académico (socialización: 04/05/2026) |
| **Equipo** | 3 integrantes con roles diferenciados |

### 2.6 Suposiciones y Dependencias

#### 2.6.1 Suposiciones

| Suposición | Descripción |
|------------|-------------|
| Los usuarios utilizarán navegadores web modernos y actualizados | Chrome, Firefox, Safari o Edge en versiones recientes |
| El acceso a internet es estable para el uso del sistema | No se contempla modo offline |
| Los datos de ubicación (Países, Provincias, Ciudades) serán precargados | El equipo no creará datos geográficos desde cero |
| Los tipos y subtipos de incidencia serán precargados | Catálogos base definidos antes del desarrollo |
| Se cuenta con Docker instalado en el entorno de despliegue | Requisito obligatorio del proyecto |

#### 2.6.2 Dependencias

| Dependencia | Descripción | Impacto |
|-------------|-------------|---------|
| Laravel Framework | Framework backend obligatorio | Crítico |
| Bootstrap CSS | Framework CSS para UI | Crítico |
| MySQL/PostgreSQL | Base de datos relacional | Crítico |
| Docker Engine | Plataforma de contenedores | Crítico |
| Composer | Gestor de dependencias PHP | Crítico |

---

## 3. Requisitos Específicos

### 3.1 Requisitos de Interfaces Externas

#### 3.1.1 Interfaces de Usuario

##### RF-UI-001: Pantalla de Login

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-UI-001 |
| **Tipo** | Interfaz de Usuario |
| **Prioridad** | Alta |
| **Descripción** | La pantalla de login debe incluir campos para email y contraseña, con botones de envío y manejo de errores visuales |

**Requisitos específicos:**
- Campo de email con validación de formato
- Campo de contraseña con caracteres ocultos (••••)
- Botón "Ingresar" que muestra estado de carga
- Mensajes de error claros para credenciales inválidas
- Enlace para recuperación de contraseña (opcional)
- Diseño responsivo para dispositivos móviles

##### RF-UI-002: Dashboard Principal

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-UI-002 |
| **Tipo** | Interfaz de Usuario |
| **Prioridad** | Alta |
| **Descripción** | El dashboard principal debe mostrar métricas generales, gráficos de distribución y acceso rápido a funciones principales |

**Requisitos específicos:**
- Tarjeta con total de incidencias
- Tarjetas con conteos por estado (Pendiente, En Proceso, Resuelto)
- Gráfico de barras o torta mostrando distribución por estado
- Gráfico de barras mostrando distribución por tipo
- Filtros de búsqueda por rango de fechas
- Filtro por tipo de incidencia
- Filtro por ubicación (País/Provincia/Ciudad)
- Botón para crear nueva incidencia
- Tabla resumen con últimas incidencias creadas

##### RF-UI-003: Formulario de Creación/Edición de Incidencia

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-UI-003 |
| **Tipo** | Interfaz de Usuario |
| **Prioridad** | Alta |
| **Descripción** | Formulario completo para crear o editar una incidencia con todos los campos requeridos |

**Requisitos específicos:**
- Campo título (requerido, 3-100 caracteres)
- Campo descripción (requerido, 10-500 caracteres)
- Dropdown de prioridad (Alta, Media, Baja)
- Selector cascada de ubicación (País → Provincia → Ciudad)
- Selector cascada de tipo/subtipo
- Campo teléfono de contacto (opcional)
- Botón "Guardar" con validación
- Botón "Cancelar" para regresar
- Mensajes de error inline para campos inválidos

##### RF-UI-004: Vista de Detalle de Incidencia

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-UI-004 |
| **Tipo** | Interfaz de Usuario |
| **Prioridad** | Alta |
| **Descripción** | Vista completa de una incidencia mostrando todos los datos, historial, comentarios y responsables |

**Requisitos específicos:**
- Encabezado con título y badge de estado
- Información de la incidencia (fechas, prioridad, ubicación, tipo)
- Sección de responsables asignados con roles
- Pestaña/Acordeón de historial de cambios de estado
- Sección de comentarios con formulario para agregar
- Botones de acción (Editar, Eliminar, Cambiar Estado)
- Indicador de tiempo de resolución (si está resuelta)

##### RF-UI-005: Panel de Notificaciones

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-UI-005 |
| **Tipo** | Interfaz de Usuario |
| **Prioridad** | Media |
| **Descripción** | Panel desplegable en el navbar que muestra las notificaciones del usuario |

**Requisitos específicos:**
- Icono de campana con badge contador de no leídas
- Panel desplegable con lista de notificaciones
- Cada notificación muestra: tipo de evento, mensaje, tiempo relativo
- Indicador visual de leída/no leída
- Click para marcar como leída - Botón "Marcar todas como leídas"

#### 3.1.2 Interfaces de Hardware

No aplica. El sistema es completamente web y no interactúa con hardware específico más allá del estándar de navegadores web.

#### 3.1.3 Interfaces de Software

##### RF-SW-001: API REST - Autenticación

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-SW-001 |
| **Tipo** | Interfaz de Software (API) |
| **Prioridad** | Alta |
| **Descripción** | Endpoints para autenticación de usuarios |

**Endpoints:**

| Método | Ruta | Descripción | Respuesta Éxito | Respuesta Error |
|--------|------|-------------|-----------------|-----------------|
| POST | /api/login | Autenticación de usuario | 200 + token/sesión | 401 + mensaje error |
| POST | /api/logout | Cerrar sesión | 200 | 500 |
| GET | /api/user | Obtener usuario autenticado | 200 + datos usuario | 401 |

##### RF-SW-002: API REST - Incidencias

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-SW-002 |
| **Tipo** | Interfaz de Software (API) |
| **Prioridad** | Alta |
| **Descripción** | Endpoints CRUD para gestión de incidencias |

**Endpoints:**

| Método | Ruta | Descripción | Respuesta Éxito | Respuesta Error |
|--------|------|-------------|-----------------|-----------------|
| GET | /api/incidencias | Listar incidencias (con filtros) | 200 + array | 500 |
| GET | /api/incidencias/{id} | Ver incidencia específica | 200 + datos | 404 |
| POST | /api/incidencias | Crear nueva incidencia | 201 + datos | 422 + errores |
| PUT | /api/incidencias/{id} | Actualizar incidencia | 200 + datos | 422/404 |
| DELETE | /api/incidencias/{id} | Eliminar incidencia | 200 | 404/403 |

##### RF-SW-003: API REST - Estados e Historial

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-SW-003 |
| **Tipo** | Interfaz de Software (API) |
| **Prioridad** | Alta |
| **Descripción** | Endpoints para gestión de estados e historial de incidencias |

**Endpoints:**

| Método | Ruta | Descripción | Respuesta Éxito | Respuesta Error |
|--------|------|-------------|-----------------|-----------------|
| GET | /api/estados | Listar estados disponibles | 200 + array | 500 |
| PUT | /api/incidencias/{id}/estado | Cambiar estado | 200 + historial | 422/404 |
| GET | /api/incidencias/{id}/historial | Obtener historial | 200 + array | 404 |

##### RF-SW-004: API REST - Responsables

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-SW-004 |
| **Tipo** | Interfaz de Software (API) |
| **Prioridad** | Alta |
| **Descripción** | Endpoints para asignación de responsables |

**Endpoints:**

| Método | Ruta | Descripción | Respuesta Éxito | Respuesta Error |
|--------|------|-------------|-----------------|-----------------|
| GET | /api/incidencias/{id}/responsables | Listar responsables | 200 + array | 404 |
| POST | /api/incidencias/{id}/responsables | Asignar responsable | 200 + datos | 422 |
| PUT | /api/incidencias/{id}/responsables/{userId} | Actualizar rol | 200 + datos | 404 |
| DELETE | /api/incidencias/{id}/responsables/{userId} | Eliminar responsable | 200 | 404 |

##### RF-SW-005: API REST - Comentarios

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-SW-005 |
| **Tipo** | Interfaz de Software (API) |
| **Prioridad** | Alta |
| **Descripción** | Endpoints para gestión de comentarios |

**Endpoints:**

| Método | Ruta | Descripción | Respuesta Éxito | Respuesta Error |
|--------|------|-------------|-----------------|-----------------|
| GET | /api/incidencias/{id}/comentarios | Listar comentarios | 200 + array | 404 |
| POST | /api/incidencias/{id}/comentarios | Crear comentario | 201 + datos | 422 |
| DELETE | /api/comentarios/{id} | Eliminar comentario | 200 | 404/403 |

##### RF-SW-006: API REST - Ubicación

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-SW-006 |
| **Tipo** | Interfaz de Software (API) |
| **Prioridad** | Alta |
| **Descripción** | Endpoints para consulta de ubicación georreferenciada |

**Endpoints:**

| Método | Ruta | Descripción | Respuesta Éxito | Respuesta Error |
|--------|------|-------------|-----------------|-----------------|
| GET | /api/paises | Listar países | 200 + array | 500 |
| GET | /api/paises/{id}/provincias | Listar provincias | 200 + array | 404 |
| GET | /api/provincias/{id}/ciudades | Listar ciudades | 200 + array | 404 |

##### RF-SW-007: API REST - Tipos y Subtipo

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-SW-007 |
| **Tipo** | Interfaz de Software (API) |
| **Prioridad** | Alta |
| **Descripción** | Endpoints para consulta de tipos y subtipos de incidencia |

**Endpoints:**

| Método | Ruta | Descripción | Respuesta Éxito | Respuesta Error |
|--------|------|-------------|-----------------|-----------------|
| GET | /api/tipos | Listar tipos | 200 + array | 500 |
| GET | /api/tipos/{id}/subtipos | Listar subtipos | 200 + array | 404 |

##### RF-SW-008: API REST - Notificaciones

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-SW-008 |
| **Tipo** | Interfaz de Software (API) |
| **Prioridad** | Media |
| **Descripción** | Endpoints para gestión de notificaciones |

**Endpoints:**

| Método | Ruta | Descripción | Respuesta Éxito | Respuesta Error |
|--------|------|-------------|-----------------|-----------------|
| GET | /api/notificaciones | Listar notificaciones usuario | 200 + array | 401 |
| PATCH | /api/notificaciones/{id} | Marcar como leída | 200 + datos | 404 |
| PATCH | /api/notificaciones/leer-todas | Marcar todas leídas | 200 | 401 |

##### RF-SW-009: API REST - Métricas

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-SW-009 |
| **Tipo** | Interfaz de Software (API) |
| **Prioridad** | Alta |
| **Descripción** | Endpoints para consulta de métricas y dashboard |

**Endpoints:**

| Método | Ruta | Descripción | Respuesta Éxito | Respuesta Error |
|--------|------|-------------|-----------------|-----------------|
| GET | /api/metricas/generales | Métricas generales | 200 + datos | 500 |
| GET | /api/metricas/por-estado | Distribución por estado | 200 + array | 500 |
| GET | /api/metricas/por-tipo | Distribución por tipo | 200 + array | 500 |
| GET | /api/metricas/tiempo-resolucion | Tiempo promedio resolución | 200 + datos | 500 |

#### 3.1.4 Interfaces de Comunicación

| Atributo | Descripción |
|----------|-------------|
| **Protocolo** | HTTP/HTTPS |
| **Formato de datos** | JSON |
| **Autenticación** | Token Bearer (JWT) o sesión |
| **CORS** | Configuración para permitir peticiones del frontend |
| **Codificación** | UTF-8 |

### 3.2 Requisitos Funcionales

#### 3.2.1 Gestión de Incidencias (CRUD)

##### RF-FUNC-001: Crear Incidencia

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-001 |
| **Prioridad** | Alta |
| **Descripción** | El sistema debe permitir crear nuevas incidencias con todos los campos requeridos |

**Reglas de negocio:**

1. El título es obligatorio y debe tener entre 3 y 100 caracteres
2. La descripción es obligatoria y debe tener entre 10 y 500 caracteres
3. La prioridad debe ser una de las siguientes: Alta, Media, Baja
4. La ubicación debe estar completa (País, Provincia, Ciudad seleccionados)
5. El tipo y subtipo deben ser válidos y relacionados
6. El teléfono de contacto es opcional, pero si se ingresa debe tener formato válido
7. La fecha de creación se asigna automáticamente al momento del registro
8. El estado inicial por defecto es "Pendiente"
9. El usuario que crea la incidencia se registra como creador

**Validaciones:**
- Frontend: Bloqueo de envío con campos vacíos, validación de formato en tiempo real
- Backend: Validación de todos los campos, tipos de datos, claves foráneas

##### RF-FUNC-002: Listar Incidencias

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-002 |
| **Prioridad** | Alta |
| **Descripción** | El sistema debe permitir listar todas las incidencias con filtros opcionales |

**Reglas de negocio:**

1. La lista debe mostrar paginación (20 elementos por página por defecto)
2. Se puede filtrar por: estado, tipo, subtipo, prioridad, ubicación, rango de fechas
3. La búsqueda puede realizarse por título o descripción
4. Los resultados se ordenan por fecha de creación descendente (más reciente primero)
5. Solo se muestran incidencias no eliminadas (soft delete)

**Campos a mostrar en lista:**
- ID, Título, Estado (badge), Prioridad, Tipo, Ubicación, Fecha creación, Responsable principal

##### RF-FUNC-003: Ver Detalle de Incidencia

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-003 |
| **Prioridad** | Alta |
| **Descripción** | El sistema debe permitir ver el detalle completo de una incidencia |

**Información a mostrar:**
- Datos generales: título, descripción, prioridad, teléfono
- Ubicación: País, Provincia, Ciudad
- Clasificación: Tipo, Subtipo
- Fechas: creación, última modificación, resolución (si aplica)
- Estado actual
- Lista de responsables con roles
- Historial de cambios de estado
- Lista de comentarios
- Estadísticas: tiempo transcurrido, tiempo de resolución (si está resuelta)

##### RF-FUNC-004: Editar Incidencia

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-004 |
| **Prioridad** | Alta |
| **Descripción** | El sistema debe permitir editar los datos de una incidencia existente |

**Reglas de negocio:**

1. Solo usuarios con permisos pueden editar
2. Los campos editables son: título, descripción, prioridad, teléfono, ubicación, tipo, subtipo
3. No se puede cambiar el estado directamente desde el formulario de edición
4. Se registra la fecha de última modificación automáticamente
5. Se mantiene el historial de quién realizó la última edición

**Validaciones:** Mismas que para crear incidencia

##### RF-FUNC-005: Eliminar Incidencia

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-005 |
| **Prioridad** | Media |
| **Descripción** | El sistema debe permitir eliminar (lógicamente) una incidencia |

**Reglas de negocio:**

1. La eliminación debe ser lógica (soft delete), no física
2. Se debe mostrar confirmación antes de eliminar
3. La incidencia eliminada no aparece en listados normales
4. Se puede acceder a la incidencia eliminada desde un listado de "eliminados" (solo admin)
5. Se registra la fecha de eliminación y el usuario que eliminó

#### 3.2.2 Gestión de Estados e Historial

##### RF-FUNC-006: Estados Disponibles

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-006 |
| **Prioridad** | Alta |
| **Descripción** | El sistema debe definir y gestionar los estados posibles de una incidencia |

**Estados definidos:**

| Estado | Descripción | Color Badge |
|--------|-------------|-------------|
| Pendiente | Incidencia creada, awaiting action | Amarillo |
| En Proceso | Incidencia siendo atendida | Azul |
| Resuelto | Incidencia solucionada | Verde |
| Cerrado | Incidencia verificada y cerrada | Gris |

**Reglas de negocio:**

1. El estado inicial de toda nueva incidencia es "Pendiente"
2. No todos los cambios de estado son válidos en cualquier momento
3. El flujo de estados permitido es: Pendiente → En Proceso → Resuelto → Cerrado
4. Se puede retroceder de estado en casos excepcionales (requiere justificación)

##### RF-FUNC-007: Cambiar Estado

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-007 |
| **Prioridad** | Alta |
| **Descripción** | El sistema debe permitir cambiar el estado de una incidencia |

**Reglas de negocio:**

1. Al cambiar de estado a "Resuelto", se registra automáticamente la fecha de resolución
2. Al cambiar de estado a "Cerrado", se verifica que esté en estado "Resuelto"
3. Todo cambio de estado genera un registro en el historial
4. El usuario que realiza el cambio se registra en el historial
5. Se puede agregar un comentario obligatorio al cambiar de estado

##### RF-FUNC-008: Historial de Cambios

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-008 |
| **Prioridad** | Alta |
| **Descripción** | El sistema debe mantener un historial completo de todos los cambios de estado |

**Datos del historial:**

- ID del registro
- ID de la incidencia
- Estado anterior
- Estado nuevo
- Usuario que realizó el cambio
- Fecha y hora del cambio
- Comentario (opcional)

**Reglas de negocio:**

1. El historial es inmutable - no se pueden modificar registros
2. El historial se muestra en orden cronológico inverso (más reciente primero)
3. Se incluye la fecha y hora exacta de cada cambio

#### 3.2.3 Asignación de Responsables

##### RF-FUNC-009: Asignar Responsable

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-009 |
| **Prioridad** | Alta |
| **Descripción** | El sistema debe permitir asignar uno o varios responsables a una incidencia |

**Reglas de negocio:**

1. Una incidencia puede tener uno o varios responsables
2. Los roles disponibles son: Responsable Principal, Apoyo
3. Solo puede haber un Responsable Principal por incidencia
4. Puede haber varios usuarios con rol de Apoyo
5. Al asignar un responsable, se genera una notificación para dicho usuario

##### RF-FUNC-010: Modificar Asignación

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-010 |
| **Prioridad** | Media |
| **Descripción** | El sistema debe permitir cambiar el rol de un responsable asignado |

**Reglas de negocio:**

1. Se puede cambiar el rol de un responsable (de Apoyo a Responsable Principal)
2. Si se asigna un nuevo Responsable Principal, el anterior pasa a Apoyo
3. Se registra el cambio en el historial de asignación

##### RF-FUNC-011: Eliminar Responsable

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-011 |
| **Prioridad** | Media |
| **Descripción** | El sistema debe permitir eliminar la asignación de un responsable |

**Reglas de negocio:**

1. Se puede eliminar un responsable de una incidencia
2. Si es el único responsable, se permite pero se muestra advertencia
3. Se registra la eliminación en el historial de asignación

#### 3.2.4 Sistema de Comentarios

##### RF-FUNC-012: Agregar Comentario

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-012 |
| **Prioridad** | Alta |
| **Descripción** | El sistema debe permitir agregar comentarios a una incidencia |

**Reglas de negocio:**

1. El texto del comentario es obligatorio
2. El texto debe tener entre 1 y 1000 caracteres
3. El usuario que crea el comentario se registra automáticamente
4. La fecha y hora de creación se asignan automáticamente
5. El comentario se asocia a la incidencia específica

##### RF-FUNC-013: Listar Comentarios

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-013 |
| **Prioridad** | Alta |
| **Descripción** | El sistema debe mostrar los comentarios de una incidencia ordenados por fecha |

**Reglas de negocio:**

1. Los comentarios se muestran en orden cronológico inverso (más reciente primero)
2. Cada comentario muestra: texto, autor, fecha/hora
3. Los comentarios eliminados no se muestran

##### RF-FUNC-014: Eliminar Comentario

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-014 |
| **Prioridad** | Media |
| **Descripción** | El sistema debe permitir eliminar un comentario |

**Reglas de negocio:**

1. Solo el autor del comentario puede eliminarlo
2. La eliminación es lógica (soft delete)
3. El comentario eliminado no se muestra en la lista

#### 3.2.5 Ubicación Georreferenciada

##### RF-FUNC-015: Selección de Ubicación

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-015 |
| **Prioridad** | Alta |
| **Descripción** | El sistema debe permitir seleccionar la ubicación de una incidencia mediante selección jerárquica |

**Reglas de negocio:**

1. La selección es en cascada: País → Provincia → Ciudad
2. Cada nivel se habilita solo cuando se ha seleccionado el nivel anterior
3. Al cambiar el país, se limpian provincia y ciudad seleccionadas
4. Al cambiar la provincia, se limpia la ciudad seleccionada
5. Los datos de ubicación se almacenan como referencias (IDs) en la incidencia

##### RF-FUNC-016: Normalización de Ubicación

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-016 |
| **Prioridad** | Alta |
| **Descripción** | Los datos de ubicación deben estar normalizados en tablas relacionadas |

**Reglas de negocio:**

1. Tabla `paises`: id, nombre, código, estado (activo/inactivo)
2. Tabla `provincias`: id, nombre, pais_id (FK), estado
3. Tabla `ciudades`: id, nombre, provincia_id (FK), estado
4. No debe haber redundancia de datos
5. Las relaciones deben mantener integridad referencial

#### 3.2.6 Clasificación Jerárquica (Tipo/Subtipo)

##### RF-FUNC-017: Selección de Tipo/Subtipo

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-017 |
| **Prioridad** | Alta |
| **Descripción** | El sistema debe permitir seleccionar el tipo y subtipo de una incidencia |

**Reglas de negocio:**

1. La selección es en cascada: Tipo → Subtipo
2. Cada nivel se habilita solo cuando se ha seleccionado el nivel anterior
3. Al cambiar el tipo, se limpia el subtipo seleccionado
4. Los subtipos están vinculados a un tipo específico
5. Los subtipos de un tipo no aparecen cuando se selecciona otro tipo

##### RF-FUNC-018: Tipos de Incidencia Predefinidos

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-018 |
| **Prioridad** | Alta |
| **Descripción** | El sistema debe contar con tipos y subtipos predefinidos de incidencias |

**Tipos predefinidos:**

| Tipo | Subtipo |
|------|---------|
| Infraestructura | Alumbrado Público, Baches, Semáforos, Vallas, Drenaje, Aceras |
| Seguridad | Robo, Vandalismo, Seguridad Ciudadana |
| Servicios Públicos | Agua, Electricidad, Gas, Telefonía, Internet |
| Medio Ambiente | Contaminación, Residuos, Deforestación, Animales |
| Otro | Otros |

#### 3.2.7 Sistema de Notificaciones

##### RF-FUNC-019: Generación de Notificaciones

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-019 |
| **Prioridad** | Media |
| **Descripción** | El sistema debe generar notificaciones automáticas ante ciertos eventos |

**Eventos que generan notificaciones:**

| Evento | Destinatario | Mensaje |
|--------|--------------|---------|
| Nueva incidencia asignada | Responsable asignado | "Se le ha asignado la incidencia: [título]" |
| Cambio de estado | Creador y responsables | "La incidencia [título] cambió a [nuevo estado]" |
| Nuevo comentario | Creador y responsables | "[Usuario] agregó un comentario a [título]" |

##### RF-FUNC-020: Gestión de Notificaciones

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-020 |
| **Prioridad** | Media |
| **Descripción** | El sistema debe permitir gestionar las notificaciones del usuario |

**Reglas de negocio:**

1. Las notificaciones están asociadas a un usuario específico
2. El usuario puede marcar una notificación como leída
3. El usuario puede marcar todas las notificaciones como leídas
4. Las notificaciones no leídas muestran un badge contador en el navbar
5. Las notificaciones leídas cambian de estilo visual (color de fondo)

#### 3.2.8 Dashboard y Métricas

##### RF-FUNC-021: Métricas Generales

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-021 |
| **Prioridad** | Alta |
| **Descripción** | El sistema debe mostrar métricas generales en el dashboard |

**Métricas a mostrar:**

1. Total de incidencias
2. Total por estado (Pendiente, En Proceso, Resuelto, Cerrado)
3. Porcentaje de resolución (incidencias resueltas / total)
4. Tiempo promedio de resolución

##### RF-FUNC-022: Visualización de Gráficos

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-022 |
| **Prioridad** | Alta |
| **Descripción** | El sistema debe mostrar gráficos visuales de las métricas |

**Gráficos requeridos:**

1. Gráfico de barras: Incidencias por estado
2. Gráfico de barras: Incidencias por tipo
3. Gráfico de torta: Distribución porcentual por estado
4. Gráfico de línea (opcional): Tendencia de incidencias creadas por semana

##### RF-FUNC-023: Filtros de Dashboard

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-023 |
| **Prioridad** | Alta |
| **Descripción** | El sistema debe permitir filtrar las métricas del dashboard |

**Filtros disponibles:**

1. Rango de fechas (fecha inicio - fecha fin)
2. Tipo de incidencia
3. Prioridad
4. Ubicación (País, Provincia, Ciudad)

#### 3.2.9 Autenticación y Control de Acceso

##### RF-FUNC-024: Login de Usuario

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-024 |
| **Prioridad** | Alta |
| **Descripción** | El sistema debe permitir a los usuarios autenticarse con email y contraseña |

**Reglas de negocio:**

1. El email es obligatorio y debe tener formato válido
2. La contraseña es obligatoria
3. Credenciales inválidas muestran mensaje de error genérico (no indicar qué campo está mal)
4. Login exitoso redirecciona al dashboard
5. Se genera un token/sesión para mantener la autenticación

##### RF-FUNC-025: Logout de Usuario

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-025 |
| **Prioridad** | Alta |
| **Descripción** | El sistema debe permitir al usuario cerrar su sesión |

**Reglas de negocio:**

1. El logout cierra la sesión y limpia el token
2. Redirecciona a la página de login
3. No se puede acceder a páginas protegidas sin autenticación

##### RF-FUNC-026: Protección de Rutas

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-026 |
| **Prioridad** | Alta |
| **Descripción** | El sistema debe proteger las rutas que requieren autenticación |

**Reglas de negocio:**

1. Las rutas /dashboard, /incidencias, /notificaciones requieren autenticación
2. Las rutas protegidas redireccionan a /login si el usuario no está autenticado
3. El token de sesión expira después de un tiempo definido
4. Sesión expirada redirecciona a /login con mensaje

#### 3.2.10 Consultas y Filtros

##### RF-FUNC-027: Búsqueda por Texto

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-027 |
| **Prioridad** | Media |
| **Descripción** | El sistema debe permitir buscar incidencias por texto en título o descripción |

**Reglas de negocio:**

1. La búsqueda es parcial (LIKE %texto%)
2. Busca en título y descripción
3. Es case-insensitive
4. Se puede combinar con otros filtros

##### RF-FUNC-028: Filtros Avanzados

| Atributo | Descripción |
|----------|-------------|
| **ID Requisito** | RF-FUNC-028 |
| **Prioridad** | Media |
| **Descripción** | El sistema debe permitir filtrar por múltiples criterios |

**Filtros disponibles:**

1. Estado: Pendiente, En Proceso, Resuelto, Cerrado
2. Prioridad: Alta, Media, Baja
3. Tipo: Lista de tipos disponibles
4. Subtipo: Lista de subtipos (depende del tipo)
5. Ubicación: País, Provincia, Ciudad
6. Rango de fechas: Fecha creación inicio y fin
7. Responsable: Usuario asignado

### 3.3 Requisitos de Rendimiento

| ID Requisito | Descripción | Criterio de Aceptación |
|--------------|-------------|----------------------|
| RR-001 | Tiempo de respuesta de páginas | < 2 segundos para páginas principales |
| RR-002 | Tiempo de respuesta de API | < 1 segundo para operaciones CRUD simples |
| RR-003 | Carga de dashboard | < 3 segundos para cargar todas las métricas |
| RR-004 | Tiempo de búsqueda | < 2 segundos para resultados de búsqueda |
| RR-005 | Concurrentes soportados | Mínimo 20 usuarios concurrentes sin degradación |

### 3.4 Requisitos de Fiabilidad

| ID Requisito | Descripción | Criterio de Aceptación |
|--------------|-------------|----------------------|
| RF-001 | Disponibilidad del sistema | 99% uptime en horario de operación |
| RF-002 | Integridad de datos | 0% pérdida de datos por errores del sistema |
| RF-003 | Recuperación ante fallos | Restauración completa en máximo 30 minutos |
| RF-004 | Persistencia de datos | Datos persistentes en reinicios de contenedores |

### 3.5 Requisitos de Disponibilidad

| ID Requisito | Descripción | Criterio de Aceptación |
|--------------|-------------|----------------------|
| RD-001 | Horario de operación | 24/7 disponible |
| RD-002 | Mantenimiento programado | Notificación con 48 horas de anticipación |
| RD-003 | Mensajes de error | Mensajes claros y útiles para el usuario |

### 3.6 Requisitos de Seguridad

| ID Requisito | Descripción | Criterio de Aceptación |
|--------------|-------------|----------------------|
| RS-001 | Contraseñas | Almacenamiento con hash (bcrypt/argon2) |
| RS-002 | Inyección SQL | Todos los inputs sanitizados, uso de prepared statements |
| RS-003 | XSS | Sanitización de salida, escape de caracteres HTML |
| RS-004 | CSRF | Tokens CSRF en formularios |
| RS-005 | CORS | Configuración restrictiva de orígenes permitidos |
| RS-006 | Sesiones | Tokens con expiración, invalidación al logout |

### 3.7 Requisitos de Mantenibilidad

| ID Requisito | Descripción | Criterio de Aceptación |
|--------------|-------------|----------------------|
| RM-001 | Código documentado | Comentarios en funciones y clases principales |
| RM-002 | Estándar de código | Cumplimiento de PSR-12 verificado con Laravel Pint |
| RM-003 | Arquitectura | Separación clara de capas (MVC) |
| RM-004 | Logs | Registro de errores y eventos importantes |

### 3.8 Requisitos de Portabilidad

| ID Requisito | Descripción | Criterio de Aceptación |
|--------------|-------------|----------------------|
| RP-001 | Contenedores | Sistema desplegable en Docker con Docker Compose |
| RP-002 | Base de datos | Compatible con MySQL y PostgreSQL |
| RP-003 | Navegadores | Funcional en Chrome, Firefox, Safari, Edge (versiones recientes) |

### 3.9 Otros Requisitos

| ID Requisito | Descripción | Criterio de Aceptación |
|--------------|-------------|----------------------|
| RO-001 | Responsividad | Interfaz adaptable a desktop, tablet y móvil |
| RO-002 | Accesibilidad | Contraste adecuado, tamaño de fuentes legible |
| RO-003 | Internacionalización | Interfaz en español, formatos de fecha dd/mm/aaaa |

---

## 4. Modelo de Datos

### 4.1 Entidades Principales

#### 4.1.1 Entidad: Usuario

| Campo | Tipo | Nullable | Descripción |
|-------|------|----------|-------------|
| id | INT (PK) | No | Identificador único |
| nombre | VARCHAR(100) | No | Nombre completo |
| email | VARCHAR(255) | No | Email (único) |
| password | VARCHAR(255) | No | Contraseña hasheada |
| rol | ENUM('admin', 'operador') | No | Rol del usuario |
| remember_token | VARCHAR(100) | Sí | Token de sesión |
| created_at | TIMESTAMP | No | Fecha creación |
| updated_at | TIMESTAMP | No | Última modificación |
| deleted_at | TIMESTAMP | Sí | Soft delete |

#### 4.1.2 Entidad: Incidencia

| Campo | Tipo | Nullable | Descripción |
|-------|------|----------|-------------|
| id | INT (PK) | No | Identificador único |
| titulo | VARCHAR(100) | No | Título de la incidencia |
| descripcion | TEXT | No | Descripción detallada |
| prioridad | ENUM('alta', 'media', 'baja') | No | Prioridad |
| telefono_contacto | VARCHAR(20) | Sí | Teléfono de contacto |
| estado_id | INT (FK) | No | Estado actual |
| ubicacion_id | INT (FK) | No | Ubicación georreferenciada |
| tipo_id | INT (FK) | No | Tipo de incidencia |
| subtipo_id | INT (FK) | Sí | Subtipo de incidencia |
| usuario_creador_id | INT (FK) | No | Usuario que creó |
| fecha_resolucion | TIMESTAMP | Sí | Fecha cuando se resolvió |
| created_at | TIMESTAMP | No | Fecha creación |
| updated_at | TIMESTAMP | No | Última modificación |
| deleted_at | TIMESTAMP | Sí | Soft delete |

#### 4.1.3 Entidad: Estado

| Campo | Tipo | Nullable | Descripción |
|-------|------|----------|-------------|
| id | INT (PK) | No | Identificador único |
| nombre | VARCHAR(50) | No | Nombre del estado |
| color | VARCHAR(7) | No | Color hex para badge |
| orden | INT | No | Orden de visualización |
| created_at | TIMESTAMP | No | Fecha creación |
| updated_at | TIMESTAMP | No | Última modificación |

#### 4.1.4 Entidad: HistorialEstado

| Campo | Tipo | Nullable | Descripción |
|-------|------|----------|-------------|
| id | INT (PK) | No | Identificador único |
| incidencia_id | INT (FK) | No | Incidencia relacionada |
| estado_anterior_id | INT (FK) | Sí | Estado anterior |
| estado_nuevo_id | INT (FK) | No | Nuevo estado |
| usuario_id | INT (FK) | No | Usuario que hizo el cambio |
| comentario | TEXT | Sí | Comentario del cambio |
| created_at | TIMESTAMP | No | Fecha del cambio |

#### 4.1.5 Entidad: IncidenciaResponsable (Tabla Pivote)

| Campo | Tipo | Nullable | Descripción |
|-------|------|----------|-------------|
| id | INT (PK) | No | Identificador único |
| incidencia_id | INT (FK) | No | Incidencia relacionada |
| usuario_id | INT (FK) | No | Usuario responsable |
| rol | ENUM('responsable', 'apoyo') | No | Rol del responsable |
| created_at | TIMESTAMP | No | Fecha asignación |
| updated_at | TIMESTAMP | No | Última modificación |

#### 4.1.6 Entidad: Comentario

| Campo | Tipo | Nullable | Descripción |
|-------|------|----------|-------------|
| id | INT (PK) | No | Identificador único |
| incidencia_id | INT (FK) | No | Incidencia relacionada |
| usuario_id | INT (FK) | No | Autor del comentario |
| texto | TEXT | No | Contenido del comentario |
| created_at | TIMESTAMP | No | Fecha creación |
| updated_at | TIMESTAMP | No | Última modificación |
| deleted_at | TIMESTAMP | Sí | Soft delete |

#### 4.1.7 Entidad: Pais

| Campo | Tipo | Nullable | Descripción |
|-------|------|----------|-------------|
| id | INT (PK) | No | Identificador único |
| nombre | VARCHAR(100) | No | Nombre del país |
| codigo | VARCHAR(3) | No | Código ISO |
| estado | BOOLEAN | No | Activo/Inactivo |
| created_at | TIMESTAMP | No | Fecha creación |
| updated_at | TIMESTAMP | No | Última modificación |

#### 4.1.8 Entidad: Provincia

| Campo | Tipo | Nullable | Descripción |
|-------|------|----------|-------------|
| id | INT (PK) | No | Identificador único |
| nombre | VARCHAR(100) | No | Nombre de la provincia |
| pais_id | INT (FK) | No | País relacionado |
| estado | BOOLEAN | No | Activo/Inactivo |
| created_at | TIMESTAMP | No | Fecha creación |
| updated_at | TIMESTAMP | No | Última modificación |

#### 4.1.9 Entidad: Ciudad

| Campo | Tipo | Nullable | Descripción |
|-------|------|----------|-------------|
| id | INT (PK) | No | Identificador único |
| nombre | VARCHAR(100) | No | Nombre de la ciudad |
| provincia_id | INT (FK) | No | Provincia relacionada |
| estado | BOOLEAN | No | Activo/Inactivo |
| created_at | TIMESTAMP | No | Fecha creación |
| updated_at | TIMESTAMP | No | Última modificación |

#### 4.1.10 Entidad: Tipo

| Campo | Tipo | Nullable | Descripción |
|-------|------|----------|-------------|
| id | INT (PK) | No | Identificador único |
| nombre | VARCHAR(100) | No | Nombre del tipo |
| estado | BOOLEAN | No | Activo/Inactivo |
| created_at | TIMESTAMP | No | Fecha creación |
| updated_at | TIMESTAMP | No | Última modificación |

#### 4.1.11 Entidad: Subtipo

| Campo | Tipo | Nullable | Descripción |
|-------|------|----------|-------------|
| id | INT (PK) | No | Identificador único |
| nombre | VARCHAR(100) | No | Nombre del subtipo |
| tipo_id | INT (FK) | No | Tipo relacionado |
| estado | BOOLEAN | No | Activo/Inactivo |
| created_at | TIMESTAMP | No | Fecha creación |
| updated_at | TIMESTAMP | No | Última modificación |

#### 4.1.12 Entidad: Notificacion

| Campo | Tipo | Nullable | Descripción |
|-------|------|----------|-------------|
| id | INT (PK) | No | Identificador único |
| usuario_id | INT (FK) | No | Destinatario |
| tipo | ENUM('asignacion', 'cambio_estado', 'comentario') | No | Tipo de notificación |
| titulo | VARCHAR(200) | No | Título de la notificación |
| mensaje | TEXT | No | Contenido |
| incidencia_id | INT (FK) | No | Incidencia relacionada |
| leido | BOOLEAN | No | Estado de lectura |
| leido_en | TIMESTAMP | Sí | Fecha cuando se leyó |
| created_at | TIMESTAMP | No | Fecha creación |
| updated_at | TIMESTAMP | No | Última modificación |

### 4.2 Diagrama de Relaciones (ER)

```
┌─────────────┐       ┌─────────────────┐       ┌─────────────┐
│   Usuario   │       │   Incidencia    │       │    Estado   │
│─────────────│       │─────────────────│       │─────────────│
│ PK id       │       │ PK id           │       │ PK id       │
│    nombre   │       │    titulo       │       │    nombre   │
│    email    │       │    descripcion  │       │    color    │
│    password │       │ FK prioridad    │       │    orden    │
│    rol      │       │ FK ubicacion_id │       └─────────────┘
└─────────────┘       │ FK tipo_id      │              │
      │               │ FK subtipo_id   │              │
      │               │ FK estado_id    │◄─────────────┘
      │               │ FK usuario_crea │
      │               └────────┬────────┘
      │                        │
      │    ┌───────────────────┼───────────────────┐
      │    │                   │                   │
      ▼    ▼                   ▼                   ▼
┌─────────────┐   ┌─────────────────────┐   ┌────────────┐
│  Incidencia │   │  IncidenciaUsuario   │   │ Comentario │
│ Responsable │   │─────────────────────│   │────────────│
│─────────────│   │ PK id               │   │ PK id      │
│ FK incid_id │   │ FK incidencia_id    │   │ FK incid   │
│ FK usuario  │   │ FK usuario_id       │   │ FK usuario │
│    rol      │   │ FK rol             │   │    texto   │
└─────────────┘   └─────────────────────┘   └────────────┘

┌─────────┐   ┌────────────┐   ┌──────────┐
│   Pais  │   │  Provincia │   │  Ciudad  │
│─────────│   │────────────│   │──────────│
│ PK id   │◄──│ FK pais_id │   │          │
│    nombre│   │ PK id      │◄──│FK provinci│
│    codigo│   │    nombre  │   │ PK id    │
└─────────┘   └────────────┘   │   nombre  │
                               └──────────┘

┌─────────┐   ┌────────────┐
│   Tipo  │   │  Subtipo   │
│─────────│   │────────────│
│ PK id   │◄──│ FK tipo_id │
│    nombre│   │ PK id      │
└─────────┘   │   nombre   │
              └────────────┘

┌───────────────┐
│  Notificacion │
│───────────────│
│ PK id         │
│ FK usuario_id │
│    tipo       │
│    titulo     │
│    mensaje    │
│ FK incid_id   │
│    leido      │
│    leido_en   │
└───────────────┘
```

---

## 5. Apéndices

### 5.1 Matriz de Trazabilidad

| Requisito | Tipo | Prioridad | Módulo Related | Caso de Prueba |
|-----------|------|-----------|----------------|----------------|
| RF-FUNC-001 | Funcional | Alta | Módulo 01 | CP-01-01-F, CP-01-01-B |
| RF-FUNC-002 | Funcional | Alta | Módulo 01 | CP-01-02-F, CP-01-02-B |
| RF-FUNC-003 | Funcional | Alta | Módulo 01 | CP-01-03-F, CP-01-03-B |
| RF-FUNC-006 | Funcional | Alta | Módulo 02 | CP-02-01-F, CP-02-01-B |
| RF-FUNC-007 | Funcional | Alta | Módulo 02 | CP-02-02-F, CP-02-02-B |
| RF-FUNC-008 | Funcional | Alta | Módulo 02 | CP-02-03-F, CP-02-03-B |
| RF-FUNC-009 | Funcional | Alta | Módulo 03 | CP-03-01-F, CP-03-01-B |
| RF-FUNC-010 | Funcional | Media | Módulo 03 | CP-03-02-F, CP-03-02-B |
| RF-FUNC-012 | Funcional | Alta | Módulo 04 | CP-04-01-F, CP-04-01-B |
| RF-FUNC-013 | Funcional | Alta | Módulo 04 | CP-04-02-F, CP-04-02-B |
| RF-FUNC-015 | Funcional | Alta | Módulo 05 | CP-05-01-F, CP-05-01-B |
| RF-FUNC-016 | Funcional | Alta | Módulo 05 | CP-05-02-F, CP-05-02-B |
| RF-FUNC-017 | Funcional | Alta | Módulo 06 | CP-06-01-F, CP-06-01-B |
| RF-FUNC-018 | Funcional | Alta | Módulo 06 | CP-06-02-F, CP-06-02-B |
| RF-FUNC-019 | Funcional | Media | Módulo 07 | CP-07-01-F, CP-07-01-B |
| RF-FUNC-020 | Funcional | Media | Módulo 07 | CP-07-02-F, CP-07-02-B |
| RF-FUNC-021 | Funcional | Alta | Módulo 08 | CP-08-01-F, CP-08-01-B |
| RF-FUNC-022 | Funcional | Alta | Módulo 08 | CP-08-02-F, CP-08-02-B |
| RF-FUNC-023 | Funcional | Alta | Módulo 08 | CP-08-03-F, CP-08-03-B |
| RF-FUNC-024 | Funcional | Alta | Módulo 09 | CP-09-01-F, CP-09-01-B |
| RF-FUNC-025 | Funcional | Alta | Módulo 09 | CP-09-02-F, CP-09-02-B |
| RF-FUNC-026 | Funcional | Alta | Módulo 09 | CP-09-03-F, CP-09-03-B |
| RS-001 | Seguridad | Alta | Todos | Validación de contraseñas |
| RS-002 | Seguridad | Alta | Backend | Prepared statements |
| RS-003 | Seguridad | Alta | Frontend | Escape de HTML |
| RR-001 | Rendimiento | Alta | Todos | Tiempo respuesta < 2s |

### 5.2 Glosario

| Término | Definición |
|---------|------------|
| **API REST** | Estilo arquitectural para servicios web que utiliza HTTP para transferir datos |
| **Cascada** | Mecanismo de selección donde la selección de un nivel habilita el siguiente |
| **Docker** | Plataforma de contenedores que permite automatizar el despliegue de aplicaciones |
| **Endpoints** | Puntos de acceso de una API REST |
| **FK (Foreign Key)** | Llave foránea que establece la relación entre tablas |
| **Payload** | Datos enviados en una petición HTTP |
| **Soft Delete** | Eliminación lógica donde el registro no se borra físicamente de la BD |
| **Token Bearer** | Token de autenticación enviado en el header Authorization |
| **Middleware** | Software que actúa como intermediario entre el cliente y el servidor |

---

## Información del Documento

| Atributo | Valor |
|----------|-------|
| **Título** | Especificación de Requisitos de Software (SRS) |
| **Proyecto** | Sistema Web de Gestión de Incidencias Georreferenciadas |
| **Versión** | 1.0 |
| **Fecha de creación** | 08 de junio de 2026 |
| **Autores** | Equipo de Proyecto (3 integrantes) |
| **Estado** | Aprobado para Desarrollo |
| **Referencias** | IEEE 830-1998, ISO/IEC 25000, ISO/IEC 25010 |

---

*Documento elaborado siguiendo el estándar IEEE 830 para Especificación de Requisitos de Software.*