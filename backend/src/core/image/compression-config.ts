/**
 * COMPRESSION_CONFIG (F7 — WebP Image Compression, tasks T1.2, design D4/D5)
 * — per-type WebP quality + post-compression size caps, plus a global
 * pre-compression size gate (R4) and the MIME allow-list (R5).
 *
 * `supportedMimeTypes` is typed `readonly string[]` (NOT `as const`) so
 * `Array.prototype.includes` accepts the caller-supplied `mimeType: string`
 * without a type cast. The runtime check is identical; the spec's `as const`
 * tuple is a type-checker landmine for any caller with a wider type (D4).
 */
export const COMPRESSION_CONFIG = {
  avatar: {
    quality: 45,
    maxSizeKb: 100,
    type: 'avatar' as const,
  },
  incident: {
    quality: 60,
    maxSizeKb: 300,
    type: 'incident' as const,
  },
  comment: {
    quality: 60,
    maxSizeKb: 300,
    type: 'comment' as const,
  },
  // Global
  maxInputSizeMb: 100,
  supportedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
  ] as readonly string[],
  timeout: 30000, // 30s
} as const;

export type CompressionType = 'avatar' | 'incident' | 'comment';
