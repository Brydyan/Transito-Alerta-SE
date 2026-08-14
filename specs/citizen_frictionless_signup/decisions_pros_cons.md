# Análisis de Decisiones: Pros y Contras

Como parte del proceso de aprendizaje, aquí se documentan las decisiones clave de diseño tomadas para la feature **"Registro Público de Ciudadanos sin Fricción"**, evaluando sus ventajas y desventajas.

## 1. Registro "Sin Fricción" (Sin confirmación de Email / OTP inicial)

Se decidió que el registro marque automáticamente la cuenta como verificada (`email_verified_at = now()`) y permita el acceso inmediato sin enviar un código de verificación.

**Pros:**
- **Máxima conversión:** Elimina la barrera de entrada. Un ciudadano que ve una incidencia en la calle puede registrarse y reportarla en menos de un minuto.
- **Menor carga en infraestructura:** Ahorra costos y procesamiento al no tener que enviar correos electrónicos transaccionales para cada nuevo usuario.
- **Simplicidad en el Frontend:** El flujo de usuario es lineal (Registro -> Éxito -> Uso de la app), sin estados intermedios de "Esperando verificación".

**Contras:**
- **Cuentas falsas / Spam:** Cualquier persona puede inventar un correo falso y crear una cuenta. Esto podría llenar la base de datos de usuarios "basura" y reportes falsos.
- **Pérdida de contacto:** Si el usuario olvida su contraseña y usó un correo falso o con errores tipográficos, será imposible recuperar la cuenta.

---

## 2. Unificar a los Ciudadanos en la tabla `users` (Rechazo de Múltiples Tablas)

Se optó por mantener a los ciudadanos en la misma tabla `users` que los administradores, operadores e instituciones, diferenciándolos únicamente mediante el sistema de Roles (RBAC).

**Pros:**
- **Autenticación simplificada:** Laravel maneja la autenticación de forma nativa con una sola tabla. No es necesario crear múltiples *Guards* ni lógicas de login complejas.
- **Relaciones limpias en base de datos:** La tabla de incidencias solo necesita un `user_id` para saber quién reportó, sin importar su tipo.
- **Escalabilidad del control de acceso:** El sistema de permisos y roles (RBAC) centralizado es más fácil de mantener.

**Contras:**
- **Campos nulos (Sparse Data):** Es probable que la tabla `users` tenga campos que los ciudadanos no usan (por ejemplo, `institution_id` o `employee_number`), los cuales estarán siempre en `NULL`.
- **Riesgo de escalamiento de privilegios:** Si hay un error en el código (por ejemplo, si no se forzara el rol "Ciudadano" en el controlador), un usuario malintencionado podría inyectar un rol de "Admin" al registrarse.

---

## 3. Uso de un Endpoint Descriptivo (`POST /v1/auth/register-citizen`)

En lugar de usar un endpoint genérico como `/v1/register`, se especificó la entidad que se está registrando.

**Pros:**
- **Claridad del API:** Queda explícito que este endpoint tiene reglas de negocio exclusivas para ciudadanos (ej. asignación forzosa del rol ciudadano, no pide datos institucionales).
- **Extensibilidad:** Si en el futuro se necesita un registro público para otro tipo de actor, se puede crear `/v1/auth/register-organization` sin que choquen las rutas o la lógica del controlador.

**Contras:**
- **URLs ligeramente más largas:** Requiere escribir un poco más en el código del frontend.

---

## 4. Prevención de "Double-Submit" directamente en VanillaJS

Se añadió como requerimiento explícito que el botón de envío se deshabilite tras el primer clic.

**Pros:**
- **Mejor UX:** El usuario recibe feedback visual inmediato de que su petición se está procesando.
- **Prevención de errores en Backend:** Evita que lleguen múltiples peticiones de creación concurrentes que podrían generar errores de "Constraint Violation" (correo duplicado) en la base de datos y confundir al usuario.

**Contras:**
- **Requiere manejo de estado manual:** A diferencia de frameworks como React o Vue donde esto se hace casi automático con el estado del componente, en VanillaJS requiere manipular el DOM directamente (`btn.disabled = true/false`), lo que puede hacer el código un poco más verboso.
