# Spec: Admin — User Creation Form (Frontend)

> **Mock**: `docs/mock/03-02-nuevo-usuario.png`
> **Ruta**: `/app/admin/usuarios/new`
> **Tipo**: Página (sidebar y header global quedan visibles — ver
> D-frontend-1 del design).

---

## Purpose

Formulario de alta de usuarios en `/app/admin/usuarios/new`,
alcanzable desde el botón **"+ Nuevo usuario"** del listado de
usuarios (header de `UsersListComponent`). Reemplaza al actual
`UserFormComponent` que la ruta carga y que no coincide con el
mock. La pantalla mantiene la sidebar de GeoReporta y el
breadcrumb `GESTIÓN > USUARIOS > NUEVO REGISTRO`.

El form tiene **6 secciones** en 2 columnas:

- **Izquierda**: Perfil de Usuario (foto) + Datos Personales
  (nombre, apellido, email, teléfono) + Asignación de Entidad
  (organización)
- **Derecha**: Tarjeta de Vista Previa del Rol (dropdown + ACCESO
  A / SIN ACCESO) + Alcance Territorial / Jurisdicción (cantón /
  parroquia / zona — **deshabilitados F7**) + Configuración de
  Cuenta e Invitación (toggle, estado, canal)

---

## Requirements

### Requirement: Form Opens from "+ Nuevo Usuario" Button

El sistema DEBE abrir la pantalla `/app/admin/usuarios/new` cuando
el admin clickea **"+ Nuevo Usuario"** en
`/app/admin/usuarios`. La pantalla renderiza el layout del mock
03-02 (no un 404, no el `UserFormComponent` viejo).

#### Scenario: Botón navega correctamente

- **GIVEN** admin está en `/app/admin/usuarios`
- **WHEN** clickea el botón "+ Nuevo Usuario"
- **THEN** la URL pasa a `/app/admin/usuarios/new`
- **AND** se renderiza el breadcrumb `GESTIÓN > USUARIOS > NUEVO REGISTRO`
- **AND** se renderiza el título "Nuevo Usuario" con la
  descripción "Complete los datos personales y configure los
  permisos de acceso para el nuevo integrante del sistema
  GeoReporta."
- **AND** los botones "Cancelar" (con `×`) y "Guardar Usuario"
  (purple CTA) son visibles en la parte superior derecha
- **AND** las 6 secciones del mock son visibles (3 a la
  izquierda, 3 a la derecha)

---

### Requirement: Formulario Carga Roles y Organizaciones

El sistema MUST poblar los dropdowns "Tipo de Rol Seleccionado" y
"Organización Pertinente" desde el backend al abrir la pantalla.

#### Scenario: Dropdowns poblados al cargar

- **GIVEN** admin navega a `/app/admin/usuarios/new`
- **WHEN** la pantalla termina de inicializar
- **THEN** se hizo `GET /api/users/form-data`
- **AND** el dropdown de Rol muestra todas las opciones (menos
  los system-only si el actor no es master, comportamiento
  existente en `UsersService.getFormData`)
- **AND** el dropdown de Organización muestra las opciones
  aplicables al actor (master: todas; org/admin: sólo su org)

#### Scenario: Fallo al cargar lookups

- **GIVEN** `GET /api/users/form-data` retorna 500
- **WHEN** la pantalla termina de inicializar
- **THEN** se muestra un banner de error: "No se pudieron cargar
  los datos del formulario"
- **AND** los dropdowns quedan vacíos
- **AND** el botón "Guardar Usuario" está deshabilitado

---

### Requirement: Avatar Upload with Preview

El sistema MUST permitir subir una foto de perfil (JPG, PNG, WEBP)
máximo 2MB, con preview local antes del submit.

#### Scenario: Foto válida se previsualiza

- **GIVEN** el formulario está abierto
- **WHEN** el admin clickea "Subir foto de perfil" y selecciona
  un JPG válido (< 2MB)
- **THEN** la foto aparece en el círculo de preview a la
  izquierda (avatar preview)
- **AND** el label cambia a "Cambiar foto" o muestra el nombre
  del archivo

#### Scenario: Archivo inválido rechazado

- **GIVEN** el modal está abierto
- **WHEN** el admin intenta subir un PDF o archivo > 2MB
- **THEN** se muestra error inline: "Archivo no soportado. JPG,
  PNG, WEBP máximo 2MB"
- **AND** el preview mantiene el avatar por defecto (placeholder
  con iniciales o icono `person`)

---

### Requirement: Personal Data Entry

El sistema MUST capturar nombre, apellido, email corporativo y
teléfono.

#### Scenario: Campos obligatorios validados en frontend

- **GIVEN** el formulario está completo excepto el email
- **WHEN** clickea "Guardar Usuario"
- **THEN** se bloquea el envío
- **AND** aparece mensaje de error bajo el campo email: "Email
  corporativo es obligatorio"

#### Scenario: Email con formato inválido

