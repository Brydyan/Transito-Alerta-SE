import { AuthContext } from '../../common/authz/subject-scope';
import { PermissionLookupService } from '../../common/permissions/permission-lookup.service';
import { SessionResponseDto } from './dto/session-response.dto';
import { RevocationCache } from './revocation-cache';
import { SessionsRepository } from './sessions.repository';
export declare class SessionsService {
    private readonly sessionsRepository;
    private readonly revocationCache;
    private readonly permissionLookup;
    constructor(sessionsRepository: SessionsRepository, revocationCache: RevocationCache, permissionLookup: PermissionLookupService);
    listForSelf(actor: AuthContext): Promise<SessionResponseDto[]>;
    listForTarget(actor: AuthContext, targetUserId: string): Promise<SessionResponseDto[]>;
    revokeForActor(actor: AuthContext, sessionId: string): Promise<void>;
}
