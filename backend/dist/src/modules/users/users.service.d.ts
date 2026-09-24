import { Repository } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { RoleEntity } from '../../entities/role.entity';
import { OrganizationEntity } from '../../entities/organization.entity';
import { AuthContext, SubjectScope } from '../../common/authz/subject-scope';
import { AuthService } from '../auth/auth.service';
import { SessionResponseDto } from '../sessions/dto/session-response.dto';
import { SessionsRepository } from '../sessions/sessions.repository';
import { AvatarStorageService, UploadedFile } from './avatar-storage.service';
import { FormDataResponseDto } from './dto/form-data-response.dto';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
export declare const DEFAULT_PAGE_SIZE = 20;
export declare const MAX_PAGE_SIZE = 100;
export interface UpdateProfileInput {
    firstName?: string;
    lastName?: string;
    phone?: string;
}
export declare class UsersService {
    private readonly userRepo;
    private readonly avatarStorage;
    private readonly roleRepo;
    private readonly orgRepo;
    private readonly authService;
    private readonly sessionsRepository;
    constructor(userRepo: Repository<UserEntity>, avatarStorage: AvatarStorageService, roleRepo: Repository<RoleEntity>, orgRepo: Repository<OrganizationEntity>, authService: AuthService, sessionsRepository: SessionsRepository);
    findById(id: string): Promise<UserEntity>;
    getFormData(currentUser: AuthContext): Promise<FormDataResponseDto>;
    findOne(id: string): Promise<UserEntity | null>;
    findByRole(roleName: string): Promise<UserEntity[]>;
    updateProfile(id: string, input: UpdateProfileInput): Promise<UserEntity>;
    updateAvatar(id: string, file: UploadedFile): Promise<UserEntity>;
    list(page: number | undefined, limit: number | undefined, scope: SubjectScope, callerId?: string): Promise<{
        items: UserEntity[];
        total: number;
    }>;
    private findAndCount;
    getSessionsForSelf(actor: AuthContext): Promise<SessionResponseDto[]>;
    getSessionsForUser(actor: AuthContext, targetUserId: string): Promise<SessionResponseDto[]>;
    updateOrganization(actor: AuthContext, targetId: string, organizationId: string | null): Promise<UserEntity>;
    adminCreate(dto: AdminCreateUserDto): Promise<UserEntity>;
    adminUpdate(id: string, dto: AdminUpdateUserDto): Promise<UserEntity>;
    softDelete(id: string): Promise<void>;
}
