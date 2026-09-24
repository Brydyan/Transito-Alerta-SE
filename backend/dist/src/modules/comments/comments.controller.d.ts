import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { CommentEntity } from '../../entities/comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentsService } from './comments.service';
export declare class CommentsController {
    private readonly commentsService;
    constructor(commentsService: CommentsService);
    create(dto: CreateCommentDto, req: AuthenticatedRequest): Promise<CommentEntity>;
    findByIncident(incidentId: string, req: AuthenticatedRequest): Promise<CommentEntity[]>;
    findOne(id: string): Promise<CommentEntity>;
    update(id: string, dto: UpdateCommentDto, req: AuthenticatedRequest): Promise<CommentEntity>;
    remove(id: string, req: AuthenticatedRequest): Promise<void>;
}
