import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserEntity } from '../../entities/user.entity';
import { EMAIL_VERIFICATION_REQUIRED } from '../../modules/auth/auth-errors';

/**
 * REG (sc-325) — D2 (design.md): un `reporter` con `email_verified_at`
 * en nulo NO DEBE poder crear incidencias ni comentarios. El
 * personal y los fixtures de test (con `email_verified_at` por
 * default) están exentos.
 *
 * **Ronda 4 (Fix 5) — falla de seguridad corregida.** El deny-list
 * puntual sobre `'reporter'` (introducido en la ronda 3, Fix 4)
 * es fail-open ante un renombrado del rol: un `admin_org`/`master`
 * que renombre `reporter` a otra cosa desactiva el control de
 * seguridad **permanente y silenciosamente** (sin error, sin log,
 * sin usuarios bloqueados que avisen, y con TTL de cache
 * estirando el efecto). El verificador confirmó el análisis con
 * el código actual.
 *
 * La política **fail-closed correcta** es allow-list explícito
 * sobre los 4 staff roles: cualquier cosa que no sea staff
 * (incluido `null` y los fixtures de test) exige verificación.
 * El blast radius del deny-list roto se cierra acá; el blast
 * radius del allow-list (los 7 fallos de `regressions.e2e-spec`
 * en la ronda 2) se cierra en el fixture de test con un default
 * de `email_verified_at` — no en una decisión de seguridad de
 * producción.
 */
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  /**
   * REG (sc-325) — el ÚNICO rol al que NO se le exige verificación
   * de correo antes de publicar. La lista es exhaustiva sobre
   * los staff roles del sistema (`0009_roles_permissions.sql` /
   * `0040_rename_roles.sql`). Cualquier `roleName` que no esté en
   * esta lista (incluido `null` y `'reporter'`) cae en la rama
   * de verificación. Esto es fail-closed: un renombrado del rol
   * `reporter` por el panel administrativo lo deja en el mismo
   * branch de exigencia (porque el nuevo nombre no está en la
   * allow-list), no abre la puerta de par en par.
   */
  private static readonly STAFF_ROLES = new Set([
    'operador_org',
    'admin_org',
    'operador_sistema',
    'master',
  ]);

  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      // El JwtAuthGuard corre antes; si llegamos acá sin
      // usuario, algo está mal. Mejor 403 explícito.
      throw new ForbiddenException({
        code: EMAIL_VERIFICATION_REQUIRED,
        message: 'Necesitás iniciar sesión para realizar esta acción.',
      });
    }

    // D2 (design.md) — los 4 staff roles están exentos. La lista
    // es exhaustiva: cualquier `roleName` que no esté acá (incluido
    // `null` y `'reporter'`) exige verificación. Esto es
    // fail-closed: un renombrado del rol `reporter` lo deja fuera
    // de la allow-list y, por tanto, dentro de la exigencia. El
    // allow-list es la implementación correcta del design D1
    // ("imposibilidad, no validación").
    if (user.roleName && EmailVerifiedGuard.STAFF_ROLES.has(user.roleName)) {
      return true;
    }

    // Todo lo demás — `roleName: 'reporter'`, `roleName: null`,
    // cualquier otro nombre — requiere `email_verified_at`
    // poblado. Lo leemos del usuario actual en BD (no del JWT)
    // porque el JWT no carga el campo y el cache de permisos puede
    // tener una versión desactualizada. La consulta es 1 SELECT
    // por request, indexado por PK.
    const dbUser = await this.userRepo.findOne({
      where: { id: user.userId },
      select: ['id', 'emailVerifiedAt'],
    });
    if (!dbUser || !dbUser.emailVerifiedAt) {
      throw new ForbiddenException({
        code: EMAIL_VERIFICATION_REQUIRED,
        message:
          'Necesitás verificar tu correo antes de publicar. Revisá tu bandeja.',
      });
    }
    return true;
  }
}
