# Diseño: UI de Autenticación y Enrutamiento Base

## Arquitectura y Patrones

- **Standalone Components:** El `LoginComponent` (en `src/app/features/auth/login/`) se implementará como un componente de Angular 17+ utilizando `standalone: true`.
- **Jerarquía de Rutas:** Se implementará el archivo `app.routes.ts` siguiendo el modelo propuesto en `app.router-example.ts`. Se incluirá la ruta `/login` protegida por el guard de invitados y con su respectivo lazy loading.
- **Tailwind CSS:** Se reemplazará cualquier rastro de bootstrap por Tailwind CSS. El layout y los estilos heredados del framework original se traducirán a clases de utilidad de Tailwind CSS. Se emulará la distribución a dos columnas y detalles visuales (el banner heroico y el panel de formulario).
  - Columna izquierda debe ser para una imagen representativa de la CTE y el panel de la derecha para el formulario de regitro. (Agregué archivos que reflejan un login en: frontend/src/app/features/auth/login/\*\*)
- **Manejo de Formularios:** Se usará `ReactiveFormsModule` de Angular para modelar y controlar los campos del formulario de inicio de sesión de forma escalable.

## Decisiones Técnicas

- **Mock de Login:** En la integración con el servicio `AuthService`, el envío del formulario ensamblará los campos recolectados e inyectará un UUID estático como `device_uuid` para satisfacer provisionalmente la firma de la API.
- **Redirección:** Tras validarse la autenticación, se redirigirá automáticamente a la ruta asociada al `DashboardComponent` usando Angular Router.
- **Limpieza (Clean-up):** Como el sistema ya pasa a estar regido por rutas, se eliminará el contenido legacy de `app.html` generado por Angular en la inicialización (los cientos de líneas con el banner de Angular) dejando únicamente `<router-outlet></router-outlet>`.
- **Estilos y Maquetación:** Se debe realizar una migración estricta de Bootstrap a Tailwind CSS como herramienta de estilos. Todo el HTML aportado que use clases de Bootstrap (ej. `d-flex`, `col-lg-6`, `mb-3`, `btn-brand-primary`) será refactorizado utilizando puramente las utility-classes de Tailwind CSS, eliminando cualquier dependencia de Bootstrap.
