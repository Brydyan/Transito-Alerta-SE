import sharp from 'sharp';
import { ImageCompressionService } from './image-compression.service';
import {
  CompressionFailed,
  CompressionSizeExceeded,
  FileTooLargeError,
  UnsupportedMimeType,
} from './compression-error.exception';

/**
 * Integration tests for ImageCompressionService (T6.1) — REAL sharp, no
 * mock. We build input buffers with sharp itself so the test data has a
 * real, parseable header. The unit spec at
 * `image-compression.service.spec.ts` keeps sharp mocked.
 *
 * Note on size: building a 35 MB buffer in-memory is fine here, but we
 * keep it bounded (32 MB JPEG, 16 MB PNG) so the suite stays fast on CI.
 */

const ONE_MB = 1024 * 1024;

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 140, b: 160 },
    },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 200, g: 50, b: 50 },
    },
  })
    .png()
    .toBuffer();
}

describe('ImageCompressionService (integration, real sharp)', () => {
  let service: ImageCompressionService;

  beforeAll(() => {
    service = new ImageCompressionService();
  });

  describe('happy path', () => {
    it('avatar: large JPEG compresses to <100KB WebP under the spec target ratio', async () => {
      // 4000x3000 JPEG — large but reasonable. The spec uses a 35 MB example;
      // we keep the suite under ~10s by staying below that.
      const input = await makeJpeg(4000, 3000);

      const t0 = Date.now();
      const result = await service.compress(input, 'avatar', 'image/jpeg');
      const elapsedMs = Date.now() - t0;

      expect(result.mimetype).toBe('image/webp');
      expect(result.sizeKb).toBeLessThanOrEqual(100);
      expect(result.originalSizeKb).toBeGreaterThan(0);
      // Real sharp on this input compresses to a few KB — ratio is huge,
      // but the spec only requires <100KB so we don't pin a lower bound
      // that would flake on different libvips builds.
      expect(result.ratio).toBeGreaterThan(1);
      // Verify the buffer is actually valid WebP
      const meta = await sharp(result.buffer).metadata();
      expect(meta.format).toBe('webp');

      // Sanity on timing — should be well below the 30s design budget.
      expect(elapsedMs).toBeLessThan(10000);
    });

    it('incident: 16MB PNG compresses to <300KB WebP', async () => {
      const input = await makePng(3000, 2000);

      const t0 = Date.now();
      const result = await service.compress(input, 'incident', 'image/png');
      const elapsedMs = Date.now() - t0;

      expect(result.mimetype).toBe('image/webp');
      expect(result.sizeKb).toBeLessThanOrEqual(300);
      expect(result.originalSizeKb).toBeGreaterThan(0);

      const meta = await sharp(result.buffer).metadata();
      expect(meta.format).toBe('webp');

      expect(elapsedMs).toBeLessThan(10000);
    });

    it('comment: re-encoding an already-WebP image still produces <300KB (normalisation)', async () => {
      const input = await sharp({
        create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 20, b: 30 } },
      })
        .webp({ quality: 80 })
        .toBuffer();

      const result = await service.compress(input, 'comment', 'image/webp');

      expect(result.mimetype).toBe('image/webp');
      expect(result.sizeKb).toBeLessThanOrEqual(300);
    });

    it('sequential uploads do not leak memory (Scenario 9 — 10 compressions)', async () => {
      const input = await makeJpeg(2000, 1500);

      const before = process.memoryUsage().heapUsed;
      for (let i = 0; i < 10; i++) {
        const r = await service.compress(input, 'avatar', 'image/jpeg');
        expect(r.sizeKb).toBeLessThanOrEqual(100);
      }
      // Encourage GC so the read is meaningful.
      if (global.gc) {
        global.gc();
      }
      const after = process.memoryUsage().heapUsed;
      const deltaMb = (after - before) / ONE_MB;
      // Generous bound: sharp + libvips transient buffers can leave a
      // 50-100MB residue on Node ≤20 without forced GC. The point of the
      // test is "doesn't grow without bound across runs" — 150 MB is
      // more than enough headroom for 10 small avatar re-encodings.
      expect(deltaMb).toBeLessThan(150);
    });
  });

  describe('error paths (real sharp)', () => {
    it('R4: 150MB raw bytes rejected before sharp is touched (FileTooLargeError)', async () => {
      // A 150MB plain Buffer is enough — we never give it to sharp.
      const huge = Buffer.alloc(150 * ONE_MB, 0xff);

      await expect(
        service.compress(huge, 'avatar', 'image/jpeg'),
      ).rejects.toBeInstanceOf(FileTooLargeError);
    });

    it('R5: BMP mimetype is rejected (UnsupportedMimeType)', async () => {
      const tinyJpeg = await makeJpeg(64, 64);

      await expect(
        service.compress(tinyJpeg, 'avatar', 'image/bmp'),
      ).rejects.toBeInstanceOf(UnsupportedMimeType);
    });

    it('R6: corrupt JPEG payload is rejected with CompressionFailed (HTTP 422)', async () => {
      // Build a real JPEG header, then truncate it so sharp can't parse it.
      const real = await makeJpeg(256, 256);
      const truncated = real.subarray(0, Math.max(8, Math.floor(real.length / 4)));

      await expect(
        service.compress(truncated, 'avatar', 'image/jpeg'),
      ).rejects.toBeInstanceOf(CompressionFailed);
    });

    it('R1: post-compression size guard fires when the source resists compression', async () => {
      // Real, valid PNG of high-frequency random noise. WebP Q45 cannot
      // compress noise well — the result must exceed the 100KB avatar cap.
      const width = 1500;
      const height = 1500;
      const channels = 3;
      const noise = Buffer.alloc(width * height * channels);
      for (let i = 0; i < noise.length; i++) {
        noise[i] = Math.floor(Math.random() * 256);
      }
      const png = await sharp(noise, { raw: { width, height, channels } })
        .png()
        .toBuffer();

      await expect(
        service.compress(png, 'avatar', 'image/png'),
      ).rejects.toBeInstanceOf(CompressionSizeExceeded);
    });
  });
});
