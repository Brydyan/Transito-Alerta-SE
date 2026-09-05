import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';

import { EmailVerifiedGuard } from './email-verified.guard';
import { UserEntity } from '../../entities/user.entity';
import { EMAIL_VERIFICATION_REQUIRED } from '../../modules/auth/auth-errors';

/**
 * REG (sc-325) — spec unitario de `EmailVerifiedGuard`.
 *
 * La política es **allow-list de staff**: sólo los cuatro roles de personal
 * publican sin verificar el correo. Todo lo demás —`reporter`, un nombre
 * desconocido, o ningún rol— cae en la rama de exigencia. Falla cerrado.
 *
 * La ronda 3 la había invertido a deny-list puntual sobre `reporter`, para
 * desbloquear cuentas con `role_id = NULL` y permisos directos (el patrón de
 * los fixtures e2e). Eso resolvía el síntoma abriendo la puerta: renombrar
 * `reporter` desde el panel administrativo dejaba de exigir verificación a
 * toda la base de ciudadanos, sin error y sin log. La ronda 4 volvió a
 * allow-list y arregló los fixtures, que era donde estaba el problema.
 *
 * Este spec prueba que la función DECIDE bien. Que el guard esté enchufado a
 * los controladores lo prueba `test/e2e/email-verified-guard.e2e-spec.ts`:
 * si alguien borra el `@UseGuards`, este archivo sigue en verde.
 */
describe('EmailVerifiedGuard (REG sc-325)', () => {
  let guard: EmailVerifiedGuard;
  let userRepo: jest.Mocked<Repository<UserEntity>>;

  const ctxFor = (user: unknown): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    userRepo = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<UserEntity>>;
    const module = await Test.createTestingModule({
      providers: [
        EmailVerifiedGuard,
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
      ],
    }).compile();
    guard = module.get(EmailVerifiedGuard);
  });

  it('Fix 5: la allow-list cubre los 4 staff roles; cualquier otro roleName exige verificación', async () => {
    // Allow-list exhaustivo. El denegado (`null`, `'reporter'`,
    // otros nombres) cae en la rama de verificación.
    for (const roleName of ['operador_org', 'admin_org', 'operador_sistema', 'master']) {
      const user = { userId: 'u1', roleName, permissions: [] };
      await expect(guard.canActivate(ctxFor(user))).resolves.toBe(true);
    }
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it('Fix 5: fail-closed ante roleName=null — la cuenta SIN rol exige verificación', async () => {
    // El deny-list de la ronda 3 dejaba pasar `null` por error
    // (es el caso de los 7 fallos de `regressions.e2e-spec`).
    // El allow-list de la ronda 4 cierra el fail-open: `null` no
    // está en STAFF_ROLES, así que cae en la rama de
    // verificación. Para que los tests e2e no se rompan, el
    // fixture `provisionUser()` setea `email_verified_at` por
    // default (Fix 5 parte B); si un test quiere el caso
    // SIN verificar, lo pide explícitamente.
    const user = { userId: 'u1', roleName: null, permissions: ['CREATE incidents'] };
    userRepo.findOne.mockResolvedValue({
      id: 'u1',
      emailVerifiedAt: null,
    } as UserEntity);

    await expect(guard.canActivate(ctxFor(user))).rejects.toMatchObject({
      response: { code: 'EMAIL_VERIFICATION_REQUIRED' },
    });
  });

  it('Fix 5: un reporter renombrado a "civic_hero" NO desactiva la verificación (fail-closed)', async () => {
    // El verificador documentó que el deny-list era fail-open:
    // renombrar `'reporter'` a `'civic_hero'` desactivaba el
    // control. Con la allow-list, `'civic_hero'` no está en
    // STAFF_ROLES y la cuenta sigue exigiendo verificación.
    const user = { userId: 'u1', roleName: 'civic_hero', permissions: [] };
    userRepo.findOne.mockResolvedValue({
      id: 'u1',
      emailVerifiedAt: null,
    } as UserEntity);

    await expect(guard.canActivate(ctxFor(user))).rejects.toMatchObject({
      response: { code: 'EMAIL_VERIFICATION_REQUIRED' },
    });
  });

  it('reporter con email_verified_at poblado pasa', async () => {
    const user = { userId: 'u1', roleName: 'reporter', permissions: [] };
    userRepo.findOne.mockResolvedValue({
      id: 'u1',
      emailVerifiedAt: new Date(),
    } as UserEntity);
    await expect(guard.canActivate(ctxFor(user))).resolves.toBe(true);
    expect(userRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: ['id', 'emailVerifiedAt'],
    });
  });

  it('reporter con email_verified_at en nulo lanza 403 EMAIL_VERIFICATION_REQUIRED', async () => {
    const user = { userId: 'u1', roleName: 'reporter', permissions: [] };
    userRepo.findOne.mockResolvedValue({
      id: 'u1',
      emailVerifiedAt: null,
    } as UserEntity);

    let caught: unknown;
    try {
      await guard.canActivate(ctxFor(user));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ForbiddenException);
    expect(caught).toMatchObject({
      response: { code: EMAIL_VERIFICATION_REQUIRED },
    });
  });

  it('reporter sin fila en BD (usuario eliminado, race) lanza 403', async () => {
    // Si la fila se borró entre el JWT y el guard (soft-delete
    // concurrente), el guard responde 403 con el código estándar.
    const user = { userId: 'ghost', roleName: 'reporter', permissions: [] };
    userRepo.findOne.mockResolvedValue(null);

    await expect(guard.canActivate(ctxFor(user))).rejects.toMatchObject({
      response: { code: EMAIL_VERIFICATION_REQUIRED },
    });
  });

  it('sin usuario en el request (JwtAuthGuard no corrió) lanza 403 explícito', async () => {
    // El JwtAuthGuard corre antes; si por algún orden de guards
    // llegamos sin `user`, el guard falla explícito en vez de
    // seguir adelante.
    await expect(guard.canActivate(ctxFor(null))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
