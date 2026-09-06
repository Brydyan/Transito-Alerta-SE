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
import { EMAIL_ALREADY_VERIFIED, OTP_INVALID } from './auth-errors';

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
    attemptedAt: Date = new Date(),
  ): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || !user.email) return;

    await this.mailService.enqueue({
      to: user.email,
      subject: 'Se intentó crear una cuenta con tu correo',
      // MAIL B.1 (ronda 14) — el cast `as never` se quita: el
      // nombre es ahora un miembro válido de `TemplateName`.
      template: 'existing_account_attempt',
      data: {
        ip: ip ?? 'desconocida',
        userAgent: userAgent ?? 'desconocido',
        // MAIL A.4 — el momento del intento, no de la entrega.
        // El outbox es asíncrono; el renderizado usa este valor.
        attemptedAt: attemptedAt.toISOString(),
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
      throw new UnprocessableEntityException({
        code: OTP_INVALID,
        message: 'Cannot send verification email',
      });
    }

    if (user.emailVerifiedAt) {
      throw new UnprocessableEntityException({
        code: EMAIL_ALREADY_VERIFIED,
        message: 'Email is already verified',
      });
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
        // MAIL B.2 (ronda 14) — el cast `as never` se quita:
        // 'email_verification' ya es un miembro de `TemplateName`.
        template: 'email_verification',
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
   *
   * REG (sc-325) Fix B (ronda 10) — los 422 ahora llevan campo
   * `code` para que el frontend (C.3/C.6) pueda distinguir:
   *  - `OTP_INVALID` (código equivocado, vencido, o sin OTP pendiente)
   *  - `EMAIL_ALREADY_VERIFIED` (el correo ya estaba verificado)
   *
   * Antes del fix, las cuatro ramas lanzaban un string plano y
   * `e.error.code` era siempre `undefined` en el cliente. Un
   * reportero cuyo correo ya estaba verificado recibía el
   * mensaje de "reintentá" — exactamente lo que el spec prohíbe.
   */
  async verifyOtp(userId: string, otp: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnprocessableEntityException({
        code: OTP_INVALID,
        message: 'Invalid OTP',
      });
    }

    // REG (sc-325) Fix B (ronda 10) — el chequeo de "ya verificado"
    // vivía sólo en `generateAndSendOtp()` (línea 89). Si un OTP
    // viejo se somete cuando el correo ya está verificado (p.ej.
    // un segundo submit tras un éxito, o un OTP reenviado desde
    // una pestaña vieja), caía en "No pending OTP for this
    // account" con código `OTP_INVALID`. El spec exige distinguir
    // "ya verificado" de "código malo" — son dos razones distintas
    // y mensajes distintos. Subimos el chequeo a `verifyOtp`
    // también.
    if (user.emailVerifiedAt) {
      throw new UnprocessableEntityException({
        code: EMAIL_ALREADY_VERIFIED,
        message: 'Email is already verified',
      });
    }

    if (!user.verificationOtp || !user.verificationOtpExpiresAt) {
      throw new UnprocessableEntityException({
        code: OTP_INVALID,
        message: 'No pending OTP for this account',
      });
    }

    if (user.verificationOtpExpiresAt < new Date()) {
      throw new UnprocessableEntityException({
        code: OTP_INVALID,
        message: 'OTP has expired',
      });
    }

    const expectedHash = user.verificationOtp;
    const providedHash = sha256Hex(otp);

    if (expectedHash !== providedHash) {
      throw new UnprocessableEntityException({
        code: OTP_INVALID,
        message: 'Invalid OTP',
      });
    }

    await this.userRepo.update(userId, {
      emailVerifiedAt: new Date(),
      verificationOtp: null,
      verificationOtpExpiresAt: null,
    });
  }
}
