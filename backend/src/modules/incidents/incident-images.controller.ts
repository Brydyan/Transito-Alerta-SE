import {
  Controller,
  Delete,
  Get,
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
import { AuthenticatedRequest } from '../../shared/interfaces/authenticated-request';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../../shared/guards/permission.guard';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { IncidentImageDto } from './dto/incident-image.dto';
import { MulterFile } from './incident-image-storage.service';
import { IncidentImagesService } from './incident-images.service';

/**
 * IncidentImagesController (T6.6.D) — mirrors CommentImagesController.
 * POST /api/incidents/:id/images — upload up to 5 images.
 * DELETE /api/incidents/:id/images/:imageId — remove one image.
 */
@Controller('incidents/:id/images')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class IncidentImagesController {
  constructor(private readonly incidentImagesService: IncidentImagesService) {}

  @Get()
  @RequirePermission('READ')
  getImages(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<IncidentImageDto[]> {
    const user = req.user!;
    return this.incidentImagesService.listForIncident(id, user.scope);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor('images', 5, { limits: { fileSize: 10 * 1024 * 1024 } }))
  attachImages(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFiles() files: MulterFile[],
    @Req() req: AuthenticatedRequest,
  ): Promise<IncidentImageDto[]> {
    const user = req.user!;
    return this.incidentImagesService.attachToIncident(id, user.userId, user.permissions, files);
  }

  @Delete(':imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeImage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('imageId', new ParseUUIDPipe()) imageId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    const user = req.user!;
    return this.incidentImagesService.removeFromIncident(id, imageId, user.userId, user.permissions);
  }
}
