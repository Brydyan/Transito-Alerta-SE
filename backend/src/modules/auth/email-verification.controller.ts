import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { JwtAuthGuard } from './jwt-auth.guard';
import { EmailVerificationService } from './email-verification.service';

export class VerifyOtpDto {
  @IsString()
  otp!: string;
}

/**
 * EmailVerificationController (T6.5.D) — OTP-based email verification endpoints.
 *
 * POST /email/verify-otp — verify the OTP the user received; returns 200 on success.
 * POST /email/resend-verification — generate and send a new OTP; returns 202.
 *
 * Both endpoints require JWT authentication (user must be logged in).
 */
@Controller('email')
@UseGuards(JwtAuthGuard)
export class EmailVerificationController {
  constructor(private readonly emailVerificationService: EmailVerificationService) {}

  /**
   * POST /api/email/verify-otp
   * Body: { otp: string }
   * Verifies the 6-digit OTP and marks email_verified_at.
   * 200 on success, 422 on invalid/expired OTP, 401 without token.
   */
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ verified: boolean }> {
    await this.emailVerificationService.verifyOtp(req.user!.userId, dto.otp);
    return { verified: true };
  }

  /**
   * POST /api/email/resend-verification
   * Generates and sends a new OTP. Rate-limited to once per 60 seconds.
   * 202 Accepted (enqueued, not yet delivered), 429 on rate limit, 422 if already verified.
   */
  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  async resendVerification(@Req() req: AuthenticatedRequest): Promise<{ queued: boolean }> {
    await this.emailVerificationService.generateAndSendOtp(req.user!.userId);
    return { queued: true };
  }
}