- **GIVEN** el campo email tiene "juan@"
- **WHEN** el campo pierde el foco (blur)
- **THEN** aparece mensaje: "Ingrese un email válido"

#### Scenario: Email duplicado (409 del backend)

- **GIVEN** el email "juan@municipio.ec" ya existe en BD
- **WHEN** el admin clickea "Guardar Usuario" con ese email
- **THEN** `POST /api/users` retorna 409
- **AND** se muestra toast de error: "Email ya registrado en el
  sistema"
- **AND** el modal permanece abierto para reintento

---

### Requirement: Role Selection with Permission Preview

El sistema MUST mostrar permisos del rol seleccionado
dinámicamente, divididos en dos tarjetas: "ACCESO A" (verde) y
"SIN ACCESO" (rojo).

#### Scenario: Selección de rol dispara fetch de permisos

- **GIVEN** el dropdown "Tipo de Rol Seleccionado" tiene opciones
  cargadas
- **WHEN** el admin selecciona "admin_org"
- **THEN** se hace `GET /api/roles/{id}/permissions`
- **AND** la tarjeta "ACCESO A" muestra hasta 4 permisos del rol
  (ej: "READ dashboard", "READ incidents")
- **AND** la tarjeta "SIN ACCESO" muestra hasta 2 permisos del
  catálogo que el rol no tiene (ej: "UPDATE roles", "READ audit")
- **OR** "Sin permisos restringidos" si el rol tiene todos los
  permisos del catálogo

#### Scenario: Sin rol seleccionado, preview vacío

- **GIVEN** el dropdown de rol está en "Asignar rol..."
- **WHEN** la pantalla termina de inicializar
- **THEN** la tarjeta derecha de preview muestra mensaje:
  "Selecciona un rol para ver sus permisos"
- **AND** las dos tarjetas ACCESO/SIN ACCESO están vacías o no se
  renderizan

#### Scenario: Rol opcional (no bloquea submit)

- **GIVEN** el formulario está completo pero sin rol
- **WHEN** clickea "Guardar Usuario"
- **THEN** el usuario se crea con `role_id = null` en el backend
- **AND** un rol puede asignarse después vía PATCH
  `/users/:id/organization` o asignación de rol

---

### Requirement: Organization Assignment

El sistema MUST permitir asignar una organización del dropdown
"Organización Pertinente".

#### Scenario: Organización seleccionada

- **GIVEN** hay N organizaciones en el dropdown
- **WHEN** el admin selecciona "Municipalidad Norte"
- **THEN** el campo muestra "Municipalidad Norte"
- **AND** se envía `organization_id` (UUID) en el payload

#### Scenario: Organización requerida si rol es admin/operador_org

- **GIVEN** el admin selecciona un rol con `name` en
  `['admin_org', 'operador_org']`
- **AND** deja la organización vacía
- **WHEN** intenta hacer submit
- **THEN** aparece warning inline bajo el dropdown de
  organización: "El rol {nombre_rol} requiere una organización"
- **AND** el botón "Guardar Usuario" está deshabilitado

---

### Requirement: Invitation Toggle

El sistema MUST permitir toggle "Envío de invitación" que controla
si se envía email al usuario tras la creación.

#### Scenario: Invitación ON, email se envía

- **GIVEN** el toggle "Envío de invitación" está ON (default)
- **AND** el form tiene email + rol + organización
- **WHEN** el admin clickea "Guardar Usuario"
- **THEN** `POST /api/users` se llama con los datos del form
- **AND** si retorna 201, se llama `POST /api/admin/users/invite`
  con `{email, role_id, organization_id}`
- **AND** el usuario recibe correo con link de aceptación

#### Scenario: Invitación OFF, sin email

- **GIVEN** el toggle "Envío de invitación" está OFF
- **WHEN** clickea "Guardar Usuario"
- **THEN** `POST /api/users` se llama
- **AND** `POST /api/admin/users/invite` **NO** se llama
- **AND** el usuario se crea sin envío de correo

#### Scenario: Invitación falla tras creación exitosa

- **GIVEN** el toggle está ON
- **WHEN** `POST /api/users` retorna 201
- **AND** `POST /api/admin/users/invite` retorna 4xx/5xx
- **THEN** se muestra toast warning: "Usuario creado, pero la
  invitación no se envió. Podés reinvitarlo desde la lista."
- **AND** la navegación al listado ocurre de todas formas

---

### Requirement: Geographic Location Fields (OUT OF SCOPE F7)

El sistema MUST renderizar los inputs de "Cantón / Parroquia
Asignada" y "Zona / Sector Operativo" según el mock, pero
**deshabilitados** hasta F7.

#### Scenario: Inputs de geolocalización deshabilitados

- **GIVEN** la pantalla está cargada
- **WHEN** el admin intenta interactuar con los inputs de cantón /
  parroquia / zona
