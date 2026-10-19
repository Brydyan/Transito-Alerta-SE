import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  StreamableFile,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IncidentImageEntity } from './entities/incident-image.entity';
// AUD (sc-327) D6 — el reporte anónimo escribe su autor real
// en `incident_reporters` (no en `incidents.citizen_id`, que
// apunta a la fila máscara). El guard de upload chequeaba sólo
// el match contra `incidents.citizen_id`, lo que rompía el
// flujo "Anónimo → subir fotos" (sc-419). Toca la tabla para
// reclamar autoría real sin tener que cargar la fila entera.
import { IncidentReporterEntity } from './entities/incident-reporters.entity';
import { IncidentImageStorageService, MulterFile } from './incident-image-storage.service';
import { IncidentImageDto } from './dto/incident-image.dto';
import { IncidentsRepository } from './incidents.repository';
import { IStorageClient, STORAGE_CLIENT } from '../../infra/storage/storage-client.interface';
import { SubjectScope } from '../../shared/authz/subject-scope';
import { hasPermission } from '../../shared/guards/permission.guard';
import { PermissionLookupService } from '../../shared/permissions/permission-lookup.service';

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
    @InjectRepository(IncidentReporterEntity)
    private readonly reporterRepo: Repository<IncidentReporterEntity>,
    private readonly storage: IncidentImageStorageService,
    @Inject(STORAGE_CLIENT) private readonly storageClient: IStorageClient,
    private readonly incidentsRepository: IncidentsRepository,
    // F6 fix: las `callerPermissions` son UUIDs (post-0051).
    // El check `includes('CREATE incident-images')` ya no
    // matchea — usamos el resolver.
    private readonly permissionLookup: PermissionLookupService,
  ) {}

  async listForIncident(incidentId: string, scope: SubjectScope): Promise<IncidentImageDto[]> {
    const incident = await this.incidentsRepository.findOne(incidentId, scope);
    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found or outside scope`);
    }

    const images = await this.imageRepo.find({
      where: { incidentId },
      order: { createdAt: 'ASC' },
    });
    // 2026-10-06-incident-images-read-path (D3) — the metadata DTO
    // no longer carries `url`. The frontend ALWAYS resolves the
    // image via the byte route (`GET /:id/images/:imageId/file`)
    // — see D4 / `incident-images.controller.ts`. Listing them
    // server-side avoids a second request to `getSignedUrl` and
    // sidesteps the local-dev `file://` block by piping bytes
    // through the backend instead.
    return images.map((img) => ({
      id: img.id,
      mime_type: img.mimeType,
      file_size: img.fileSize,
      created_at: img.createdAt,
    }));
  }

  async attachToIncident(
    incidentId: string,
    callerId: string,
    callerPermissions: string[],
    files: MulterFile[],
  ): Promise<IncidentImageDto[]> {
    const incident = await this.incidentsRepository.findOne(incidentId, PUBLIC_SCOPE);
    if (!incident) throw new NotFoundException(`Incident ${incidentId} not found`);

    const isOwner = incident.citizen_id === callerId;
    // AUD (sc-327) D6 / sc-419 — un reporte anónimo tiene
    // `incidents.citizen_id` apuntando al id de la máscara,
    // no al autor real. Sin este chequeo el reporter original
    // no podría subir fotos a su propia publicación. PK-only
    // probe: `exists()` traduce a `SELECT 1 … LIMIT 1`, no
    // carga columnas, no expone identidad.
    const isReporter =
      !isOwner &&
      (await this.reporterRepo.exists({
        where: { incidentId, userId: callerId },
      }));
    const canCreate = await hasPermission(
      callerPermissions,
      'CREATE',
      'incident-images',
      this.permissionLookup,
    );
    if (!isOwner && !isReporter && !canCreate) {
      throw new ForbiddenException('Not authorized to attach images to this incident');
    }

    for (const file of files) {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        throw new UnprocessableEntityException(`MIME type "${file.mimetype}" not allowed`);
      }
    }

    const results: IncidentImageDto[] = [];
    for (const file of files) {
      // 2026-10-06-incident-images-read-path (D3) — only the storage
      // key is persisted. The `STORAGE_CLIENT.upload` still returns
      // `{ key, url }` (interface contract — see
      // `StorageUploadResult`), but the URL is intentionally NOT
      // stored: it can be regenerated through `getSignedUrl` and the
      // pre-change stub was the source of stale `storage.example.com`
      // strings that the browser could never render.
      const { key } = await this.storage.upload(incidentId, file);
      const entity = this.imageRepo.create({
        incidentId,
        storageKey: key,
        mimeType: file.mimetype,
        fileSize: file.size,
      });
      const saved = await this.imageRepo.save(entity);
      results.push({
        id: saved.id,
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
    // AUD (sc-327) D6 / sc-419 — simétrico al upload: si el
    // caller publicó anónimamente, su `citizen_id` quedó en
    // la máscara y el match contra `incidents.citizen_id` falla.
    // Mismo patrón `exists()` PK-only; mismo razonamiento.
    const isReporter =
      !isOwner &&
      incident != null &&
      (await this.reporterRepo.exists({
        where: { incidentId, userId: callerId },
      }));
    const canDelete = await hasPermission(
      callerPermissions,
      'DELETE',
      'incident-images',
      this.permissionLookup,
    );
    if (!isOwner && !isReporter && !canDelete) {
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

  /**
   * 2026-10-06-incident-images-read-path (D3/D4) — byte route
   * service. Returns either:
   *   - a `StreamableFile` of the local bytes when the storage
   *     provider is `noop` (a `file://` URL the browser would
   *     block outright — D3 rationale), or
   *   - `{ kind: 'redirect', url }` when the provider hands back
   *     an http(s) URL (Supabase in production).
   *
   * The caller (controller) chooses what to do with the result.
   * `image.incidentId === incidentId` is enforced first as the
   * authorization boundary: a caller who knows one image UUID
   * cannot read another incident's image by guessing the route.
   */
  async getImageFile(
    incidentId: string,
    imageId: string,
  ): Promise<
    | { kind: 'stream'; file: StreamableFile; mimeType: string }
    | { kind: 'redirect'; url: string; mimeType: string }
  > {
    const image = await this.imageRepo.findOne({ where: { id: imageId } });
    // 2026-10-06-incident-images-read-path (D4) — the mismatch
    // case returns 404 without leaking whether the image exists
    // on a different incident (same response as "not found").
    if (!image || image.incidentId !== incidentId) {
      throw new NotFoundException(`Image ${imageId} not found on incident ${incidentId}`);
    }

    const signedUrl = await this.storageClient.getSignedUrl(image.storageKey);

    if (signedUrl.startsWith('file://')) {
      // NoopStorageClient returns `file://{absPath}` — pipe the file
      // through Express instead of redirecting, because browsers
      // strictly block `file://` for security (D3 rationale).
      const absPath = fileURLToPath(signedUrl);
      return {
        kind: 'stream',
        file: new StreamableFile(createReadStream(absPath)),
        mimeType: image.mimeType,
      };
    }

    return { kind: 'redirect', url: signedUrl, mimeType: image.mimeType };
  }
}
