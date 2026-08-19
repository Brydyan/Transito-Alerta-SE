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
});
