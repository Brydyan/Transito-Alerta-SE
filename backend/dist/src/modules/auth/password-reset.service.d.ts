import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { MailService } from '../mail/mail.service';
import { AuthService } from './auth.service';
import { PasswordHasher } from './password-hasher';
import { PasswordResetRepository } from './password-reset.repository';
export declare class PasswordResetService {
    private readonly passwordResetRepository;
    private readonly userRepo;
    private readonly dataSource;
    private readonly passwordHasher;
    private readonly mailService;
    private readonly authService;
    private readonly configService;
    constructor(passwordResetRepository: PasswordResetRepository, userRepo: Repository<UserEntity>, dataSource: DataSource, passwordHasher: PasswordHasher, mailService: MailService, authService: AuthService, configService: ConfigService);
    private get mailConfig();
    requestReset(email: string): Promise<void>;
    confirmReset(token: string, newPassword: string): Promise<void>;
    private gone;
}
