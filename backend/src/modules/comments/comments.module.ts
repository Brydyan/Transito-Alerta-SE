import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommentEntity } from '../../entities/comment.entity';
import { IncidentsModule } from '../incidents/incidents.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

/**
 * CommentsModule (design DAG: `Comments -> Incidents, Users`). Imports
 * IncidentsModule (T3.2 D3) for `IncidentsRepository` — resolving the
 * parent incident's visibility before returning its comments.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CommentEntity]), IncidentsModule],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
