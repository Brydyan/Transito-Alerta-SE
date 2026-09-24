import type { Request } from 'express';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { InvitationsService } from '../invitations/invitations.service';
import { AuthService, AuthTokens } from './auth.service';
import { AuthRegisterService } from './auth.register';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { PasswordResetService } from './password-reset.service';
export declare class AuthController {
    private readonly authService;
    private readonly authRegisterService;
    private readonly invitationsService;
    private readonly passwordResetService;
    constructor(authService: AuthService, authRegisterService: AuthRegisterService, invitationsService: InvitationsService, passwordResetService: PasswordResetService);
    register(dto: RegisterDto, req: Request): Promise<{
        message: string;
    }>;
    login(dto: LoginDto, req: Request): Promise<AuthTokens>;
    refresh(dto: RefreshDto, req: Request): Promise<AuthTokens>;
    acceptInvitation(dto: AcceptInvitationDto, req: Request): Promise<AuthTokens>;
    passwordReset(dto: PasswordResetRequestDto): Promise<void>;
    passwordResetConfirm(dto: PasswordResetConfirmDto): Promise<void>;
    changePassword(dto: ChangePasswordDto, req: AuthenticatedRequest): Promise<void>;
    me(req: AuthenticatedRequest): Promise<{
        user_id: string;
        device_uuid: string | null;
        permissions: string[];
        permission_names: string[];
        email_verified: boolean;
        role_name: string | null;
    }>;
    logout(req: AuthenticatedRequest): Promise<{
        success: boolean;
    }>;
}
