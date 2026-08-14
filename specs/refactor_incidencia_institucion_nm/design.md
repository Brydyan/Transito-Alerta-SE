# Design: Refactor Relación Incidencia-Institución a N:M (Apoyo)

## Base de Datos
- **Opción Elegida: Modelo Mixto**. Se mantiene la columna `institucion_id` en la tabla `incidencias` como la institución "dueña" o principal (inferida del subTipo).
- Se creará la migración para la tabla pivote `incidencia_institucion_apoyo` con las columnas foráneas `incidencia_id` e `institucion_id` para almacenar a los invitados/apoyos.

## Modelos
- En `App\Models\Incidencia`: Se añadirá la relación `institucionesApoyo()` usando `belongsToMany(Institucion::class, 'incidencia_institucion_apoyo')`.

## Controladores y Servicios
- En `IncidenciaController@index` (`buildIncidenciaQuery`): Se ampliará el filtro para los usuarios de rol Institucion:
  ```php
  $query->where(function($q) use ($user) {
      $q->where('institucion_id', $user->institucion_id)
        ->orWhereHas('institucionesApoyo', function($subQ) use ($user) {
            $subQ->where('instituciones.id', $user->institucion_id);
        });
  });
  ```
- En `IncidenciaController@checkAccess`: Se modificará la validación para considerar los apoyos:
  ```php
  $incidencia->institucion_id == $user->institucion_id 
  || $incidencia->institucionesApoyo->contains('id', $user->institucion_id)
  ```
- En `IncidenciaService` (`createIncidencia` y `updateIncidencia`): 
  Se validará y procesará el array `instituciones_apoyo` que llegue en el `$request`. Luego de guardar/actualizar la incidencia principal, se usará `$incidencia->institucionesApoyo()->sync($institucionesApoyoIds)` asegurando filtrar para que no se incluya por error a la misma institución principal en la lista de apoyos.

## Request/Validation
- En `IncidenciasRequest`: Se validará el campo `instituciones_apoyo` (array, exists en instituciones, opcional).

## Frontend (VanillaJS)
- **Ciudadanos**: En el flujo de registro de la incidencia, se añadirá un modal o componente UI que liste las instituciones disponibles para que el ciudadano pueda solicitarlas explícitamente como apoyo.
- **Administradores y Supervisores**: En la pantalla de detalle de la incidencia y/o en el formulario de edición, se añadirá un selector múltiple que les permita asignar o quitar instituciones de apoyo sobre la marcha.
