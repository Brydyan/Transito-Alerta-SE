# Tasks - Servicios Nativos de Dispositivo (Feature 11)

- [x] T1 — Modificar `src/app/core/services/geolocation.service.ts` para exportar la interfaz estricta `Coordinates` con sus atributos base (latitude, longitude, accuracy, timestamp). Cubre: R1.
- [x] T2 — Agregar a `GeolocationService` el método `watchLocation(): Observable<Coordinates>` que registre un event listener en el hardware nativo y controle la denegación de permisos emitiendo un error. Cubre: R1, R2.
- [x] T3 — Crear el archivo `src/app/core/services/image-compressor.service.ts` y proveerlo en root de Angular. Cubre: R3.
- [x] T4 — Implementar el método asíncrono `compressImage(file: File, quality = 0.7)` dentro de `ImageCompressorService` orquestando `FileReader` y la etiqueta `Canvas` para redimensionamiento WebP en cliente. Cubre: R4.
- [x] T5 — Implementar en el mismo servicio el método `getFileSizeKB(blob: Blob): number` devolviendo su tamaño calculado sobre factor 1024. Cubre: R5.
- [x] T6 — Añadir las pruebas unitarias simples (`.spec.ts`) para garantizar que Angular inyecte exitosamente el `ImageCompressorService`.
