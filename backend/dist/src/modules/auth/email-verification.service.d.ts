import { Repository } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { MailService } from '../mail/mail.service';
export declare class EmailVerificationService {
    private readonly userRepo;
    private readonly mailService;
    private readonly logger;
    constructor(userRepo: Repository<UserEntity>, mailService: MailService);
    notifyExistingAccountAttempt(userId: string, ip: string | null, userAgent: string | null, attemptedAt?: Date): Promise<void>;
    private assertRateLimit;
    generateAndSendOtp(userId: string): Promise<void>;
    verifyOtp(userId: string, otp: string): Promise<void>;
}
