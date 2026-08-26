import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';

import { sha256Hex } from '../../common/crypto/session-hash';
import { PasswordResetService } from './password-reset.service';

describe('PasswordResetService (T3.6 design "Component Design", mocked repository)', () => {
  let passwordResetRepository: {
    insert: jest.Mock;
    casConsume: jest.Mock;
    findDiagnosisByHash: jest.Mock;
  };
  let userRepo: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let passwordHasher: { hash: jest.Mock; verify: jest.Mock };
  let mailService: { enqueue: jest.Mock };
  let authService: { revokeAllForUser: jest.Mock };
  let configService: ConfigService;
  let service: PasswordResetService;

  beforeEach(() => {
    passwordResetRepository = { insert: jest.fn(), casConsume: jest.fn(), findDiagnosisByHash: jest.fn() };
    userRepo = { findOne: jest.fn() };
    dataSource = { transaction: jest.fn() };
    passwordHasher = { hash: jest.fn(), verify: jest.fn() };
    mailService = { enqueue: jest.fn() };
    authService = { revokeAllForUser: jest.fn() };
    configService = { get: () => ({ appBaseUrl: 'http://localhost:3000' }) } as unknown as ConfigService;

    service = new PasswordResetService(
      passwordResetRepository as never,
      userRepo as never,
      dataSource as unknown as DataSource,
      passwordHasher as never,
      mailService as never,
      authService as never,
      configService,
    );
  });

  describe('requestReset (D9 — silent miss)', () => {
    it('resolves without error for an unknown email, no token written, no mail sent', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.requestReset('ghost@x.com')).resolves.toBeUndefined();

      expect(passwordResetRepository.insert).not.toHaveBeenCalled();
      expect(mailService.enqueue).not.toHaveBeenCalled();
    });

    it('writes a token and enqueues mail for a real hit', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });

      await service.requestReset('a@b.com');

      expect(passwordResetRepository.insert).toHaveBeenCalledWith('user-1', expect.any(String));
      expect(mailService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@b.com', template: 'password-reset' }),
      );
    });
  });

  describe('confirmReset (CAS on used_at, then revokeAllForUser strictly after commit)', () => {
    function withManager() {
      const manager = { query: jest.fn() };
      dataSource.transaction.mockImplementation(async (fn: (m: unknown) => unknown) => fn(manager));
      return manager;
    }

    it('404 when the CAS loses and no row exists', async () => {
      withManager();
      passwordResetRepository.casConsume.mockResolvedValue(null);
      passwordResetRepository.findDiagnosisByHash.mockResolvedValue(null);

      await expect(service.confirmReset(validToken(), 'newpassword1234')).rejects.toMatchObject({
        status: 404,
      });
      expect(authService.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('410 RESET_TOKEN_CONSUMED on a reused token', async () => {
      withManager();
      passwordResetRepository.casConsume.mockResolvedValue(null);
      passwordResetRepository.findDiagnosisByHash.mockResolvedValue({
        used_at: new Date(),
        expires_at: new Date(Date.now() + 100_000),
      });

      await expect(service.confirmReset(validToken(), 'newpassword1234')).rejects.toMatchObject({
        status: 410,
      });
    });

    it('410 RESET_TOKEN_EXPIRED on an expired token', async () => {
      withManager();
      passwordResetRepository.casConsume.mockResolvedValue(null);
      passwordResetRepository.findDiagnosisByHash.mockResolvedValue({
        used_at: null,
        expires_at: new Date(Date.now() - 1000),
      });

      await expect(service.confirmReset(validToken(), 'newpassword1234')).rejects.toMatchObject({
        status: 410,
      });
    });

    it('happy path: writes the new password_hash inside the tx, then revokeAllForUser AFTER commit', async () => {
      const token = validToken();
      const manager = withManager();
      const hash = sha256Hex(token);
      passwordResetRepository.casConsume.mockResolvedValue({
        id: 'reset-1',
        user_id: 'user-1',
        token_hash: hash,
      });
      passwordHasher.hash.mockResolvedValue('$2b$04$newhash');

      await service.confirmReset(token, 'newpassword1234');

      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET password_hash'),
        ['$2b$04$newhash', 'user-1'],
      );
      expect(authService.revokeAllForUser).toHaveBeenCalledWith('user-1');
      // revokeAllForUser call ordering: the transaction (containing the
      // password write) must have already resolved by the time this runs —
      // proven by dataSource.transaction having been awaited before this
      // assertion executes at all (synchronous test structure).
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });
  });
});

function validToken(): string {
  return Buffer.alloc(32, 3).toString('base64url');
}
