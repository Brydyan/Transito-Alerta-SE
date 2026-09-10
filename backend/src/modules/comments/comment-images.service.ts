import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommentEntity } from '../../entities/comment.entity';
import { CommentImageEntity } from '../../entities/comment-image.entity';
import { CommentImageStorageService, MulterFile } from './comment-image-storage.service';
import { CommentImageDto } from './dto/comment-image.dto';
import { hasPermission } from '../../common/guards/permission.guard';
import { PermissionLookupService } from '../../common/permissions/permission-lookup.service';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

@Injectable()
export class CommentImagesService {
  private readonly logger = new Logger(CommentImagesService.name);

  constructor(
    @InjectRepository(CommentEntity)
    private readonly commentRepo: Repository<CommentEntity>,
    @InjectRepository(CommentImageEntity)
    private readonly imageRepo: Repository<CommentImageEntity>,
    private readonly storage: CommentImageStorageService,
    // F6 fix: las `callerPermissions` vienen como UUIDs desde la
    // migration 0051 (antes strings formateados). El check
    // `includes('CREATE comment-images')` ya no matchea nada.
    // Inyectamos el resolver y usamos el helper `hasPermission`
    // del PermissionGuard (que traduce a UUID vía el lookup).
    private readonly permissionLookup: PermissionLookupService,
  ) {}

  async attachToComment(
    commentId: string,
    callerId: string,
    callerPermissions: string[],
    files: MulterFile[],
  ): Promise<CommentImageDto[]> {
    const comment = await this.commentRepo.findOne({ where: { id: commentId } });
    if (!comment) throw new NotFoundException(`Comment ${commentId} not found`);

    const isOwner = comment.userId === callerId;
    const canCreate = await hasPermission(
      callerPermissions,
      'CREATE',
      'comment-images',
      this.permissionLookup,
    );
    if (!isOwner && !canCreate) {
      throw new ForbiddenException('Not authorized to attach images to this comment');
    }

    for (const file of files) {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        throw new UnprocessableEntityException(`MIME type "${file.mimetype}" not allowed`);
      }
    }

    const results: CommentImageDto[] = [];
    for (const file of files) {
      const { key, url } = await this.storage.upload(commentId, file);
      const entity = this.imageRepo.create({
        commentId,
        storageKey: key,
        url,
        mimeType: file.mimetype,
        fileSize: file.size,
      });
      const saved = await this.imageRepo.save(entity);
      results.push({
        id: saved.id,
        url: saved.url,
        mimeType: saved.mimeType,
        fileSize: saved.fileSize,
        createdAt: saved.createdAt,
      });
    }
    return results;
  }

  async removeFromComment(
    commentId: string,
    imageId: string,
    callerId: string,
    callerPermissions: string[],
  ): Promise<void> {
    const image = await this.imageRepo.findOne({ where: { id: imageId } });
    if (!image || image.commentId !== commentId) {
      throw new NotFoundException(`Image ${imageId} not found on comment ${commentId}`);
    }

    const comment = await this.commentRepo.findOne({ where: { id: commentId } });
    const isOwner = comment?.userId === callerId;
    const canDelete = await hasPermission(
      callerPermissions,
      'DELETE',
      'comment-images',
      this.permissionLookup,
    );
    if (!isOwner && !canDelete) {
      throw new ForbiddenException('Not authorized to delete this image');
    }

    try {
      await this.storage.delete(image.storageKey);
    } catch (err) {
      this.logger.warn('S3 delete failed', {
        key: image.storageKey,
        error: (err as Error).message,
      });
    }

    await this.imageRepo.delete({ id: imageId });
  }
}
