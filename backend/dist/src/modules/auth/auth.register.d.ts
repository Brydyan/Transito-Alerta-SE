import { DataSource, Repository } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { RoleEntity } from '../../entities/role.entity';
import { PasswordHasher } from './password-hasher';
import { EmailVerificationService } from './email-verification.service';
export interface RegisterInput {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    ip: string | null;
    userAgent: string | null;
}
export declare class RegistrationRateLimited extends Error {
    readonly scope: 'ip' | 'email';
    constructor(scope: 'ip' | 'email');
}
export declare const REGISTRATION_INDISTINGUISHABLE_MESSAGE = "Si el correo no estaba registrado, te enviamos un mensaje para verificar tu cuenta.";
export declare class AuthRegisterService {
    private readonly userRepo;
    private readonly roleRepo;
    private readonly passwordHasher;
    private readonly emailVerificationService;
    private readonly dataSource;
    private readonly logger;
    private readonly WINDOW_MS;
    private readonly IP_MAX;
    private readonly EMAIL_MAX;
    private readonly ipStore;
    private readonly emailStore;
    constructor(userRepo: Repository<UserEntity>, roleRepo: Repository<RoleEntity>, passwordHasher: PasswordHasher, emailVerificationService: EmailVerificationService, dataSource: DataSource);
    register(input: RegisterInput): Promise<{
        success: true;
        userId: string;
        publicMessage: {
            message: string;
        };
    }>;
    private assertRateLimit;
    private registerIpHit;
    private registerEmailHit;
}
