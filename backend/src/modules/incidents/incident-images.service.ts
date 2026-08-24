import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IncidentImageEntity } from '../../entities/incident-image.entity';
import { IncidentImageStorageService, MulterFile } from './incident-image-storage.service';
import { IncidentImageDto } from './dto/incident-image.dto';
import { IncidentsRepository } from './incidents.repository';
import { SubjectScope } from '../../common/authz/subject-scope';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Public scope allows finding the parent incident without org restriction
const PUBLIC_SCOPE: SubjectScope = { kind: 'global' };

/**
 * IncidentImagesService (T6.6.C) — mirrors CommentImagesService pattern.
 * Upload images to incidents; verify ownership or 'CREATE incident-images' permission.
 * Delete images from incidents; verify ownership or 'DELETE incident-images' permission.
 */
@Injectable()
export class IncidentImagesService {
  private readonly logger = new Logger(IncidentImagesService.name);

  constructor(
    @InjectRepository(IncidentImageEntity)
    private readonly imageRepo: Repository<IncidentImageEntity>,
    private readonly storage: IncidentImageStorageService,
    private readonly incidentsRepository: IncidentsRepository,
  ) {}

  async attachToIncident(
    incidentId: string,
    callerId: string,
    callerPermissions: string[],
    files: MulterFile[],
  ): Promise<IncidentImageDto[]> {
    const incident = await this.incidentsRepository.findOne(incidentId, PUBLIC_SCOPE);
    if (!incident) throw new NotFoundException(`Incident ${incidentId} not found`);

    const isOwner = incident.citizen_id === callerId;
    const hasPermission = callerPermissions.includes('CREATE incident-images');
    if (!isOwner && !hasPermission) {
      throw new ForbiddenException('Not authorized to attach images to this incident');
    }

    for (const file of files) {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        throw new UnprocessableEntityException(`MIME type "${file.mimetype}" not allowed`);
      }
    }

    const results: IncidentImageDto[] = [];
    for (const file of files) {
      const { key, url } = await this.storage.upload(incidentId, file);
      const entity = this.imageRepo.create({
        incidentId,
        storageKey: key,
        url,
        mimeType: file.mimetype,
        fileSize: file.size,
      });
      const saved = await this.imageRepo.save(entity);
      results.push({
        id: saved.id,
        url: saved.url,
        mime_type: saved.mimeType,
        file_size: saved.fileSize,
        created_at: saved.createdAt,
      });
    }
    return results;
  }

  async removeFromIncident(
    incidentId: string,
    imageId: string,
    callerId: string,
    callerPermissions: string[],
  ): Promise<void> {
    const image = await this.imageRepo.findOne({ where: { id: imageId } });
    if (!image || image.incidentId !== incidentId) {
      throw new NotFoundException(`Image ${imageId} not found on incident ${incidentId}`);
    }

    const incident = await this.incidentsRepository.findOne(incidentId, PUBLIC_SCOPE);
    const isOwner = incident?.citizen_id === callerId;
    const hasPermission = callerPermissions.includes('DELETE incident-images');
    if (!isOwner && !hasPermission) {
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
