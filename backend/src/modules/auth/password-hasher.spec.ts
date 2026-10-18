import { ConfigService } from '@nestjs/config';

import { AuthConfig } from '../../config/auth.config';
import { DUMMY_HASH, PasswordHasher } from './password-hasher';

function configWithCost(bcryptCost: number): ConfigService {
  return {
    get: () => ({ bcryptCost } as Partial<AuthConfig>),
  } as unknown as ConfigService;
}

describe('PasswordHasher (T3.6 design, cost is config-driven)', () => {
  it('round-trips: hash(password) then verify(password, hash) is true', async () => {
    const hasher = new PasswordHasher(configWithCost(4));
    const hash = await hasher.hash('correct horse battery staple');
    await expect(hasher.verify('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('verify fails for the wrong password', async () => {
    const hasher = new PasswordHasher(configWithCost(4));
    const hash = await hasher.hash('correct horse battery staple');
    await expect(hasher.verify('wrong password', hash)).resolves.toBe(false);
  });

  it('honors a config override of cost 4 (never a hardcoded 12)', async () => {
    const hasher = new PasswordHasher(configWithCost(4));
    const hash = await hasher.hash('password');
    // bcrypt hash format: $2b$<cost>$...
    expect(hash.startsWith('$2b$04$')).toBe(true);
  });

  describe('DUMMY_HASH', () => {
    it('is a real bcrypt hash', () => {
      expect(DUMMY_HASH).toMatch(/^\$2[aby]\$\d{2}\$/);
    });

    it('verifies false against any real password', async () => {
      const hasher = new PasswordHasher(configWithCost(4));
      await expect(hasher.verify('any password at all', DUMMY_HASH)).resolves.toBe(false);
      await expect(hasher.verify('', DUMMY_HASH)).resolves.toBe(false);
    });
  });

  // P13 del MINIMAX_BUILDER_SECURITY_IMPLEMENTATION.md — raise branch
  // coverage de password-hasher de 0% a 100% cubriendo los 5 branches
  // del policy check (length, lowercase, uppercase, digit, symbol).
  // Defense-in-depth: el validador del DTO ya invoca este método;
  // estos tests cubren también el path directo (e.g. AuthService
  // changePassword, password reset).
  describe('assertStrongEnough (REG sc-325 — política de complejidad)', () => {
    const hasher = new PasswordHasher(configWithCost(4));
    const STRONG = 'Abcdef1!xyz9'; // 12 chars, todas las clases

    it('acepta una contraseña que cumple todas las reglas', () => {
      expect(() => hasher.assertStrongEnough(STRONG)).not.toThrow();
    });

    it('rechaza si tiene menos de 12 caracteres', () => {
      expect(() => hasher.assertStrongEnough('Ab1!xyz9')).toThrow(
        'Password must be at least 12 characters',
      );
    });

    it('rechaza si no tiene minúscula', () => {
      expect(() => hasher.assertStrongEnough('ABCDEF1!XYZ9')).toThrow(
        'Password must contain a lowercase letter',
      );
    });

    it('rechaza si no tiene mayúscula', () => {
      expect(() => hasher.assertStrongEnough('abcdef1!xyz9')).toThrow(
        'Password must contain an uppercase letter',
      );
    });

    it('rechaza si no tiene dígito', () => {
      expect(() => hasher.assertStrongEnough('Abcdefg!xyzq')).toThrow(
        'Password must contain a digit',
      );
    });

    it('rechaza si no tiene símbolo', () => {
      // 12 chars pero sin símbolo
      expect(() => hasher.assertStrongEnough('Abcdefg1xyzq')).toThrow(
        'Password must contain a symbol',
      );
    });
  });
});