- **THEN** los inputs están deshabilitados (atributo `disabled`,
  estilo visual atenuado)
- **AND** aparece tooltip al hover: "Disponible en F7"

---

### Requirement: Initial Status and Notification Channel (FIXED)

El sistema MUST mostrar los dropdowns "Estado inicial" y "Canal
de notificaciones preferido" según el mock, con un único valor
visible y deshabilitado.

#### Scenario: Estado inicial fijo en Activo

- **GIVEN** la pantalla está cargada
- **WHEN** el admin observa el dropdown "Estado inicial"
- **THEN** muestra "Activo" como único valor
- **AND** el dropdown está deshabilitado

#### Scenario: Canal fijo en Correo Electrónico

- **GIVEN** la pantalla está cargada
- **WHEN** el admin observa el dropdown "Canal de notificaciones
  preferido"
- **THEN** muestra "Correo Electrónico" como único valor
- **AND** el dropdown está deshabilitado

---

### Requirement: Form Submission and Success State

El sistema MUST enviar `POST /api/users` con todos los datos y,
en éxito, opcionalmente `PATCH /avatar` y `POST /invite`,
cerrando la pantalla y volviendo al listado.

#### Scenario: Creación exitosa sin foto, sin invitación

- **GIVEN** todos los campos obligatorios están llenos
- **AND** el toggle "Envío de invitación" está OFF
- **AND** no se seleccionó foto
- **WHEN** clickea "Guardar Usuario"
- **THEN** se envía `POST /api/users` con payload snake_case
- **AND** el servidor retorna 201 con el user creado
- **AND** se muestra toast "Usuario creado correctamente"
- **AND** se navega a `/app/admin/usuarios`
- **AND** la lista se recarga mostrando el nuevo usuario

#### Scenario: Creación exitosa con foto, con invitación

- **GIVEN** el form está completo y la foto fue seleccionada
- **AND** el toggle "Envío de invitación" está ON
- **WHEN** clickea "Guardar Usuario"
- **THEN** `POST /api/users` retorna 201
- **AND** `PATCH /api/users/{id}/avatar` se llama con FormData
- **AND** `POST /api/admin/users/invite` se llama con email
- **AND** todos los toast correspondientes se muestran en orden
- **AND** se navega al listado

#### Scenario: Foto falla pero usuario creado (warning)

- **GIVEN** se seleccionó una foto
- **WHEN** `POST /api/users` retorna 201
- **AND** `PATCH /api/users/{id}/avatar` retorna 4xx/5xx
- **THEN** se muestra toast warning: "Usuario creado, pero la
  foto no se pudo subir. Podés actualizarla desde la edición."
- **AND** la navegación al listado ocurre de todas formas
- **AND** el usuario aparece en la lista sin foto

#### Scenario: Error del servidor en POST /users

- **GIVEN** el POST retorna 400 (validación) o 500
- **WHEN** el servidor responde
- **THEN** se muestra toast de error con el mensaje del backend
- **AND** la pantalla permanece abierta para reintento
- **AND** el botón "Guardar Usuario" se rehabilita

---

### Requirement: Modal Cancel

El sistema MUST descartar los cambios y volver al listado al
clickear "Cancelar" o la `×`.

#### Scenario: Cancelar descarta cambios

- **GIVEN** el formulario tiene datos ingresados (sin guardar)
- **WHEN** clickea el botón "Cancelar" o la `×`
- **THEN** la URL vuelve a `/app/admin/usuarios`
- **AND** la lista NO se recarga con datos nuevos
- **AND** no se envía ningún request al backend

#### Scenario: Cancelar con cambios significativos pide confirmación

- **GIVEN** el admin ha tocado al menos un campo
- **WHEN** intenta cancelar (botón "Cancelar" o `×`)
- **THEN** aparece un `ConfirmDialog` (F0): "¿Descartar los
  cambios? Esta acción no se puede deshacer."
- **AND** confirmar descarta; cancelar cierra el diálogo y
  mantiene la pantalla

> **Nota**: Si no se tocó ningún campo, el cancelar es directo,
> sin confirmación.

---

## Out of Scope (F7+)

- **Geolocalización automática** (cantón/parroquia/zona — los
  inputs del mock existen pero disabled hasta F7).
- **Canal SMS** (sólo "Correo Electrónico" en F6).
- **Estado inicial configurable** (siempre `Activo` en F6).
- **Reintento de subida de foto tras error** (queda como warning,
  se resuelve en F6.5.2 al editar).
- **Validación asíncrona de unicidad de email** (sin endpoint
  dedicado; el backend rechaza con 409 al submit).
- **Drag & drop, crop, resize de la imagen** (sólo botón +
  click-to-upload).
- **Permisos directos por usuario** (sólo se heredan del rol, a
  diferencia del edit que tiene `directPermissions`).
- **Edición de usuario existente** (`UserFormComponent` actual se
  mantiene bajo `:id/edit`; rediseño de edición es F6.5.2).
