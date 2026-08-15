import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CommentEntity } from '../../entities/comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';

const SCRIPT_TAG_PATTERN = /<script[^>]*>[\s\S]*?<\/script\s*>/gi;

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
  ) {}

  async create(dto: CreateCommentDto, userId: string): Promise<CommentEntity> {
    const entity = this.commentRepo.create({
      content: sanitizeContent(dto.content),
      incidentId: dto.incident_id,
      userId,
    });
    const saved = await this.commentRepo.save(entity);
    this.eventEmitter.emit('comment.added', saved);
    return saved;
  }

  findByIncident(incidentId: string): Promise<CommentEntity[]> {
    return this.commentRepo.find({
      where: { incidentId },
      order: { createdAt: 'ASC' },
    });
  }

  async delete(commentId: string, requesterId: string): Promise<void> {
    const comment = await this.commentRepo.findOne({ where: { id: commentId } });
    if (!comment) {
      throw new NotFoundException(`Comment ${commentId} not found`);
    }
    if (comment.userId !== requesterId) {
      throw new ForbiddenException('Only the comment owner may delete it');
    }
    await this.commentRepo.delete(commentId);
  }
}
