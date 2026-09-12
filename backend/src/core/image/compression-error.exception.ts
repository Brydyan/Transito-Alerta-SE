import {
  BadRequestException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

/**
 * Compression-specific exceptions (F7 image-compression-webp, T1.3).
 * Subclass NestJS standard exceptions so the global AllExceptionsFilter
 * and any other consumers keep working — these exceptions only add
 * a precise `code` field for the controller / frontend to switch on.
 */

/** R4 — archivo >100MB rechazado antes de invocar sharp. */
export class FileTooLargeError extends BadRequestException {
  constructor(sizeKb: number) {
    super({
      message: `Archivo demasiado grande (${sizeKb}KB). Máximo permitido: 100MB`,
      code: 'FILE_TOO_LARGE',
    });
  }
}

/** R5 — formato no soportado (BMP, GIF, SVG, TIFF, etc). */
export class UnsupportedMimeType extends UnsupportedMediaTypeException {
  constructor(received: string) {
    super(
      `Formato de imagen no soportado: ${received}. Usa JPEG, PNG o WEBP`,
    );
  }
}

/** R1/R2/R3 — la compresión salió pero el resultado supera el límite del tipo. */
export class CompressionSizeExceeded extends BadRequestException {
  constructor(
    public readonly imageType: string,
    public readonly sizeKb: number,
    public readonly limitKb: number,
  ) {
    super({
      message: `Imagen demasiado pesada (>${limitKb}KB después de compresión). Usa una imagen más pequeña`,
      code: 'COMPRESSION_SIZE_EXCEEDED',
    });
  }
}

/** R6 — sharp falló: archivo corrupto, truncado, o error interno. */
export class CompressionFailed extends UnprocessableEntityException {
  constructor(error: unknown) {
    super(
      `Error al procesar imagen. Verifica que sea una imagen válida`,
    );
    // Stack trace is intentionally NOT exposed in the response; the
    // caller (ImageCompressionService) is responsible for logging it
    // before throwing, per R6.
    void error;
  }
}
