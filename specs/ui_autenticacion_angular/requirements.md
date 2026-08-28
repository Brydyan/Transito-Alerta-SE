# Requerimientos: UI de Autenticación y Enrutamiento Base

## Descripción General
El sistema requiere una interfaz de usuario para el inicio de sesión adaptada a Angular 17+ y Tailwind CSS, junto con una configuración de enrutamiento principal.

## Requerimientos Funcionales
- El sistema DEBE proveer un componente de inicio de sesión (`LoginComponent`) en la ruta `/login`.
- El sistema DEBE cargar de manera perezosa (lazy loaded) el `LoginComponent` en la configuración de rutas `app.routes.ts`.
- El sistema DEBE redirigir a los usuarios y proteger el enrutamiento integrando los guards desarrollados (`authGuard` y `guestGuard`).
- El sistema DEBE simular la interacción con `AuthService` enviando un `device_uuid` mockeado al procesar el inicio de sesión.
- El sistema DEBE utilizar Tailwind CSS para maquetar el componente `LoginComponent`, basándose visualmente en el diseño original del proyecto base.
