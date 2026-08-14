# Requirements - Implementación RBAC

## R1
CUANDO el usuario inicie sesión o recupere su sesión, el sistema DEBE proporcionar la lista completa de sus permisos concedidos (recurso y acción).

## R2
MIENTRAS un usuario no tenga permiso de lectura (`READ`) sobre un recurso específico, el frontend DEBE ocultar el enlace de navegación hacia ese recurso en el menú lateral.

## R3
MIENTRAS un usuario no tenga el permiso correspondiente de escritura (`CREATE`, `UPDATE`, `DELETE`) en un recurso, el frontend DEBE ocultar o deshabilitar los botones de acción pertinentes en la interfaz de usuario de dicho recurso.

## R4
CUANDO un usuario intente consumir un endpoint de la API REST para un recurso sobre el cual no tiene la acción autorizada, el sistema DEBE rechazar la petición con un código HTTP 403 Forbidden.
