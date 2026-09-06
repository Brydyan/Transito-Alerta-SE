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
import { EmailVerifiedGuard } from '../../common/guards/email-verified.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CommentEntity } from '../../entities/comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentsService } from './comments.service';

/**
 * CommentsController (R3).
 *
 * **ANON (sc-326)**: el techo anónimo está VACÍO. La identidad
 * anónima (`device_uuid === 'anonymous'`) ya no puede
 * autenticarse (ver `auth.service.ts:login()`), y aunque
 * pudiera, no crearía comentarios. `JwtAuthGuard` a nivel de
 * clase rechaza cualquier request sin token con 401 antes
 * de que la lógica del controller corra. Ver
 * `backend/test/e2e/anon-no-anonymous-creation.e2e-spec.ts`
 * para la verificación e2e. Los métodos de moderación
 * (delete/update) siguen denegando a no-dueños vía
 * `PermissionGuard` (CC1/R7) y `CommentsService.delete`
 * refuerza owner-only (403 para no-dueños, incluyendo
 * operadores autenticados).
 */
@Controller('comments')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @UseGuards(EmailVerifiedGuard)
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
