import {
  BadRequestException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

/**
 * CompressionError family (F7 — WebP Image Compression, tasks T1.3, design D7).
 * Each subclass maps to a specific HTTP code so the frontend can interpret
 * without parsing the message.
 *
 * - FileTooLargeError     → 400 (pre-compression size gate, R4). The spec
 *                           narrative says "413" but NestJS does not ship a
 *                           PayloadTooLargeException; 400 BadRequest is the
 *                           closest standard exception. The `code` field
 *                           carries `FILE_TOO_LARGE` so the frontend can
 *                           pattern-match regardless of status.
 * - UnsupportedMimeType   → 415 (MIME allow-list rejection, R5)
 * - CompressionSizeExceeded → 400 (post-compression > per-type cap, R1-R3).
 *                           Carries `imageType` / `sizeKb` / `limitKb` for
 *                           callers and tests.
 * - CompressionFailed     → 422 (sharp processing error / corrupt input, R6)
 */
export class FileTooLargeError extends BadRequestException {
  constructor(sizeKb: number) {
    super({
      message: 'Archivo demasiado grande (máximo 100MB)',
      code: 'FILE_TOO_LARGE',
      sizeKb,
    });
  }
}

export class UnsupportedMimeType extends UnsupportedMediaTypeException {
  constructor(received: string) {
    super(
      `Formato no soportado: ${received}. Usa JPEG, PNG o WEBP`,
    );
  }
}

export class CompressionSizeExceeded extends BadRequestException {
  constructor(
    public readonly imageType: string,
    public readonly sizeKb: number,
    public readonly limitKb: number,
  ) {
    super({
      message: `Imagen demasiado pesada (>${limitKb}KB después de compresión). Usa una imagen más pequeña.`,
      code: 'COMPRESSION_SIZE_EXCEEDED',
      imageType,
      sizeKb,
      limitKb,
    });
  }
}

export class CompressionFailed extends UnprocessableEntityException {
  constructor(error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    super({
      message: 'Error al procesar imagen. Verifica que sea una imagen válida',
      code: 'COMPRESSION_FAILED',
      reason,
    });
  }
}
