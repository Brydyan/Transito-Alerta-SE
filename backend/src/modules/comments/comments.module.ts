import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommentEntity } from '../../entities/comment.entity';
import { CommentImageEntity } from '../../entities/comment-image.entity';
import { StorageModule } from '../../core/storage/storage.module';
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
 * SC-209 Phase A — imports StorageModule so CommentImageStorageService can
 * @Inject(STORAGE_CLIENT) the real Supabase/noop backend (D1).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CommentEntity, CommentImageEntity]),
    IncidentsModule,
    StorageModule,
  ],
  controllers: [CommentsController, CommentImagesController],
  providers: [CommentsService, CommentImagesService, CommentImageStorageService],
  exports: [CommentsService],
})
export class CommentsModule {}
