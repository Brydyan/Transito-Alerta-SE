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
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
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

  /**
   * 2026-10-06-incident-images-read-path (D3/D4) — byte route. The
   * metadata endpoint hands the frontend image IDs; the frontend
   * fetches the bytes from this route. The `JwtAuthGuard` is the
   * authorization boundary (D4) — a caller with a valid JWT who
   * guesses another incident's image UUID still gets 404 because
   * `service.getImageFile` checks `image.incidentId === :id`.
   *
   * When the storage provider hands back a `file://` URL (noop —
   * local dev), the service streams the bytes through. When the
   * provider returns an http(s) URL (Supabase in production), the
   * service issues a 302 redirect to a fresh signed URL.
   */
  @Get(':imageId/file')
  @HttpCode(HttpStatus.OK)
  async getFile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('imageId', new ParseUUIDPipe()) imageId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | void> {
    const result = await this.incidentImagesService.getImageFile(id, imageId);

    if (result.kind === 'redirect') {
      res.redirect(HttpStatus.FOUND, result.url);
      return;
    }

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', 'inline');
    return result.file;
  }
}
