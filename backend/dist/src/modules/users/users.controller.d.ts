import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { UserEntity } from '../../entities/user.entity';
import { SessionResponseDto } from '../sessions/dto/session-response.dto';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { FormDataResponseDto } from './dto/form-data-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserOrganizationDto } from './dto/update-user-organization.dto';
import { UploadedFile as AvatarFile } from './avatar-storage.service';
import { UsersService } from './users.service';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    me(req: AuthenticatedRequest): Promise<UserEntity>;
    getFormData(req: AuthenticatedRequest): Promise<FormDataResponseDto>;
    updateProfile(dto: UpdateProfileDto, req: AuthenticatedRequest): Promise<UserEntity>;
    updateAvatar(file: AvatarFile, req: AuthenticatedRequest): Promise<UserEntity>;
    meSessions(req: AuthenticatedRequest): Promise<SessionResponseDto[]>;
    adminCreate(dto: AdminCreateUserDto): Promise<UserEntity>;
    adminShow(id: string): Promise<UserEntity>;
    adminUpdate(id: string, dto: AdminUpdateUserDto): Promise<UserEntity>;
    adminDelete(id: string): Promise<void>;
    userSessions(id: string, req: AuthenticatedRequest): Promise<SessionResponseDto[]>;
    list(req: AuthenticatedRequest, page?: string, limit?: string): Promise<{
        items: UserEntity[];
        total: number;
    }>;
    updateOrganization(id: string, dto: UpdateUserOrganizationDto, req: AuthenticatedRequest): Promise<UserEntity>;
}
