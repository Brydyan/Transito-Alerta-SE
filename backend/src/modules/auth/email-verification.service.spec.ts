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
});
