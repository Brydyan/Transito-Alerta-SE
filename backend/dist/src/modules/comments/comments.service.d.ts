import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { CommentEntity } from '../../entities/comment.entity';
import { SubjectScope } from '../../common/authz/subject-scope';
import { IncidentsRepository } from '../incidents/incidents.repository';
import { CreateCommentDto } from './dto/create-comment.dto';
export declare const MAX_COMMENT_DEPTH = 2;
export interface CommentWithDepth extends CommentEntity {
    depth: number;
}
export declare function sanitizeContent(raw: string): string;
export declare class CommentsService {
    private readonly commentRepo;
    private readonly eventEmitter;
    private readonly incidentsRepository;
    constructor(commentRepo: Repository<CommentEntity>, eventEmitter: EventEmitter2, incidentsRepository: IncidentsRepository);
    create(dto: CreateCommentDto, userId: string): Promise<CommentEntity>;
    private assertValidParent;
    private depthOf;
    findByIncident(incidentId: string, scope: SubjectScope): Promise<CommentWithDepth[]>;
    delete(commentId: string, requesterId: string): Promise<void>;
    findOne(id: string): Promise<CommentEntity>;
    update(id: string, content: string, requesterId: string): Promise<CommentEntity>;
}
