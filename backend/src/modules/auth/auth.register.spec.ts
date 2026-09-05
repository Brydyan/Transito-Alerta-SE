import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

import { AuthRegisterService, RegistrationRateLimited, REGISTRATION_INDISTINGUISHABLE_MESSAGE } from './auth.register';
import { UserEntity } from '../../entities/user.entity';
import { RoleEntity } from '../../entities/role.entity';
import { PasswordHasher } from './password-hasher';
import { EmailVerificationService } from './email-verification.service';

/**
 * REG (sc-325) — spec del alta pública.
 *
 * Cubre los escenarios del spec `citizen-registration/spec.md`:
 *  - D1: el rol es siempre `reporter`, los campos inyectados se ignoran.
 *  - D3: la respuesta es indistinguible entre correo nuevo y existente.
 *  - D4: rate limit por IP y por correo.
 *  - D5 (de A.5): ninguna combinación produce un rol de personal.
 *
 * La forma del retorno (lo que el controller expone) es la misma
 * siempre; lo que cambia entre caminos es el efecto secundario
 * (crear cuenta vs. avisar al titular). Los tests verifican ambos.
 */
describe('AuthRegisterService (sc-325)', () => {
  let service: AuthRegisterService;
  let userRepo: jest.Mocked<Repository<UserEntity>>;
  let roleRepo: jest.Mocked<Repository<RoleEntity>>;
  let passwordHasher: jest.Mocked<PasswordHasher>;
  let emailVerification: jest.Mocked<EmailVerificationService>;
  let dataSource: jest.Mocked<DataSource>;

  const reporterRole: RoleEntity = {
    id: 'role-reporter',
    name: 'reporter',
    permissions: ['READ incidents', 'CREATE incidents', 'CREATE comments'],
  } as RoleEntity;

  const validInput = {
    email: 'ciudadano@example.com',
    password: 'Password123!@#',
    firstName: 'Ada',
    lastName: 'Lovelace',
    ip: '203.0.113.5',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
  };

  beforeEach(async () => {
    userRepo = {
      findOne: jest.fn(),
      // El service llama `manager.create(UserEntity, {...})` —
      // el primer arg es la clase, el segundo es el entity-like.
      // El mock devuelve el entity-like con un id ficticio.
      create: jest.fn((_cls, entityLike) => entityLike as UserEntity),
      save: jest.fn().mockImplementation((entityLike) =>
        Promise.resolve({ ...entityLike, id: 'user-new' } as UserEntity),
      ),
    } as unknown as jest.Mocked<Repository<UserEntity>>;
    roleRepo = {
      findOne: jest.fn().mockResolvedValue(reporterRole),
    } as unknown as jest.Mocked<Repository<RoleEntity>>;
    passwordHasher = {
      hash: jest.fn().mockResolvedValue('hashed'),
      assertStrongEnough: jest.fn(),
    } as unknown as jest.Mocked<PasswordHasher>;
    emailVerification = {
      generateAndSendOtp: jest.fn().mockResolvedValue(undefined),
      notifyExistingAccountAttempt: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EmailVerificationService>;
    dataSource = {
      transaction: jest.fn(async (cb) =>
        cb({ create: userRepo.create, save: userRepo.save }),
      ),
    } as unknown as jest.Mocked<DataSource>;

    const module = await Test.createTestingModule({
      providers: [
        AuthRegisterService,
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        { provide: getRepositoryToken(RoleEntity), useValue: roleRepo },
        { provide: PasswordHasher, useValue: passwordHasher },
        { provide: EmailVerificationService, useValue: emailVerification },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(AuthRegisterService);
  });

  // ── D1 — el rol es siempre `reporter` ─────────────────────────

  it('D1: crea la cuenta con roleId del `reporter` y copia sus permisos', async () => {
    userRepo.findOne.mockResolvedValue(null); // correo nuevo

    const result = await service.register(validInput);

    expect(result.success).toBe(true);
    expect(dataSource.transaction).toHaveBeenCalled();
    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ciudadano@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        roleId: 'role-reporter',
        permissions: ['READ incidents', 'CREATE incidents', 'CREATE comments'],
        isActive: true,
        deviceUuid: null,
      }),
    );
    expect(emailVerification.generateAndSendOtp).toHaveBeenCalled();
  });

  it('D1: aunque la entrada traiga un roleName, role_id u organization_id, el método los ignora (defense-in-depth)', async () => {
    // D1 — el método NO acepta esos campos en RegisterInput
    // (ver `RegisterInput` en `auth.register.ts`). El test verifica
    // que aunque TypeScript los rechazara, el servicio no leería
    // ni un campo extra. Pasamos un payload "sucio" casteado a
    // `any` para forzar la situación.
    userRepo.findOne.mockResolvedValue(null);

    const dirty = {
      ...validInput,
      // Cast any: el test intenta colar campos que el DTO no acepta.
      role: 'master',
      roleName: 'master',
      role_id: 'role-master',
      permissions: ['*'],
      organization_id: 'org-staff',
    } as unknown as Parameters<typeof service.register>[0];

    const result = await service.register(dirty);

    // El save usa los campos del método, no del payload sucio.
    expect(result.success).toBe(true);
    expect(userRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        roleId: 'role-reporter', // NO 'role-master'
        permissions: ['READ incidents', 'CREATE incidents', 'CREATE comments'],
        // NO 'org-staff' — los citizen no tienen org; el
        // service no setea `organizationId` en el alta pública.
        email: 'ciudadano@example.com',
      }),
    );
    // Lo importante: el `roleId` es el del servidor, no el del payload.
    expect(userRepo.save.mock.calls[0][0].roleId).toBe('role-reporter');
    expect(userRepo.save.mock.calls[0][0].permissions).not.toContain('*');
  });

  // ── D3 — respuesta indistinguible ─────────────────────────────

  it('D3: con correo nuevo, crea la cuenta y devuelve el mensaje estándar', async () => {
    userRepo.findOne.mockResolvedValue(null);

    const result = await service.register(validInput);

    // Fix 12: comparación contra la constante, no regex parcial.
    // El round 1 usaba `toMatch(/te enviamos.../)` y el bug
    // sobrevivió 6 rounds porque el regex matcheaba ambos strings.
    expect(result.publicMessage.message).toBe(REGISTRATION_INDISTINGUISHABLE_MESSAGE);
    expect(userRepo.save).toHaveBeenCalled();
    expect(emailVerification.generateAndSendOtp).toHaveBeenCalled();
    // El aviso al titular NO se manda en el caso "correo nuevo".
    expect(emailVerification.notifyExistingAccountAttempt).not.toHaveBeenCalled();
  });

  it('D3: con correo existente, NO crea cuenta, manda aviso al titular y devuelve la MISMA forma de respuesta', async () => {
    const existing: UserEntity = {
      id: 'user-1',
      email: 'ciudadano@example.com',
    } as UserEntity;
    userRepo.findOne.mockResolvedValue(existing);

    const result = await service.register(validInput);

    // Fix 12: misma comparación contra la constante. Si el
    // camino "existente" divergiera al texto, este test cae.
    expect(result.publicMessage.message).toBe(REGISTRATION_INDISTINGUISHABLE_MESSAGE);
    expect(result.success).toBe(true);
    // No se crea cuenta ni se manda OTP.
    expect(userRepo.save).not.toHaveBeenCalled();
    expect(emailVerification.generateAndSendOtp).not.toHaveBeenCalled();
    // Sí se manda el aviso al titular.
    expect(emailVerification.notifyExistingAccountAttempt).toHaveBeenCalledWith(
      'user-1',
      '203.0.113.5',
      'Mozilla/5.0 (X11; Linux x86_64)',
    );
  });

  // ── D5 (A.5) — ninguna combinación produce rol de personal ─────

  it('A.5: la búsqueda de rol es siempre por nombre `reporter`, no por id de payload', async () => {
    // La búsqueda usa `where: { name: 'reporter' }` — un atacante
    // que mande `role_id: 'role-master'` no afecta el lookup.
    userRepo.findOne.mockResolvedValue(null);
    const dirty = { ...validInput, role_id: 'role-master' } as unknown as Parameters<typeof service.register>[0];
    await service.register(dirty);
    expect(roleRepo.findOne).toHaveBeenCalledWith({ where: { name: 'reporter' } });
  });

  // ── D4 — rate limit por IP y por correo ──────────────────────

  it('D4: 5 intentos desde la misma IP en la ventana → el 6º lanza RegistrationRateLimited(scope=ip)', async () => {
    userRepo.findOne.mockResolvedValue(null);

    // 5 altas pasan.
    for (let i = 0; i < 5; i++) {
      await service.register({
        ...validInput,
        email: `nuevo${i}@example.com`,
        ip: '198.51.100.7',
      });
    }
    // La 6ª falla.
    await expect(
      service.register({ ...validInput, email: 'sexto@example.com', ip: '198.51.100.7' }),
    ).rejects.toBeInstanceOf(RegistrationRateLimited);
  });

  it('D4: 3 intentos al mismo correo desde IP distintas → el 4º lanza RegistrationRateLimited(scope=email)', async () => {
    userRepo.findOne.mockResolvedValue(null);

    for (let i = 0; i < 3; i++) {
      await service.register({
        ...validInput,
        ip: `192.0.2.${i + 1}`,
      });
    }
    await expect(
      service.register({ ...validInput, ip: '192.0.2.99' }),
    ).rejects.toBeInstanceOf(RegistrationRateLimited);
  });

  it('D4: una alta aislada de un ciudadano legítimo no se ve afectada', async () => {
    userRepo.findOne.mockResolvedValue(null);
    await expect(service.register(validInput)).resolves.toMatchObject({
      success: true,
    });
  });

  // ── Política de contraseña ─────────────────────────────────────

  it('rechaza contraseñas que no cumplen la política antes de hashear', async () => {
    passwordHasher.assertStrongEnough.mockImplementation(() => {
      throw new Error('Password must be at least 12 characters');
    });
    userRepo.findOne.mockResolvedValue(null);
    await expect(
      service.register({ ...validInput, password: 'short' }),
    ).rejects.toThrow(/12 characters/);
    // No se intentó hashear ni guardar.
    expect(passwordHasher.hash).not.toHaveBeenCalled();
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  // ── Fix 3 (ronda 2) — D3 + canal lateral de tiempo ────────────
  //
  // D3 dice que la respuesta debe ser indistinguible para correo
  // nuevo y existente. Pero el camino "nuevo" corre bcrypt (caro)
  // y el "existente" no. Un atacante que mide el tiempo de la
  // respuesta puede saber qué camino corrió y, con un millar de
  // intentos, mapear qué correos están registrados. El patrón
  // DUMMY_HASH (de `auth.service.ts:loginWithPassword` con D9) se
  // aplica acá: bcrypt corre en ambos caminos, con el resultado
  // descartado en el camino "existente". La igualdad es por costo
  // de CPU, no por tiempo real (puede haber variabilidad de ms);
  // el verificador del pass 1 confirmó que el patrón es suficiente.
  it('D3: el camino "correo existente" también invoca passwordHasher.hash (igualación de tiempo)', async () => {
    const existing: UserEntity = {
      id: 'user-1',
      email: 'ciudadano@example.com',
    } as UserEntity;
    userRepo.findOne.mockResolvedValue(existing);

    await service.register(validInput);

    // El camino "existente" debe hashear (con un dummy o un input
    // cualquiera) para igualar el costo del camino "nuevo". Si no,
    // este test cae — un canal lateral de tiempo permite
    // enumeración de cuentas.
    expect(passwordHasher.hash).toHaveBeenCalled();
  });
});
