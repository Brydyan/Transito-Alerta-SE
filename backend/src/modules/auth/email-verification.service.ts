import { createHash, randomInt } from 'crypto';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { MailService } from '../mail/mail.service';

/** SHA-256 hex of a 6-digit OTP string. */
function sha256Hex(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

/**
 * EmailVerificationService (T6.5.C) — OTP-based email verification.
 *
 * OTP storage: 6-digit random code; DB stores SHA-256 hex; email delivers plain text.
 * TTL: 15 minutes. Rate limit: reject resend if issued < 60 seconds ago.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly mailService: MailService,
  ) {}

  /**
   * REG (sc-325) — D3 (design.md): cuando un correo ya registrado
   * recibe un intento de alta, NO se manda un OTP. Se manda un
   * aviso al titular informándole del intento (con la IP y el
   * user-agent si están disponibles). El OTP no es el canal — el
   * OTP lo pidió el titular cuando quiso verificar SU cuenta, no
   * un extraño. Mandar un OTP aquí confundiría al titular y
   * revelaría a un tercero que el correo existe.
   */
  async notifyExistingAccountAttempt(
    userId: string,
    ip: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || !user.email) return;

    await this.mailService.enqueue({
      to: user.email,
      subject: 'Se intentó crear una cuenta con tu correo',
      template: 'existing_account_attempt' as never,
      data: {
        ip: ip ?? 'desconocida',
        userAgent: userAgent ?? 'desconocido',
      },
    });
  }

  /** Rate limit: reject if current OTP was issued less than 60 seconds ago. */
  private assertRateLimit(user: UserEntity): void {
    if (user.verificationOtpExpiresAt) {
      const issuedAt = new Date(user.verificationOtpExpiresAt.getTime() - 15 * 60 * 1000);
      const secondsSinceIssuance = (Date.now() - issuedAt.getTime()) / 1000;
      if (secondsSinceIssuance < 60) {
        throw new HttpException(
          { message: 'OTP was recently issued. Please wait 60 seconds before requesting a new one.' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  /**
   * Generate a 6-digit OTP, store its SHA-256 hash in the user row, and
   * enqueue a verification email to the mail outbox.
   * Throws 429 if rate limit is exceeded, 422 if email is already verified.
   */
  async generateAndSendOtp(userId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      // Don't leak user existence — just treat as 422
      throw new UnprocessableEntityException('Cannot send verification email');
    }

    if (user.emailVerifiedAt) {
      throw new UnprocessableEntityException('Email is already verified');
    }

    this.assertRateLimit(user);

    const otp = String(randomInt(100000, 999999)); // 6-digit random
    const otpHash = sha256Hex(otp);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this.userRepo.update(userId, {
      verificationOtp: otpHash,
      verificationOtpExpiresAt: expiresAt,
    });

    if (user.email) {
      await this.mailService.enqueue({
        to: user.email,
        subject: 'Your email verification code',
        template: 'email_verification' as never,
        data: { otp, expiresMinutes: 15 },
      });
    } else {
      this.logger.warn(`User ${userId} has no email address; OTP generated but not sent`);
    }
  }

  /**
   * Verify an OTP: compare SHA-256(otp) with stored hash, check expiry.
   * On success: sets email_verified_at = NOW() and clears OTP columns.
   * Throws 422 for invalid OTP, expired OTP, or no pending OTP.
   */
  async verifyOtp(userId: string, otp: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnprocessableEntityException('Invalid OTP');
    }

    if (!user.verificationOtp || !user.verificationOtpExpiresAt) {
      throw new UnprocessableEntityException('No pending OTP for this account');
    }

    if (user.verificationOtpExpiresAt < new Date()) {
      throw new UnprocessableEntityException('OTP has expired');
    }

    const expectedHash = user.verificationOtp;
    const providedHash = sha256Hex(otp);

    if (expectedHash !== providedHash) {
      throw new UnprocessableEntityException('Invalid OTP');
    }

    await this.userRepo.update(userId, {
      emailVerifiedAt: new Date(),
      verificationOtp: null,
      verificationOtpExpiresAt: null,
    });
  }
}
