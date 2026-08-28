# Tareas: UI de Autenticación y Enrutamiento Base

- [x] 1. Crear/Modificar el archivo `src/app/app.routes.ts` con la ruta de `/login` configurada con lazy loading y redirecciones necesarias.
- [x] 2. Integrar los guards de enrutamiento previamente desarrollados a la configuración de `app.routes.ts`.
- [x] 3. Refactorizar la plantilla HTML aportada en `login.component.html` para migrar completamente de Bootstrap a Tailwind CSS como herramienta de estilos.
- [x] 4. Reemplazar cualquier CSS personalizado/scss de Bootstrap por las clases utilitarias equivalentes de Tailwind CSS.
- [x] 5. Configurar la lógica del formulario reactivo en `login.component.ts` (con sus respectivas validaciones).
- [x] 6. Implementar el submit del formulario consumiendo el `AuthService` y enviando el `device_uuid` mockeado al backend.
- [x] 7. Tras un login exitoso, redirigir al usuario utilizando el `Router` hacia la ruta configurada para el `DashboardComponent` (`/dashboard`).
- [x] 8. Configurar el enrutamiento (`app.routes.ts`) para incluir la ruta del dashboard protegida por el guard y la redirección base.
- [x] 9. Limpiar los archivos generados por defecto por Angular (reemplazar el contenido de `app.html` por un simple `<router-outlet></router-outlet>` o moverlo a un template inline en `app.ts` y eliminar estilos residuales).
