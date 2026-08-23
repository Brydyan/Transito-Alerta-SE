import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommentEntity } from '../../entities/comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentsService } from './comments.service';

/**
 * CommentsController (R3). Anonymous devices hold "CREATE comments" on the
 * permission ceiling but NOT "DELETE comments" — PermissionGuard denies by
 * default (CC1/R7); CommentsService.delete additionally enforces
 * owner-only (403 for non-owners, including authenticated operators).
 */
@Controller('comments')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @RequirePermission('CREATE')
  create(
    @Body() dto: CreateCommentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CommentEntity> {
    return this.commentsService.create(dto, req.user!.userId);
  }

  @Get('incident/:incidentId')
  @RequirePermission('READ')
  findByIncident(
    @Param('incidentId') incidentId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<CommentEntity[]> {
    return this.commentsService.findByIncident(incidentId, req.user!.scope);
  }

  // ---- T5.6 GET /:id + PATCH /:id
  // `/:id` declared AFTER `/incident/:incidentId` so the literal
  // "incident" segment wins the matching race.

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<CommentEntity> {
    return this.commentsService.findOne(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCommentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CommentEntity> {
    return this.commentsService.update(id, dto.content, req.user!.userId);
  }

  @Delete(':id')
  @RequirePermission('DELETE')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    return this.commentsService.delete(id, req.user!.userId);
  }
}
