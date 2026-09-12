import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import {
  COMPRESSION_CONFIG,
  CompressionType,
} from './compression-config';
import {
  CompressionFailed,
  CompressionSizeExceeded,
  FileTooLargeError,
  UnsupportedMimeType,
} from './compression-error.exception';

export interface CompressionResult {
  buffer: Buffer;
  sizeKb: number;
  originalSizeKb: number;
  ratio: number;
  mimetype: 'image/webp';
}

/**
 * ImageCompressionService (F7 image-compression-webp, design D3) — wraps
 * sharp into a single injectable. The three image-upload services
 * (`AvatarStorageService`, `IncidentImageStorageService`,
 * `CommentImageStorageService`) inject this; they do not import sharp
 * directly.
 *
 * Per-type limits and quality settings come from `COMPRESSION_CONFIG` so
 * policy changes are a constant edit, not a code change here.
 */
@Injectable()
export class ImageCompressionService {
  private readonly logger = new Logger(ImageCompressionService.name);

  async compress(
    buffer: Buffer,
    type: CompressionType,
    mimeType: string,
  ): Promise<CompressionResult> {
    const config = COMPRESSION_CONFIG[type];
    const originalSizeKb = Math.ceil(buffer.length / 1024);

    // R4 — reject >maxInputSizeMb before touching sharp (OOM protection)
    const maxInputKb = COMPRESSION_CONFIG.maxInputSizeMb * 1024;
    if (originalSizeKb > maxInputKb) {
      throw new FileTooLargeError(originalSizeKb);
    }

    // R5 — MIME gate (runs before sharp so unsupported formats cost ~nothing)
    if (!COMPRESSION_CONFIG.supportedMimeTypes.includes(mimeType)) {
      throw new UnsupportedMimeType(mimeType);
    }

    let compressed: Buffer;
    try {
      // sharp.toBuffer does not expose a timeout option, so wrap the call
      // with Promise.race against COMPRESSION_CONFIG.timeout (design D6).
      compressed = await Promise.race([
        sharp(buffer).webp({ quality: config.quality }).toBuffer(),
        new Promise<Buffer>((_, reject) =>
          setTimeout(
            () => reject(new Error('sharp.toBuffer timeout')),
            COMPRESSION_CONFIG.timeout,
          ),
        ),
      ]);
    } catch (err) {
      // R6 — log full stack server-side, surface a sanitized 422 to the caller
      this.logger.error(
        `Sharp failed for ${type}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw new CompressionFailed(err);
    }

    const compressedSizeKb = Math.ceil(compressed.length / 1024);

    // R1/R2/R3 — post-compression size gate
    if (compressedSizeKb > config.maxSizeKb) {
      throw new CompressionSizeExceeded(type, compressedSizeKb, config.maxSizeKb);
    }

    // R7 — observability line in the agreed format
    const ratio = originalSizeKb / compressedSizeKb;
    this.logger.log(
      `[ImageCompression] ${type}: ${originalSizeKb}KB → ${compressedSizeKb}KB (ratio ${ratio.toFixed(1)}:1)`,
    );

    return {
      buffer: compressed,
      sizeKb: compressedSizeKb,
      originalSizeKb,
      ratio,
      mimetype: 'image/webp',
    };
  }
}
