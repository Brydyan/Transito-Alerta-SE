import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommentEntity } from '../../entities/comment.entity';
import { CommentImageEntity } from '../../entities/comment-image.entity';
import { StorageModule } from '../../core/storage/storage.module';
import { IncidentsModule } from '../incidents/incidents.module';
// REG (sc-325) — ver `incidents.module.ts` por la razón completa.
// `EmailVerifiedGuard` necesita `UserEntity` para leer
// `email_verified_at` directo de la BD; replicamos el forFeature
// local en lugar de importar `AuthModule`/`UsersModule`.
import { UserEntity } from '../../entities/user.entity';
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
    TypeOrmModule.forFeature([CommentEntity, CommentImageEntity, UserEntity]),
    IncidentsModule,
    StorageModule,
  ],
  controllers: [CommentsController, CommentImagesController],
  providers: [CommentsService, CommentImagesService, CommentImageStorageService],
  exports: [CommentsService],
})
export class CommentsModule {}
