import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { EmailVerificationService } from './email-verification.service';
export declare class VerifyOtpDto {
    otp: string;
}
export declare class EmailVerificationController {
    private readonly emailVerificationService;
    constructor(emailVerificationService: EmailVerificationService);
    verifyOtp(dto: VerifyOtpDto, req: AuthenticatedRequest): Promise<{
        verified: boolean;
    }>;
    resendVerification(req: AuthenticatedRequest): Promise<{
        queued: boolean;
    }>;
}
