import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { COMPRESSION_CONFIG, CompressionType } from './compression-config';
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
 * ImageCompressionService (F7 — WebP Image Compression, tasks T2.1, design D3)
 * — sharp-based compressor with per-type quality + post-compression size
 * caps, a pre-compression 100MB safety gate (R4, avoids OOM in sharp), and
 * a MIME allow-list (R5). Errors are rethrown as the typed exceptions from
 * `compression-error.exception.ts` so the HTTP layer doesn't need to know
 * about sharp at all.
 *
 * Timeout: the 30s budget (COMPRESSION_CONFIG.timeout) is enforced via
 * `Promise.race` against `setTimeout` (D3). Sharp's `toBuffer` does not
 * expose a `timeout` option — passing one is a TypeScript overload error
 * and has no runtime effect. The unit test asserts `toBuffer` is called
 * without options.
 *
 * Order: pre-size gate → MIME gate → sharp → post-size gate. Pre-size
 * runs first because it is the cheapest check and the one that can
 * otherwise OOM the process.
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

    // R4: pre-compression size gate. Cheap; runs first to avoid handing
    // a 500MB blob to sharp.
    if (originalSizeKb > COMPRESSION_CONFIG.maxInputSizeMb * 1024) {
      throw new FileTooLargeError(originalSizeKb);
    }

    // R5: MIME allow-list.
    if (!COMPRESSION_CONFIG.supportedMimeTypes.includes(mimeType)) {
      throw new UnsupportedMimeType(mimeType);
    }

    try {
      // Sharp: the work itself. `toBuffer` is async; we cap it via
      // Promise.race rather than passing a (non-existent) timeout option
      // (D3).
      const sharpWork = sharp(buffer)
        .webp({ quality: config.quality })
        .toBuffer();

      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('sharp compression timeout')),
          COMPRESSION_CONFIG.timeout,
        );
      });

      let compressed: Buffer;
      try {
        compressed = await Promise.race([sharpWork, timeout]);
      } finally {
        if (timer) clearTimeout(timer);
      }

      const compressedSizeKb = Math.ceil(compressed.length / 1024);

      // R1 / R2 / R3: post-compression size cap.
      if (compressedSizeKb > config.maxSizeKb) {
        throw new CompressionSizeExceeded(
          type,
          compressedSizeKb,
          config.maxSizeKb,
        );
      }

      // R7: log format "[ImageCompression] {type}: {X}KB → {Y}KB (ratio {Z}:1)".
      const ratio =
        compressedSizeKb > 0
          ? Number((originalSizeKb / compressedSizeKb).toFixed(1))
          : 0;
      this.logger.log(
        `[ImageCompression] ${type.charAt(0).toUpperCase() + type.slice(1)}: ${originalSizeKb}KB → ${compressedSizeKb}KB (ratio ${ratio}:1)`,
      );

      return {
        buffer: compressed,
        sizeKb: compressedSizeKb,
        originalSizeKb,
        ratio,
        mimetype: 'image/webp',
      };
    } catch (error) {
      // R6: re-throw typed exceptions unchanged so HTTP code mapping
      // stays in one place. Anything sharp-specific becomes
      // CompressionFailed (422).
      if (
        error instanceof CompressionSizeExceeded ||
        error instanceof UnsupportedMimeType ||
        error instanceof FileTooLargeError
      ) {
        throw error;
      }
      const reason = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Compression failed: ${reason.message}`,
        reason.stack,
      );
      throw new CompressionFailed(reason);
    }
  }
}
