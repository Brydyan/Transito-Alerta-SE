# Design - Servicios Nativos de Dispositivo (Feature 11)

## Arquitectura y Decisiones Técnicas

### 1. Extracción de Responsabilidades (SRP)
**Decisión:** Extraeremos la lógica de compresión de imágenes de Canvas API —que actualmente podría estar acoplada en utilitarios offline o componentes— hacia un `ImageCompressorService` puramente dedicado a esta labor.
**Justificación:** Esto permitirá que no solo el módulo de creación de reportes offline comprima imágenes, sino que futuros módulos (ej. la página de perfil para subir un avatar) puedan inyectar la misma lógica de redimensionamiento nativa en cliente.

### 2. Flujos RxJS vs Promesas
**Decisión:** El `GeolocationService` expondrá streams mediante RxJS (puesto que un *watchPosition* emite múltiples valores en el tiempo y encaja perfecto con `Observable`), mientras que el `ImageCompressorService` retornará `Promise<Blob>`.
**Justificación:** La compresión de una imagen mediante Canvas en cliente es una operación imperativa, asíncrona pero "one-shot" (un input, un output final). Modelarlo con Promises es más sencillo de consumir con `async/await` en los servicios offline en comparación con envolver un FileReader en RxJS para un solo evento.

### 3. API Nativa
Los servicios están directamente acoplados a APIs de navegador web (`navigator.geolocation`, `FileReader`, `HTMLCanvasElement`). Por este motivo, su ejecución debe contemplar posibles fallos en entornos donde no existan o el usuario los bloquee, retornando mensajes legibles mediante `reject` (para promesas) o `error` (para observables).

## Archivos a Crear / Modificar
- `[MOD] src/app/core/services/geolocation.service.ts`: Ya existente, requiere implementar `watchLocation()` y la interfaz tipada `Coordinates`.
- `[NEW] src/app/core/services/image-compressor.service.ts`: Abstracción global para compresión WebP.
- `[NEW] src/app/core/services/image-compressor.service.spec.ts`: Suite de pruebas base.
