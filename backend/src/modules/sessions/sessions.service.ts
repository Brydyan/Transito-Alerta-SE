import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { assertCanManage, assertVisible } from '../../common/authz/assert-can-manage';
import { AuthContext } from '../../common/authz/subject-scope';
import { hasPermission } from '../../common/guards/permission.guard';
import { SessionResponseDto, toSessionResponseDto } from './dto/session-response.dto';
import { RevocationCache } from './revocation-cache';
import { SessionsRepository } from './sessions.repository';

/**
 * SessionsService (T3.9 design §8 D9) — the authorization layer for
 * listing/revoking sessions. Self is ALWAYS permitted regardless of
 * permissions/rank (spec "Authorization"); cross-user access needs the
 * flat `sessions` permission (normally a guard, but DELETE /sessions/:id
 * is ONE route serving both self and cross-user, so the flat check is
 * replicated here instead of a blanket `@RequirePermission` decorator that
 * would incorrectly block a zero-permission self-revoke).
 *
 * Depends only on `SessionsRepository`/`RevocationCache` — both already
 * providers of this same leaf module (design §8), never `AuthService`.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly sessionsRepository: SessionsRepository,
    private readonly revocationCache: RevocationCache,
  ) {}

  async listForSelf(actor: AuthContext): Promise<SessionResponseDto[]> {
    const rows = await this.sessionsRepository.findActiveByUser(actor.userId);
    return rows.map((row) => toSessionResponseDto(row, actor.sessionId));
  }

  /**
   * `GET /users/:id/sessions` — a READ, so D9 gates visibility only, never
   * rank (design §8's "one new export, no new axis": `assertVisible`).
   */
  async listForTarget(actor: AuthContext, targetUserId: string): Promise<SessionResponseDto[]> {
    const target = await this.sessionsRepository.findManageableTarget(targetUserId);
    if (!target) {
      throw new NotFoundException('User not found');
    }
    assertVisible(actor, target);

    const rows = await this.sessionsRepository.findActiveByUser(targetUserId);
    return rows.map((row) => toSessionResponseDto(row, actor.sessionId));
  }

  /**
   * `DELETE /sessions/:id`. Self bypass: an actor revoking their OWN
   * session is always allowed (spec "A user revokes their own session with
   * zero permissions"), skipping the permission flag AND
   * visibility/rank entirely. Cross-user needs the flat `DELETE sessions`
   * permission (guard-equivalent) THEN `assertCanManage` (404 invisible,
   * 403 out-ranked, D10/D11 ordering).
   */
  async revokeForActor(actor: AuthContext, sessionId: string): Promise<void> {
    const session = await this.sessionsRepository.findActiveById(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.user_id !== actor.userId) {
      if (!hasPermission(actor.permissions, 'DELETE', 'sessions')) {
        throw new ForbiddenException('Missing permission: DELETE sessions');
      }
      const target = await this.sessionsRepository.findManageableTarget(session.user_id);
      if (!target) {
        throw new NotFoundException('Session not found');
      }
      assertCanManage(actor, target);
    }

    const revoked = await this.sessionsRepository.revoke(sessionId);
    if (!revoked) {
      return;
    }
    const ttlSeconds = revoked.expires_at
      ? Math.max(1, Math.ceil((revoked.expires_at.getTime() - Date.now()) / 1000))
      : 1;
    await this.revocationCache.revoke(sessionId, ttlSeconds);
  }
}
