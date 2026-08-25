import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { CommentEntity } from '../../entities/comment.entity';
import { SubjectScope } from '../../common/authz/subject-scope';
import { IncidentsRepository } from '../incidents/incidents.repository';
import { CreateCommentDto } from './dto/create-comment.dto';

const SCRIPT_TAG_PATTERN = /<script[^>]*>[\s\S]*?<\/script\s*>/gi;

/**
 * T7.4 (D6) — legacy `MAX_COMMENT_DEPTH = 2`. Three visible levels
 * (0 root, 1 reply, 2 reply-to-a-reply); replying to a depth-2 comment
 * (which would create depth 3) is rejected.
 */
export const MAX_COMMENT_DEPTH = 2;

export interface CommentWithDepth extends CommentEntity {
  depth: number;
}

/**
 * Strips <script>...</script> tags entirely (spec R3), then escapes any
 * remaining angle brackets / quotes as HTML entities — defense in depth so
 * other tag-based injection (e.g. <img onerror=...>) is neutralized too.
 * Never store raw, unsanitized user input.
 */
export function sanitizeContent(raw: string): string {
  const withoutScripts = raw.replace(SCRIPT_TAG_PATTERN, '');
  return withoutScripts
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * CommentsService (R3) — design DAG `Comments -> Incidents, Users`.
 * Anonymous devices hold "CREATE comments" on the permission ceiling but
 * not DELETE — enforced at the controller via @RequirePermission plus an
 * owner check here (403 for non-owners, including operators).
 */
@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(CommentEntity)
    private readonly commentRepo: Repository<CommentEntity>,
    private readonly eventEmitter: EventEmitter2,
    private readonly incidentsRepository: IncidentsRepository,
  ) {}

  async create(dto: CreateCommentDto, userId: string): Promise<CommentEntity> {
    if (dto.parent_id) {
      await this.assertValidParent(dto.parent_id, dto.incident_id);
    }

    const entity = this.commentRepo.create({
      content: sanitizeContent(dto.content),
      incidentId: dto.incident_id,
      userId,
      parentId: dto.parent_id ?? null,
    });
    const saved = await this.commentRepo.save(entity);
    this.eventEmitter.emit('comment.added', saved);
    return saved;
  }

  /**
   * T7.4.A7 — the parent must belong to the same incident (R9.4) and must
   * not already be at max depth (R9.6), or replying to it would create a
   * depth-3 comment.
   */
  private async assertValidParent(parentId: string, incidentId: string): Promise<void> {
    const parent = await this.commentRepo.findOne({ where: { id: parentId } });
    if (!parent) {
      throw new BadRequestException(`Parent comment ${parentId} not found`);
    }
    if (parent.incidentId !== incidentId) {
      throw new BadRequestException('parent_id must belong to the same incident');
    }
    const parentDepth = await this.depthOf(parent);
    if (parentDepth >= MAX_COMMENT_DEPTH) {
      throw new BadRequestException('Maximum comment depth reached');
    }
  }

  /**
   * Mirrors legacy `Comment::getDepthAttribute()` (design D6): no parent →
   * 0; parent with no parent → 1; anything else → 2 (saturates — this
   * project never persists depth > 2, `assertValidParent` guarantees it).
   */
  private async depthOf(comment: Pick<CommentEntity, 'parentId'>): Promise<number> {
    if (!comment.parentId) return 0;
    const parent = await this.commentRepo.findOne({ where: { id: comment.parentId } });
    if (!parent || !parent.parentId) return 1;
    return 2;
  }

  /**
   * Resolves the PARENT incident under the caller's scope first (T3.2
   * design D3 table) — comments do not scope their own rows. 404 when the
   * parent is invisible, even though the caller holds READ comments.
   */
  async findByIncident(incidentId: string, scope: SubjectScope): Promise<CommentWithDepth[]> {
    const incident = await this.incidentsRepository.findOne(incidentId, scope);
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found`);
    }

    const comments = await this.commentRepo.find({
      where: { incidentId, deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });

    // T7.4.A9 — depth is computed in-memory from the already-fetched thread
    // (every comment for this incident is in `comments`), not via a query
    // per row: no parent -> 0; parent has no parent -> 1; else -> 2.
    const byId = new Map(comments.map((c) => [c.id, c]));
    const depthOf = (c: CommentEntity): number => {
      if (!c.parentId) return 0;
      const parent = byId.get(c.parentId);
      if (!parent || !parent.parentId) return 1;
      return 2;
    };

    return comments.map((c) => ({ ...c, depth: depthOf(c) }));
  }

  /**
   * T7.4.A8 — soft-deletes the comment AND its full thread (children and
   * grandchildren, depth up to 2) in a single statement. A one-level
   * `WHERE id = $1 OR parent_id = $1` is not enough once depth 2 exists
   * (design D6) — `WITH RECURSIVE` walks the whole subtree regardless of
   * which node in the thread was targeted.
   */
  async delete(commentId: string, requesterId: string): Promise<void> {
    const comment = await this.commentRepo.findOne({ where: { id: commentId } });
    if (!comment) {
      throw new NotFoundException(`Comment ${commentId} not found`);
    }
    if (comment.userId !== requesterId) {
      throw new ForbiddenException('Only the comment owner may delete it');
    }
    await this.commentRepo.manager.query(
      `WITH RECURSIVE thread AS (
         SELECT id FROM comments WHERE id = $1
         UNION ALL
         SELECT c.id FROM comments c JOIN thread t ON c.parent_id = t.id
       )
       UPDATE comments SET deleted_at = now()
       WHERE id IN (SELECT id FROM thread) AND deleted_at IS NULL`,
      [commentId],
    );
  }

  // ---- T5.6: findOne + update

  async findOne(id: string): Promise<CommentEntity> {
    const comment = await this.commentRepo.findOne({ where: { id } });
    if (!comment) {
      throw new NotFoundException(`Comment ${id} not found`);
    }
    return comment;
  }

  /**
   * T5.6 — edit an existing comment. Re-applies the same XSS sanitiser
   * used by `create` (defense in depth). Ownership is enforced — only
   * the original author may edit.
   */
  async update(id: string, content: string, requesterId: string): Promise<CommentEntity> {
    const comment = await this.findOne(id);
    if (comment.userId !== requesterId) {
      throw new ForbiddenException('Only the comment owner may edit it');
    }
    comment.content = sanitizeContent(content);
    return this.commentRepo.save(comment);
  }
}
