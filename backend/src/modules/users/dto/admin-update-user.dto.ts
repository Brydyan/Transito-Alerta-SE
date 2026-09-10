import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * T5.6 + F6 — body for `PATCH /api/users/:id` (admin update). Every
 * field is optional; only present fields are touched.
 *
 * F6 fix: se agregan `email` y `phone` al DTO. El admin (master u
 * operador_sistema) puede actualizar el correo y teléfono de un
 * usuario bajo su alcance. Antes el form del frontend intentaba
 * mandarlos pero el DTO los rechazaba con
 * `forbidNonWhitelisted` (validación global del `main.ts`) y el
 * usuario veía "property email should not exist" en la UI. El user
 * mismo puede cambiar los suyos vía `PATCH /api/users/me`
 * (`UpdateProfileDto`, T3.9); este DTO es para admin.
 *
 * `email` valida formato con `class-validator` y la constraint
 * `UNIQUE` del schema (0017). Si el admin pone un email que ya
 * tiene otro user activo, el service tira `ConflictException`
 * (409) — coherente con el comportamiento de `adminCreate`.
 *
 * `phone` valida el formato Ecuador `+593…` o `09…` (mismo patrón
 * que `AdminCreateUserDto`); opcional y `null` para usuarios
 * sin teléfono.
 */
export class AdminUpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  last_name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  /**
   * F6 fix: `phone` opcional, `null` lo limpia. El patrón
   * acepta el formato Ecuador `+593999999999` o `0999999999`
   * (con o sin `+`; max 13 chars sin `+`). Coherente con
   * `AdminCreateUserDto.phone` y la columna `users.phone`
   * (MaxLength 30, agregada en 0035).
   */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Matches(/^(\+?593|0)?[0-9]{7,12}$/, {
    message:
      'phone debe tener formato Ecuador: +593999999999, 0999999999 o 999999999',
  })
  phone?: string | null;

  @IsOptional()
  @IsUUID()
  role_id?: string;

  @IsOptional()
  @IsUUID()
  organization_id?: string;
}
