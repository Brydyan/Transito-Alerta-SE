import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { UserEntity } from '../../entities/user.entity';
import { sha256Hex, timingSafeEqualHex } from '../../common/crypto/session-hash';
import { MailConfig } from '../../config/mail.config';
import { MailService } from '../mail/mail.service';
import { AuthService } from './auth.service';
import { decodeTokenOrThrow, generateToken } from './token-codec';
import { PasswordHasher } from './password-hasher';
import { PasswordResetRepository } from './password-reset.repository';
import { RESET_TOKEN_CONSUMED, RESET_TOKEN_EXPIRED } from '../invitations/invitation-errors';

/**
 * PasswordResetService (T3.6 design "Component Design"). `requestReset` is
 * a silent-miss (D9) — always resolves, no exception, no timing signal —
 * and `confirmReset` CASes on `used_at` inside the SAME transaction as the
 * `password_hash` UPDATE, with `AuthService.revokeAllForUser` invoked AFTER
 * commit (spec "Password Identity").
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly passwordResetRepository: PasswordResetRepository,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly passwordHasher: PasswordHasher,
    private readonly mailService: MailService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private get mailConfig(): MailConfig {
    return this.configService.get<MailConfig>('mail')!;
  }

  /**
   * `POST /auth/password-reset {email}` — ALWAYS resolves (design D9,
   * corrects the brief's "404 if not found", itself an enumeration
   * oracle). Mails a single-use 24h token only on a real hit.
   */
  async requestReset(email: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) {
      return;
    }

    const token = generateToken();
    const tokenHash = sha256Hex(token);
    await this.passwordResetRepository.insert(user.id, tokenHash);

    await this.mailService.enqueue({
      to: email,
      subject: 'Reset your Transito Alerta SE password',
      template: 'password-reset',
      data: { link: `${this.mailConfig.appBaseUrl}/reset-password?token=${token}` },
    });
  }

  /**
   * `POST /auth/password-reset/confirm {token, password}` — CAS on
   * `used_at` + the `password_hash` UPDATE inside one transaction, then
   * `AuthService.revokeAllForUser` strictly AFTER commit (spares nobody,
   * D5).
   */
  async confirmReset(token: string, newPassword: string): Promise<void> {
    const decoded = decodeTokenOrThrow(token);
    const hash = sha256Hex(decoded);
    const passwordHash = await this.passwordHasher.hash(newPassword);

    const userId = await this.dataSource.transaction(async (manager: EntityManager) => {
      const row = await this.passwordResetRepository.casConsume(hash, manager);

      if (!row) {
        const diagnosis = await this.passwordResetRepository.findDiagnosisByHash(hash);
        if (!diagnosis) {
          throw new NotFoundException('Reset token not found');
        }
        if (diagnosis.used_at !== null) {
          throw this.gone(RESET_TOKEN_CONSUMED, 'Reset token already used');
        }
        throw this.gone(RESET_TOKEN_EXPIRED, 'Reset token expired');
      }

      if (!timingSafeEqualHex(hash, row.token_hash)) {
        throw new NotFoundException('Reset token not found');
      }

      await manager.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
        passwordHash,
        row.user_id,
      ]);
      return row.user_id;
    });

    // Strictly after commit (spec "Password Reset from a different device
    // forces re-login everywhere else").
    await this.authService.revokeAllForUser(userId);
  }

  /** `410 Gone` — no built-in Nest exception class for this status. */
  private gone(code: string, message: string): HttpException {
    return new HttpException({ code, message }, HttpStatus.GONE);
  }
}
