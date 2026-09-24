import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { CommentImageDto } from './dto/comment-image.dto';
import { MulterFile } from './comment-image-storage.service';
import { CommentImagesService } from './comment-images.service';
export declare class CommentImagesController {
    private readonly commentImagesService;
    constructor(commentImagesService: CommentImagesService);
    attachImages(id: string, files: MulterFile[], req: AuthenticatedRequest): Promise<CommentImageDto[]>;
    removeImage(id: string, imageId: string, req: AuthenticatedRequest): Promise<void>;
}
