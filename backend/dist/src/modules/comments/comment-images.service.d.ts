import { Repository } from 'typeorm';
import { CommentEntity } from '../../entities/comment.entity';
import { CommentImageEntity } from '../../entities/comment-image.entity';
import { CommentImageStorageService, MulterFile } from './comment-image-storage.service';
import { CommentImageDto } from './dto/comment-image.dto';
import { PermissionLookupService } from '../../common/permissions/permission-lookup.service';
export declare class CommentImagesService {
    private readonly commentRepo;
    private readonly imageRepo;
    private readonly storage;
    private readonly permissionLookup;
    private readonly logger;
    constructor(commentRepo: Repository<CommentEntity>, imageRepo: Repository<CommentImageEntity>, storage: CommentImageStorageService, permissionLookup: PermissionLookupService);
    attachToComment(commentId: string, callerId: string, callerPermissions: string[], files: MulterFile[]): Promise<CommentImageDto[]>;
    removeFromComment(commentId: string, imageId: string, callerId: string, callerPermissions: string[]): Promise<void>;
}
