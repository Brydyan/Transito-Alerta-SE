# Requirements - Persistencia Offline (IndexedDB + PWA)

## R1
El sistema DEBE registrar e instalar un Service Worker utilizando `@angular/pwa` para habilitar el caché de la aplicación estática.

## R2
CUANDO el usuario genere un reporte de tránsito o actualice un estado y el dispositivo no tenga conexión a la red, el sistema DEBE guardar los datos de la petición de manera estructurada en IndexedDB.

## R3
SI ocurre un fallo de red al intentar enviar datos al servidor (POST/PUT), ENTONCES el sistema (a través de un Interceptor HTTP) DEBE interceptar la petición fallida y encolar la sincronización guardando el payload y el endpoint en IndexedDB.

## R4
CUANDO el dispositivo recupere la conexión a internet (evento `online`), el sistema DEBE vaciar automáticamente la cola de sincronización de IndexedDB, reenviando las peticiones almacenadas al servidor.

## R5
SI el reenvío automático de una petición encolada falla por un error del servidor (ej. 400 Bad Request o 500 Internal Server Error, no por red), ENTONCES el sistema DEBE marcar esa petición como fallida permanentemente o descartarla, evitando un bucle infinito de reintentos.
