import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommentImageDto } from './dto/comment-image.dto';
import { MulterFile } from './comment-image-storage.service';
import { CommentImagesService } from './comment-images.service';

@Controller('comments/:id/images')
@UseGuards(JwtAuthGuard)
export class CommentImagesController {
  constructor(private readonly commentImagesService: CommentImagesService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('images', 5, { limits: { fileSize: 5 * 1024 * 1024 } }))
  attachImages(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFiles() files: MulterFile[],
    @Req() req: AuthenticatedRequest,
  ): Promise<CommentImageDto[]> {
    const user = req.user!;
    return this.commentImagesService.attachToComment(id, user.userId, user.permissions, files);
  }

  @Delete(':imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeImage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('imageId', new ParseUUIDPipe()) imageId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    const user = req.user!;
    return this.commentImagesService.removeFromComment(id, imageId, user.userId, user.permissions);
  }
}
