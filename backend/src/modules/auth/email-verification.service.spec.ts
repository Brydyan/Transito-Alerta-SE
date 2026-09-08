import { createHash } from 'crypto';
import { HttpException, UnprocessableEntityException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { EmailVerificationService } from './email-verification.service';
import { UserEntity } from '../../entities/user.entity';
import { MailService } from '../mail/mail.service';

function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: 'user-1',
    email: 'test@example.com',
    emailVerifiedAt: null,
    verificationOtp: null,
    verificationOtpExpiresAt: null,
    isActive: true,
    ...overrides,
  } as unknown as UserEntity;
}

describe('EmailVerificationService', () => {
  let userRepo: {
    findOne: jest.Mock;
    update: jest.Mock;
  };
  let mailService: { enqueue: jest.Mock };
  let service: EmailVerificationService;

  beforeEach(() => {
    userRepo = { findOne: jest.fn(), update: jest.fn() };
    mailService = { enqueue: jest.fn() };
    service = new EmailVerificationService(
      userRepo as unknown as Repository<UserEntity>,
      mailService as unknown as MailService,
    );
  });

  describe('verifyOtp', () => {
    it('verifies a correct OTP and clears OTP columns', async () => {
      const otp = '123456';
      const hash = createHash('sha256').update(otp).digest('hex');
      const user = makeUser({
        verificationOtp: hash,
        verificationOtpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.update.mockResolvedValue({});

      await service.verifyOtp('user-1', otp);

      expect(userRepo.update).toHaveBeenCalledWith('user-1', expect.objectContaining({
        emailVerifiedAt: expect.any(Date),
        verificationOtp: null,
        verificationOtpExpiresAt: null,
      }));
    });

    it('throws 422 for incorrect OTP', async () => {
      const hash = createHash('sha256').update('999999').digest('hex');
      const user = makeUser({
        verificationOtp: hash,
        verificationOtpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      userRepo.findOne.mockResolvedValue(user);

      await expect(service.verifyOtp('user-1', '111111')).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws 422 for expired OTP', async () => {
      const otp = '123456';
      const hash = createHash('sha256').update(otp).digest('hex');
      const user = makeUser({
        verificationOtp: hash,
        verificationOtpExpiresAt: new Date(Date.now() - 1000), // expired
      });
      userRepo.findOne.mockResolvedValue(user);

      await expect(service.verifyOtp('user-1', otp)).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws 422 when no OTP is pending', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());

      await expect(service.verifyOtp('user-1', '123456')).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('generateAndSendOtp', () => {
    it('generates OTP, stores hash, and enqueues email', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userRepo.update.mockResolvedValue({});
      mailService.enqueue.mockResolvedValue('stream-id');

      await service.generateAndSendOtp('user-1');

      expect(userRepo.update).toHaveBeenCalledWith('user-1', expect.objectContaining({
        verificationOtp: expect.any(String),
        verificationOtpExpiresAt: expect.any(Date),
      }));
      expect(mailService.enqueue).toHaveBeenCalledWith(expect.objectContaining({ to: 'test@example.com' }));
    });

    it('throws 422 when email is already verified', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ emailVerifiedAt: new Date() }));

      await expect(service.generateAndSendOtp('user-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws 429 (TooManyRequests) when OTP was issued less than 60 seconds ago', async () => {
      // expiresAt is 15min from now, which means issuedAt is 0 seconds ago (just issued)
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const hash = createHash('sha256').update('123456').digest('hex');
      userRepo.findOne.mockResolvedValue(makeUser({ verificationOtp: hash, verificationOtpExpiresAt: expiresAt }));

      await expect(service.generateAndSendOtp('user-1')).rejects.toBeInstanceOf(HttpException);
    });
  });

  // ───── MAIL (sc-327) — C.1 — cobertura del template, no sólo del to ─────

  describe('generateAndSendOtp — asserta la plantilla además del destinatario', () => {
    // El test del round 0 (línea 99) assertaba sólo `{to: 'test@example.com'}`.
    // El vecino en password-reset.service.spec.ts asserta también
    // `template: 'password-reset'`. Este es el mismo: la omisión
    // del assert sobre `template` fue el hueco que dejó pasar el
    // defecto original (la plantilla se encolaba como string
    // suelto, sin verificación de que existiera en el registro).
    it('C.1: encola la plantilla email_verification con los datos { otp, expiresMinutes }', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      userRepo.update.mockResolvedValue({});
      mailService.enqueue.mockResolvedValue('stream-id');

      await service.generateAndSendOtp('user-1');

      expect(mailService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          template: 'email_verification',
          data: expect.objectContaining({
            otp: expect.any(String),
            expiresMinutes: 15,
          }),
        }),
      );
    });
  });

  describe('notifyExistingAccountAttempt', () => {
    it('C.1: encola la plantilla existing_account_attempt con los datos { ip, userAgent, attemptedAt }', async () => {
      // Este método no tenía test en el round 0. La omisión
      // es la causa raíz del defecto: nadie verificaba que
      // la plantilla existiera en el registro. sc-330
      // añade cobertura análoga a la de `generateAndSendOtp`.
      userRepo.findOne.mockResolvedValue(makeUser({ email: 'titular@example.com' }));
      mailService.enqueue.mockResolvedValue('stream-id');
      const now = new Date('2026-09-06T19:33:41.123Z');

      await service.notifyExistingAccountAttempt(
        'user-1',
        '190.15.142.87',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0',
        now,
      );

      expect(mailService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'titular@example.com',
          template: 'existing_account_attempt',
          data: expect.objectContaining({
            ip: '190.15.142.87',
            userAgent: expect.stringContaining('Mozilla'),
            attemptedAt: now.toISOString(),
          }),
        }),
      );
    });

    it('C.1: sin IP ni userAgent, la cola recibe "desconocida" / "desconocido" (D9)', async () => {
      // El service aplica los defaults; el render no se invoca
      // acá (eso es cosa del consumer), pero la forma de los
      // datos es el contrato con la plantilla.
      userRepo.findOne.mockResolvedValue(makeUser());
      mailService.enqueue.mockResolvedValue('stream-id');

      await service.notifyExistingAccountAttempt('user-1', null, null);

      expect(mailService.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          template: 'existing_account_attempt',
          data: expect.objectContaining({
            ip: 'desconocida',
            userAgent: 'desconocido',
            attemptedAt: expect.any(String),
          }),
        }),
      );
    });

    it('no encola si el usuario no existe (defensa contra input inválido)', async () => {
      userRepo.findOne.mockResolvedValue(null);
      mailService.enqueue.mockResolvedValue('stream-id');

      await service.notifyExistingAccountAttempt('ghost', 'ip', 'ua');

      expect(mailService.enqueue).not.toHaveBeenCalled();
    });

    it('no encola si el usuario no tiene email (la entidad existe pero email = null)', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ email: null }));
      mailService.enqueue.mockResolvedValue('stream-id');

      await service.notifyExistingAccountAttempt('user-1', 'ip', 'ua');

      expect(mailService.enqueue).not.toHaveBeenCalled();
    });

    it('usa la hora actual si no se pasa attemptedAt (default argument)', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      mailService.enqueue.mockResolvedValue('stream-id');

      const before = Date.now();
      await service.notifyExistingAccountAttempt('user-1', 'ip', 'ua');
      const after = Date.now();

      const call = mailService.enqueue.mock.calls[0][0];
      const attemptedAt = new Date(call.data.attemptedAt as string);
      expect(attemptedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(attemptedAt.getTime()).toBeLessThanOrEqual(after);
    });
  });
});
