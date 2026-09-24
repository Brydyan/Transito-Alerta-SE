import { DataSource, Repository } from 'typeorm';
import { OrganizationEntity } from '../../entities/organization.entity';
import { RoleEntity } from '../../entities/role.entity';
import { AuthContext } from '../../common/authz/subject-scope';
import { PasswordHasher } from '../auth/password-hasher';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { InvitationsRepository } from './invitations.repository';
export interface CreateInvitationInput {
    email: string;
    roleId: string;
    organizationId: string | null;
}
export interface InvitationSummary {
    id: string;
    email: string;
    role_id: string;
    organization_id: string | null;
    expires_at: Date;
    created_at: Date;
}
export interface InvitationPreview {
    organization_name: string | null;
    inviter_name: string | null;
    role_name: string;
    expires_at: Date;
}
export declare class InvitationsService {
    private readonly invitationsRepository;
    private readonly roleRepo;
    private readonly organizationRepo;
    private readonly dataSource;
    private readonly passwordHasher;
    private readonly mailService;
    private readonly configService;
    constructor(invitationsRepository: InvitationsRepository, roleRepo: Repository<RoleEntity>, organizationRepo: Repository<OrganizationEntity>, dataSource: DataSource, passwordHasher: PasswordHasher, mailService: MailService, configService: ConfigService);
    private get mailConfig();
    createInvitation(actor: AuthContext, input: CreateInvitationInput): Promise<InvitationSummary>;
    previewInvitation(token: string): Promise<InvitationPreview>;
    redeem(token: string, password: string, termsVersion?: string): Promise<string>;
    listPending(actor: AuthContext): Promise<InvitationSummary[]>;
    deletePending(id: string): Promise<void>;
    private isUniqueViolation;
    private gone;
}
