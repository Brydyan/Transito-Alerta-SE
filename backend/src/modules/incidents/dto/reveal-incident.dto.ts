import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * AUD (sc-327) D4 — body de `POST /incidents/:id/reveal-reporter`.
 *
 * `justification` es OBLIGATORIA con un mínimo de 20
 * caracteres **útiles**. El mínimo no es burocracia:
 * convierte "puedo mirar" en "miré, y consta quién y por
 * qué" — y esa es la única disuasión que existe del lado
 * del operador. Un campo libre que acepta "." no registra
 * nada.
 *
 * WARNING-2 (ronda 11): el spec exige "20 caracteres
 * útiles" — no 20 caracteres de cualquier cosa. Tres
 * medidas de defensa:
 *  1. `@Transform(({ value }) => value?.trim())` recorta
 *     espacios al inicio y al final antes de validar.
 *  2. La regex `[A-Za-z0-9]` exige AL MENOS UN carácter
 *     alfanumérico en el texto. Una justificación
 *     `". . . . . . . . . . . . . . . . . . . . ."` (20
 *     puntos) ya no pasa.
 *  3. `@MinLength(20)` opera sobre la versión trimmed.
 *
 * `case_ref` es opcional: el `master` puede asociar la
 * revelación a un expediente (folio, número de denuncia,
 * etc.). Se persiste en `audit_events.metadata.case_ref`.
 */
export class RevealIncidentDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(20, { message: 'justification debe tener al menos 20 caracteres útiles' })
  @MaxLength(2000)
  // WARNING-2: por lo menos un carácter alfanumérico. Sin
  // esto, "...................." pasa el MinLength(20) sin
  // ser "útil" en ningún sentido.
  @Matches(/[A-Za-z0-9]/, {
    message: 'justification debe contener al menos un carácter alfanumérico',
  })
  justification!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  case_ref?: string;
}
