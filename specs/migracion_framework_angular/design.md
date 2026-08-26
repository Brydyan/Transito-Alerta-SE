# Design — migracion_framework_angular

## Archivos a Modificar / Crear

1. `frontend/src/main.ts` — Punto de entrada de bootstrap standalone mediante `bootstrapApplication`.
2. `frontend/src/app/app.config.ts` — Configuración centralizada de proveedores (providers) y rutas para la aplicación standalone.
3. `frontend/src/app/app.ts` — Componente principal standalone de la aplicación (`App`).
4. `frontend/src/app/app.routes.ts` — Registro de rutas de navegación.
5. `frontend/src/app/services/alert-system.service.ts` — Servicio injectable para validar la inyección de dependencias (DI) nativa.
6. `frontend/src/app/app.spec.ts` — Tests unitarios de verificación del componente standalone y servicios.

## Firmas y Estructuras Nuevas

- **bootstrapApplication(App, appConfig)**: Inicialización directa del componente raíz standalone.
- **ApplicationConfig**: Configuración de `providers` globales en `app.config.ts` sin usar `NgModule`.
- **AlertSystemService**:
  ```typescript
  @Injectable({
    providedIn: 'root'
  })
  export class AlertSystemService {
    getSystemStatus(): string;
  }
  ```

## Excepciones

- No se aplican excepciones. Todos los componentes nuevos deben cumplir con la arquitectura standalone.

## Alternativas Descartadas

- **Uso de NgModules heredados (`AppModule`)**: Descartado. Las versiones modernas de Angular (17+) recomiendan de forma predeterminada el enfoque standalone para eliminar boilerplate, simplificar el árbol de dependencias y optimizar la carga perezosa (lazy loading).
