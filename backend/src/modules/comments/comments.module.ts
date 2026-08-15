import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommentEntity } from '../../entities/comment.entity';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

/** CommentsModule (design DAG: `Comments -> Incidents, Users`). */
@Module({
  imports: [TypeOrmModule.forFeature([CommentEntity])],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
