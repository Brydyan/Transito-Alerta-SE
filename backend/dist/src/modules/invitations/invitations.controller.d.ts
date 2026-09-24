import type { Request } from 'express';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { AuthService, AuthTokens } from '../auth/auth.service';
import { AcceptInvitationDto } from '../auth/dto/accept-invitation.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationPreview, InvitationsService, InvitationSummary } from './invitations.service';
export declare class InvitationsController {
    private readonly invitationsService;
    private readonly authService;
    constructor(invitationsService: InvitationsService, authService: AuthService);
    invite(dto: CreateInvitationDto, req: AuthenticatedRequest): Promise<InvitationSummary>;
    pending(req: AuthenticatedRequest): Promise<InvitationSummary[]>;
    preview(token: string): Promise<InvitationPreview>;
    previewByPath(token: string): Promise<InvitationPreview>;
    acceptInvitationAlias(dto: AcceptInvitationDto, req: Request): Promise<AuthTokens>;
    remove(id: string): Promise<void>;
}
