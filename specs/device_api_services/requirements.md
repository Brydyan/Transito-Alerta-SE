# Requirements - Servicios Nativos de Dispositivo (Feature 11)

## R1
El sistema DEBE ampliar el servicio `GeolocationService` para que incluya la capacidad de suscribirse a un flujo continuo de coordenadas (método `watchLocation()` basado en `navigator.geolocation.watchPosition`).

## R2
El `GeolocationService` DEBE ser capaz de interceptar errores relacionados a la disponibilidad del hardware o la denegación de permisos, exponiéndolos limpiamente en los observables de retorno.

## R3
El sistema DEBE extraer la lógica de procesamiento multimedia en un nuevo servicio inyectable llamado `ImageCompressorService`, cumpliendo con el Principio de Responsabilidad Única.

## R4
El `ImageCompressorService` DEBE exponer un método asíncrono (`compressImage`) que tome un objeto `File` y retorne una promesa resolviendo un `Blob` en formato `WebP` empleando la API de Canvas, permitiendo ajustar dinámicamente la compresión mediante un parámetro de calidad (default a `0.7`).

## R5
El `ImageCompressorService` DEBE incluir un método de utilidad (`getFileSizeKB`) que reciba un Blob y devuelva su peso aproximado en Kilobytes.
