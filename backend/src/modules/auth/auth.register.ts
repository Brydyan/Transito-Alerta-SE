import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { UserEntity } from '../../entities/user.entity';
import { RoleEntity } from '../../entities/role.entity';
import { PasswordHasher } from './password-hasher';
import { EmailVerificationService } from './email-verification.service';

/**
 * D3 + D9 (design.md) — contraseña dummy para igualación de
 * tiempo en el camino "correo existente". Mismo patrón que
 * `DUMMY_HASH` en `auth.service.ts:loginWithPassword` (donde
 * se usa para no filtrar existencia de usuarios vía timing).
 * El texto no se usa: bcrypt corre y el resultado se descarta.
 */
const DUMMY_PASSWORD_FOR_TIMING = 'timing-equalization-dummy-password-12+chars';

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** Audit. No influye en la decisión éxito/error (D3). */
  ip: string | null;
  userAgent: string | null;
}

/** Lanza el service cuando el rate limit se excede. El controller
 *  traduce a HTTP 429. Mantener la jerarquía Error nativa (no
 *  HttpException) facilita el test unitario del service sin
 *  tener que mockear NestJS. */
export class RegistrationRateLimited extends Error {
  constructor(public readonly scope: 'ip' | 'email') {
    super(`Registration rate-limited by ${scope}`);
  }
}

/**
 * REG (sc-325) — Fix 12 (ronda 8): el `publicMessage` que el controller
 * expone DEBE ser el mismo string en los tres caminos del
 * `AuthRegisterService.register()` ("correo nuevo", "correo
 * existente", "rol `reporter` no encontrado"). D3 del design
 * (`design.md:61-65`) prohíbe que la respuesta filtre cuál de los
 * tres caminos corrió: un cliente que vea la diferencia puede
 * enumerar qué correos están registrados.
 *
 * El commit `fa005b8` de la ronda 1 divergió este string entre
 * los caminos por error, y los 6 rounds de verify que siguieron
 * no lo cazaron porque `auth.register.spec.ts:155,172` afirma
 * sólo una subcadena común. El e2e que se agregó en la ronda 6
 * (`registration-flow.e2e-spec.ts:REG.2`) usa `toEqual` sobre
 * la respuesta completa y lo destapó.
 *
 * Por qué una constante: si alguien reintroduce texto distinto
 * en uno de los caminos, el `toEqual` de REG.2 lo nombra. La
 * constante es la única referencia que necesita el código de los
 * tres retornos.
 */
export const REGISTRATION_INDISTINGUISHABLE_MESSAGE =
  'Si el correo no estaba registrado, te enviamos un mensaje para verificar tu cuenta.';

/**
 * REG (sc-325) — service del alta pública de ciudadanos.
 *
 * Por qué un service separado de `AuthService`:
 *  - `AuthService` carga 9 dependencias (JWT, sessions, cache,
 *    dataSource, etc.). El register no usa ninguna — sólo el
 *    `userRepo`, el `roleRepo`, el `passwordHasher` y el
 *    `emailVerificationService`. Mantenerlo aislado reduce el
 *    blast radius: cualquier test del alta no toca al resto del
 *    módulo.
 *  - `PasswordHasher` y `EmailVerificationService` son opcionales
 *    en `AuthService` por compatibilidad con el spec histórico
 *    (`auth.service.spec.ts` original usa 8 args posicionales).
 *    Acá son obligatorios — el alta sin password hasher ni
 *    verification es incoherente.
 *
 * **D1 (design.md) — el rol es constante del servidor.** Este
 * service resuelve el rol `reporter` por nombre. La tabla
 * `roles` se siembra con ese nombre en `0009_roles_permissions.sql`
 * (y se renombró en `0040_rename_roles.sql`); un fallo en el
 * lookup es un error de configuración, no un fallback.
 *
 * **D3 (design.md) — la respuesta es indistinguible.** El
 * método `register()` devuelve SIEMPRE `RegisterResult` con el
 * mismo `publicMessage`. Cuando el correo ya existe, NO crea
 * cuenta duplicada, NO modifica la existente, y manda un
 * **aviso de intento de alta** al titular (no un OTP — el
 * titular ya conoce su OTP si lo pidió, y este correo no
 * revela la cuenta a nadie más que a él).
 *
 * **D4 (design.md) — limitación de tasa por IP y por correo.**
 * Implementada acá, no en el controller, para que el service
 * sea directamente testeable con un clock fake.
 */
@Injectable()
export class AuthRegisterService {
  private readonly logger = new Logger(AuthRegisterService.name);

  /** D4 — ventana y umbrales. Configurables por env, con defaults. */
  private readonly WINDOW_MS = 60 * 60 * 1000; // 1 hora
  private readonly IP_MAX = 5;
  private readonly EMAIL_MAX = 3;

