# Requirements - Modelos Base y HTTP Wrapper (Feature 9)

## R1
El sistema DEBE contar con las interfaces de dominio base (`Incident`, `Comment`, `AuthResponse`, `User`) utilizando la notación `snake_case` para las propiedades, de modo que coincidan exactamente con la convención del contrato expuesto por el backend (definido en `T2_ANGULAR_SERVICES.md`).

## R2
Dentro del modelo `Incident`, el sistema DEBE definir las coordenadas geográficas usando estrictamente las claves `lat` y `lng` (y no `latitude` o `longitude`) para garantizar compatibilidad directa con las librerías de mapeo (ej. Leaflet).

## R3
El sistema DEBE implementar el servicio `HttpService` de forma inyectable a nivel global (`providedIn: 'root'`). Este servicio DEBE funcionar como un wrapper o envoltorio del `HttpClient` nativo de Angular y exponer firmas fuertemente tipadas para los métodos HTTP: `GET`, `POST`, `PATCH` y `DELETE`.

## R4
CUANDO el método `GET` de `HttpService` reciba un objeto opcional de parámetros (filters), el sistema DEBE mapear iterativamente estas propiedades a una instancia de `HttpParams` de Angular, para ser enviadas como query strings en la petición.

## R5
Todas las peticiones realizadas a través del `HttpService` DEBEN ser prefijadas con el string de la URL base configurada (ej. `/api`) apuntando al backend, evitando la duplicación de URLs en cada servicio individual que lo consuma.
