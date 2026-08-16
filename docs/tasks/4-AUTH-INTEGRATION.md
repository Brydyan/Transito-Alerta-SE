# 4: Integración de Autenticación y Permisos

## Estructura JWT y Flujo de Refresh

### Access Token (vida de 15 minutos)
```json
{
  "sub": "user-uuid",
  "typ": "anon|account",
  "jti": "unique-token-id",
  "pv": 1,
  "iat": 1692374400,
  "exp": 1692375300
}
```

**Claims**:
- `sub`: ID de usuario (device_uuid para anón, account_id para autenticado)
- `typ`: tipo de cuenta ('anon' para anónimo, 'account' para registrado)
- `jti`: identificador único de token (para rastreo de revocación en tabla Sessions)
- `pv`: versión de permisos (bumped cuando rol cambia, invalida caché Redis sin reissuance de token)

### Refresh Token (vida de 7 días)
```json
{
  "sub": "user-uuid",
  "jti": "refresh-token-id",
  "typ": "refresh",
  "iat": 1692374400,
  "exp": 1698558400
}
```

**Flujo de Refresh** (POST /api/auth/refresh):
1. Verificar firma + expiración de refresh token
2. Verificar `jti` no está en lista negra (Sessions.revoked_at IS NULL)
3. Generar nuevo access token (mismo `sub`, `iat` bumped)
4. Opcionalmente rotar refresh token (nuevo jti, viejo jti marcado revocado si usuario lo prefiere)
5. Retornar `{accessToken, refreshToken}` + info de sesión opcional

### Invalidación de Caché de Permisos (Diseño D2)

**Clave de Caché**: `perm:{user_id}` (Redis)  
**TTL**: 60 segundos (TTL corto asegura que cambios de rol se propaguen rápidamente)  
**Trigger de Invalidación**: `AuthService.invalidatePermissionCache(userId, pv)`

**Flujo en Cambio de Rol**:
1. `RolesService.assignRole(userId, roleId)` desnormaliza permisos de rol en fila de usuario
2. Bump `users.permission_version` (pv)
3. Llama `AuthService.invalidatePermissionCache(userId, pv)`
4. Siguiente solicitud del usuario cache-misses → reconstruye desde DB → usa nuevos permisos
5. JWT existente aún válido (TTL de token sin afectar), pero conjunto de permisos refrescado

**Beneficio**: Permisos cambian instantáneamente sin forzar reissuance de token (mejor UX para promociones de rol).

## Dispositivo UUID e Identidad Anónima (Diseño D1)

### Primer Dispositivo
**Flujo** (POST /api/auth/login):
1. Cliente envía `{device_uuid: "uuid-string"}`
2. Backend verifica si usuario con `device_uuid` existe
3. Si no, crear nueva fila `users`:
   ```sql
   INSERT INTO users (device_uuid, account_type, role_id, permissions, created_at)
   VALUES ('uuid', 'anon', <reporter_role_id>, <ceiling_permissions>, NOW())
   ```
4. Retornar JWT con `typ: 'anon'`, `sub: {user_id}`
5. Almacenar JWT en sessionStorage (sobrevive F5, muere al cerrar navegador)

### Techo de Permisos para Anónimo
**Hardcoded en** `backend/src/config/auth.config.ts`:
```typescript
export const ANONYMOUS_PERMISSIONS = [
  'READ incidents',
  'CREATE incidents',
  'CREATE comments',
];
```

**Enforcement**: 
- `PermissionGuard` deniega cualquier acción fuera de este set (403 Forbidden)
- Techo no puede ser ampliado via roles de BD (es el piso)
- Admins pueden otorgar permisos adicionales a cuentas (usuarios con email verificado)

### Registro de Cuenta (Promoción de Rol)
**Flujo** (POST /api/auth/register con email/password):
1. Fetch usuario existente por device_uuid
2. Actualizar account_type a 'account'
3. Hash password, almacenar email
4. Rol permanece como 'reporter' hasta que admin promueva a 'operator' (via T3.6 Invitations o panel admin)
5. Nuevos permisos cargados desde rol actualizado (aún READ/CREATE incidents, CREATE comments hasta promoción)

## Integración Firebase (Deprecada)

**Estado**: ELIMINADA per blocker resolution #1  
**Rationale**: Device UUID + JWT local suficiente para 25k usuarios; Firebase agrega complejidad OAuth sin beneficio claro  
**Si se necesita después**: Agregar lógica Firebase verifyToken a `JwtStrategy` como ruta alternativa

## Permission Guard y Decorador

### @RequirePermission('ACTION', 'resource')
```typescript
@Get(':id')
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission('READ', 'incidents')
findOne(@Param('id') id: string) {
  // Automáticamente deniega 403 si usuario carece de 'READ incidents'
}
```

**Cómo funciona**:
1. Decorador adjunta metadata a ruta
2. `JwtAuthGuard` verifica JWT, popula `request.user`
3. `PermissionGuard` lee metadata, verifica array `request.user.permissions`
4. Si falta permiso: responder 403 (sin mutación de BD)
5. Si presente: ejecutar handler de ruta

### Búsqueda de Caché Redis (getPermissionsByUserId)
```typescript
// AuthService
async getPermissionsByUserId(userId: string): Promise<string[]> {
  const cached = await this.redis.get(`perm:${userId}`);
  if (cached) return JSON.parse(cached);
  
  const user = await this.userRepo.findOne(userId);
  const perms = user.role?.permissions || this.ANONYMOUS_PERMISSIONS;
  
  await this.redis.setex(`perm:${userId}`, 60, JSON.stringify(perms));
  return perms;
}
```

## Tabla Sessions (T3.9)

**Rastrea**:
- `jti`: ID de access token (único)
- `user_id`: propietario
- `device_info`: browser/OS/IP (para auditoría de historial de login)
- `issued_at`, `revoked_at`, `last_activity_at`

**Usado para**:
- Revocar todos los tokens de usuario (logout en todos los dispositivos)
- Rastrear sesiones activas ("historial de login")
- Pista de auditoría de seguridad

## Criterios de Éxito

- [ ] Primer dispositivo obtiene JWT anón con 4 permisos
- [ ] Cambio de rol bumps `pv`, invalida caché, siguiente solicitud usa nuevos permisos
- [ ] Refresh token rota, viejo jti rechazado después de revocación
- [ ] Non-owner no puede ver sesiones de otro usuario
- [ ] Rate limiting por device_uuid (no global)
