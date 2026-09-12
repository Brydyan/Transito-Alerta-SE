/**
 * Compression configuration (F7 image-compression-webp, T1.2) — single
 * source of truth for quality, size limits, allowed MIME types and sharp
 * timeouts. Consumed by `ImageCompressionService`. Per-type (avatar vs
 * incident/comment) limits live here so changing policy is a constant edit,
 * not a hunt through services.
 */
export type CompressionType = 'avatar' | 'incident' | 'comment';

export interface CompressionTypeConfig {
  quality: number;
  maxSizeKb: number;
  type: CompressionType;
}

export const COMPRESSION_CONFIG = {
  avatar: {
    quality: 45,
    maxSizeKb: 100,
    type: 'avatar',
  },
  incident: {
    quality: 60,
    maxSizeKb: 300,
    type: 'incident',
  },
  comment: {
    quality: 60,
    maxSizeKb: 300,
    type: 'comment',
  },
  // Global
  maxInputSizeMb: 100,
  supportedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] as readonly string[],
  timeout: 30000, // 30s
};

export type CompressionTypeConfigMap = typeof COMPRESSION_CONFIG;
