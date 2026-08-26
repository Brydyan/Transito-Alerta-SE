import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommentEntity } from '../../entities/comment.entity';
import { CommentImageEntity } from '../../entities/comment-image.entity';
import { IncidentsModule } from '../incidents/incidents.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { CommentImageStorageService } from './comment-image-storage.service';
import { CommentImagesService } from './comment-images.service';
import { CommentImagesController } from './comment-images.controller';

/**
 * CommentsModule (design DAG: `Comments -> Incidents, Users`). Imports
 * IncidentsModule (T3.2 D3) for `IncidentsRepository` — resolving the
 * parent incident's visibility before returning its comments.
 *
 * T5.5 — adds CommentImagesController + CommentImagesService +
 * CommentImageStorageService for upload/delete of comment attachments.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CommentEntity, CommentImageEntity]), IncidentsModule],
  controllers: [CommentsController, CommentImagesController],
  providers: [CommentsService, CommentImagesService, CommentImageStorageService],
  exports: [CommentsService],
})
export class CommentsModule {}
