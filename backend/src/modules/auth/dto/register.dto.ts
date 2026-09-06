import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';

/**
 * REG (sc-325) — DTO del alta pública de ciudadanos.
 *
 * D1 (design.md) — el DTO es la primera línea de defensa:
 *  - Sin campo `role`, `roleName`, `role_id`, `permissions`.
 *    El servidor fija el rol `reporter` independientemente de la
 *    petición; validar "que sea un rol permitido" es un patrón
 *    inseguro (la lista puede quedar desactualizada o el camino
 *    nuevo olvidar la validación). Una imposibilidad no se puede
 *    saltar.
 *  - Sin `organization_id` — un ciudadano no pertenece a una
 *    organización; sólo el personal lo hace.
 *  - Sin `device_uuid` — el alta es por correo/contraseña; el
 *    device-bound session es la ruta del anon reportante (T3.6),
 *    no la del auto-registro.
 *
 * La contraseña exige un mínimo de 12 caracteres y al menos
 * una mayúscula, una minúscula, un dígito y un símbolo. Esa
 * política es la misma que `PasswordHasher` valida internamente
 * (alineación con el resto de la app, sin reglas divergentes).
 */
export class RegisterDto {
  @IsEmail({}, { message: 'Debe ser un correo válido' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(12, { message: 'La contraseña debe tener al menos 12 caracteres' })
  @MaxLength(128)
  // Política de complejidad — sincronizada con `PasswordHasher.assertStrongEnough`
  // (ver `backend/src/modules/auth/password-hasher.ts`). El regex captura la
  // misma idea que las verificaciones internas; si se relaja allá, se
  // relaja acá también (DRY intencional, no duplicar regex mágico).
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{12,}$/,
    {
      message:
        'La contraseña debe incluir mayúscula, minúscula, dígito y símbolo',
    },
  )
  password!: string;

  @IsString()
  @MinLength(1, { message: 'El nombre es obligatorio' })
  @MaxLength(100)
  first_name!: string;

  @IsString()
  @MinLength(1, { message: 'El apellido es obligatorio' })
  @MaxLength(100)
  last_name!: string;
}