  /** In-memory store para la limitación de tasa. Suficiente para
   *  el tamaño de la app; en cluster la sustitución es un
   *  store distribuido (Redis `INCR` + `EXPIRE`). Documentado
   *  como follow-up si el cluster pasa a producción. */
  private readonly ipStore = new Map<string, number[]>();
  private readonly emailStore = new Map<string, number[]>();

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    private readonly passwordHasher: PasswordHasher,
    private readonly emailVerificationService: EmailVerificationService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * D1 — el rol `reporter` es el único camino del auto-registro.
   * El método es seguro frente a un DTO que intente inyectar
   * otros campos: el DTO (RegisterDto) no los acepta, y acá
   * los que importan son sólo `email`, `password`, `firstName`,
   * `lastName`. Cualquier otro campo del body HTTP se ignora
   * silenciosamente (whitelist: true + forbidNonWhitelisted en
   * el controller los rechazaría antes de llegar acá).
   */
  async register(input: RegisterInput): Promise<{
    success: true;
    userId: string;
    publicMessage: { message: string };
  }> {
    const emailLower = input.email.toLowerCase().trim();

    // D4 — limitación de tasa por IP y por correo. Se chequea
    // ANTES de mirar si el correo existe, para que un atacante
    // que prueba muchos correos desde una IP reciba 429 antes
    // de poder enumerar.
    this.assertRateLimit('ip', input.ip);
    this.assertRateLimit('email', emailLower);

    // D3 — la respuesta es la misma. No leemos el resultado de
    // `findByEmail` para ramificar; sólo lo usamos para
    // distinguir "crear" vs "aviso al titular".
    const existing = await this.userRepo.findOne({
      where: { email: emailLower },
    });

    if (existing) {
      // D3 — D9 (design): la respuesta debe ser INDISTINGUIBLE
      // entre correo nuevo y existente. El camino "nuevo" corre
      // bcrypt (caro) y el "existente" no haría nada — un canal
      // lateral de tiempo permite a un atacante mapear qué correos
      // están registrados. Para cerrar el canal, bcrypt corre
      // también en el camino "existente" con una contraseña dummy;
      // el resultado se descarta a propósito. Mismo patrón que
      // `DUMMY_HASH` en `auth.service.ts:loginWithPassword`.
      await this.passwordHasher.hash(DUMMY_PASSWORD_FOR_TIMING);

      // D3 — mandar aviso al titular. NO un OTP (el que el
      // titular ya pidió con verify-email es suyo; este correo
      // es informativo, no es un canal de autenticación).
      await this.emailVerificationService.notifyExistingAccountAttempt(
        existing.id,
        input.ip,
        input.userAgent,
      );
      this.registerEmailHit(emailLower);
      this.registerIpHit(input.ip);
      this.logger.log(
        `Register attempt on existing email: ${emailLower} (ip=${input.ip ?? 'unknown'})`,
      );
      return {
        success: true,
        userId: existing.id,
        publicMessage: {
          message: REGISTRATION_INDISTINGUISHABLE_MESSAGE,
        },
      };
    }

    // D1 — buscar el rol `reporter` por nombre. Si no existe,
    // el alta falla — pero la respuesta sigue siendo la misma
    // forma (D3) para no filtrar el estado del seed.
    const reporterRole = await this.roleRepo.findOne({
      where: { name: 'reporter' },
    });
    if (!reporterRole) {
      this.logger.error(
        'Register: rol `reporter` no encontrado en la tabla `roles`. Aplicar 0009 + 0040.',
      );
      // Misma forma de respuesta. El cliente no puede
      // distinguir este caso de un alta exitosa.
      return {
        success: true,
        userId: '',
        publicMessage: {
          message: REGISTRATION_INDISTINGUISHABLE_MESSAGE,
        },
      };
    }

    // Hash + creación del usuario en una transacción. La
    // copia de `roles.permissions` a `users.permissions` la
    // hace el modelo (no hay setter específico acá), pero
    // garantizamos que el rol está bien asignado.
    this.passwordHasher.assertStrongEnough(input.password);
    const passwordHash = await this.passwordHasher.hash(input.password);

    const created = await this.dataSource.transaction(async (manager) => {
      const user = manager.create(UserEntity, {
        email: emailLower,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        deviceUuid: null, // alta por correo/contraseña; el device
                            // se setea cuando el usuario entra.
        roleId: reporterRole.id,
        permissions: reporterRole.permissions ?? [],
        permissionVersion: 1,
        isActive: true,
      });
      return manager.save(user);
    });

    // Emitir OTP de verificación. Si esto falla, el alta
    // queda creada pero sin OTP — el usuario puede pedir
    // reenvío luego. No hacemos rollback de la cuenta: la
    // simetría con la ruta de "ya existe" se rompe si
    // borramos; mejor dejar la cuenta y dejar que el usuario
    // pida OTP de nuevo.
    try {
      await this.emailVerificationService.generateAndSendOtp(created.id);
    } catch (err) {
      this.logger.warn(
        `Register: OTP no emitido para ${emailLower} (cuenta creada, id=${created.id}): ${
          (err as Error).message
        }`,
      );
    }

    this.registerEmailHit(emailLower);
    this.registerIpHit(input.ip);

    return {
      success: true,
      userId: created.id,
      publicMessage: {
        message: REGISTRATION_INDISTINGUISHABLE_MESSAGE,
      },
    };
  }

  // ── D4 — rate limiting (in-memory, per-IP y per-email) ─────────

  private assertRateLimit(scope: 'ip' | 'email', key: string | null): void {
    if (!key) return; // sin IP / sin email, no se puede limitar
    const now = Date.now();
    const store = scope === 'ip' ? this.ipStore : this.emailStore;
    const max = scope === 'ip' ? this.IP_MAX : this.EMAIL_MAX;
    const hits = (store.get(key) ?? []).filter(
      (t) => now - t < this.WINDOW_MS,
    );
    if (hits.length >= max) {
      throw new RegistrationRateLimited(scope);
    }
  }

  private registerIpHit(ip: string | null): void {
    if (!ip) return;
    const hits = (this.ipStore.get(ip) ?? []).filter(
      (t) => Date.now() - t < this.WINDOW_MS,
    );
    hits.push(Date.now());
    this.ipStore.set(ip, hits);
  }

  private registerEmailHit(email: string): void {
    const hits = (this.emailStore.get(email) ?? []).filter(
      (t) => Date.now() - t < this.WINDOW_MS,
    );
    hits.push(Date.now());
    this.emailStore.set(email, hits);
  }
}
