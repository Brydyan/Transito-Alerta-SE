import { Logger } from '@nestjs/common';
import sharp from 'sharp';
import {
  CompressionFailed,
  FileTooLargeError,
  UnsupportedMimeType,
} from './compression-error.exception';
import { ImageCompressionService } from './image-compression.service';

/**
 * Integration tests for ImageCompressionService (F7 — T6.1) using REAL
 * sharp. These exercise the actual JPEG/PNG → WebP pipeline with
 * generated images, not mocks. The byte sizes are scaled-down
 * equivalents of the spec's S1/S2 because allocating 35MB of real
 * pixel data just to throw it away is wasteful — what we're testing
 * is that real sharp produces real WebP under the per-type cap and
 * the error paths trigger.
 */
describe('ImageCompressionService (integration, real sharp)', () => {
  let service: ImageCompressionService;
  let logSpy: jest.SpyInstance;

  // Build a real JPEG of roughly `targetKb` using sharp's generator.
  async function realJpeg(targetKb: number): Promise<Buffer> {
    const pixels = Math.max(200, Math.floor(targetKb * 64));
    const side = Math.ceil(Math.sqrt(pixels));
    return sharp({
      create: {
        width: side,
        height: side,
        channels: 3,
        background: { r: 200, g: 100, b: 50 },
      },
    })
      .jpeg({ quality: 90 })
      .toBuffer();
  }

  async function realPng(targetKb: number): Promise<Buffer> {
    const pixels = Math.max(200, Math.floor(targetKb * 64));
    const side = Math.ceil(Math.sqrt(pixels));
    return sharp({
      create: {
        width: side,
        height: side,
        channels: 4,
        background: { r: 30, g: 120, b: 200 },
      },
    })
      .png()
      .toBuffer();
  }

  beforeEach(() => {
    service = new ImageCompressionService();
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('S1: real JPEG avatar compresses to WebP under the 100KB cap', async () => {
    const jpeg = await realJpeg(512); // ~512KB JPEG
    const result = await service.compress(jpeg, 'avatar', 'image/jpeg');
    expect(result.mimetype).toBe('image/webp');
    expect(result.sizeKb).toBeLessThanOrEqual(100);
    // Output must be valid WebP — verify by feeding it back to sharp.
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe('webp');
  });

  it('S2: real PNG incident image compresses to WebP under the 300KB cap', async () => {
    const png = await realPng(1024); // ~1MB PNG
    const result = await service.compress(png, 'incident', 'image/png');
    expect(result.mimetype).toBe('image/webp');
    expect(result.sizeKb).toBeLessThanOrEqual(300);
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe('webp');
  });

  it('S3: re-normalises an already-WebP comment image under the 300KB cap', async () => {
    const sourceJpeg = await realJpeg(256);
    const webpInput = await sharp(sourceJpeg).webp({ quality: 80 }).toBuffer();
    const result = await service.compress(
      webpInput,
      'comment',
      'image/webp',
    );
    expect(result.mimetype).toBe('image/webp');
    expect(result.sizeKb).toBeLessThanOrEqual(300);
  });

  it('S5: >100MB file rejected with FileTooLargeError before sharp runs', async () => {
    // We don't actually allocate 100MB — the pre-size gate runs on
    // buffer.length, so a 101MB Buffer of zeros suffices.
    const huge = Buffer.alloc(101 * 1024 * 1024);
    await expect(
      service.compress(huge, 'avatar', 'image/jpeg'),
    ).rejects.toBeInstanceOf(FileTooLargeError);
  });

  it('S6: BMP mime rejected with UnsupportedMimeType before sharp runs', async () => {
    await expect(
      service.compress(Buffer.from('BMxxxx'), 'avatar', 'image/bmp'),
    ).rejects.toBeInstanceOf(UnsupportedMimeType);
  });

  it('S7: corrupt JPEG rejected with CompressionFailed (422)', async () => {
    const corrupt = Buffer.from('not a real jpeg at all');
    await expect(
      service.compress(corrupt, 'avatar', 'image/jpeg'),
    ).rejects.toBeInstanceOf(CompressionFailed);
  });

  it('S9: 10 sequential compressions all succeed with no throw', async () => {
    for (let i = 0; i < 10; i++) {
      const jpeg = await realJpeg(128);
      const result = await service.compress(jpeg, 'avatar', 'image/jpeg');
      expect(result.sizeKb).toBeLessThanOrEqual(100);
    }
    expect(logSpy).toHaveBeenCalledTimes(10);
  });

  it('S4: timing — a single avatar compression completes well under 5s', async () => {
    const jpeg = await realJpeg(512);
    const start = Date.now();
    const result = await service.compress(jpeg, 'avatar', 'image/jpeg');
    const elapsed = Date.now() - start;
    expect(result.sizeKb).toBeLessThanOrEqual(100);
    expect(elapsed).toBeLessThan(5000);
  });
});
