import {
  BadRequestException,
  UnsupportedMediaTypeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ImageCompressionService } from './image-compression.service';
import {
  CompressionFailed,
  CompressionSizeExceeded,
  FileTooLargeError,
  UnsupportedMimeType,
} from './compression-error.exception';

/**
 * Unit tests for ImageCompressionService (T2.3) — sharp is mocked here.
 * The integration spec at `image-compression.integration.spec.ts` uses
 * the real library. Keep this file hermetic: no network, no disk.
 */

// sharp's public surface that the service uses:
//   sharp(buffer)                — default callable
//     .webp({ quality }).toBuffer() — chainable instance helpers
//
// jest.mock's factory runs BEFORE module-scope `const` initializers, so
// we cannot declare the mocks at the top level and reference them inside
// the factory. Instead the factory allocates the mocks itself and stashes
// them on a holder object that's captured by closure.
type SharpMocks = {
  callable: jest.Mock;
  webp: jest.Mock;
  toBuffer: jest.Mock;
};

// `jest.mock` factories are hoisted ABOVE module-scope `const` bindings,
// so the mock cannot capture closures over module-scope variables. We
// stash the mock refs on `globalThis.__sharpMocks` (a plain property
// always present at script-load time) and read them back via the
// `sharp()` helper below.
jest.mock('sharp', () => {
  const callable = jest.fn();
  const webp = jest.fn();
  const toBuffer = jest.fn();
  callable.mockImplementation(() => ({ webp, toBuffer }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__sharpMocks = { callable, webp, toBuffer };
  return {
    __esModule: true,
    default: callable,
  };
});

function sharp(): SharpMocks {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = (globalThis as any).__sharpMocks as SharpMocks | undefined;
  if (!m) {
    throw new Error('sharp mock factory never ran');
  }
  return m;
}

describe('ImageCompressionService (unit, sharp mocked)', () => {
  let service: ImageCompressionService;

  beforeEach(() => {
    service = new ImageCompressionService();
    const m = sharp();
    m.callable.mockClear();
    m.webp.mockClear();
    m.toBuffer.mockClear();
    m.callable.mockImplementation(() => ({
      webp: m.webp,
      toBuffer: m.toBuffer,
    }));
  });

  // Helper — wire the chainable mock so .toBuffer() resolves a buffer of
  // the requested KB size. Returns nothing; tests assert on the result.
  const arrange = (compressedSizeKb: number): void => {
    const compressed = Buffer.alloc(compressedSizeKb * 1024, 0xab);
    const m = sharp();
    m.webp.mockReturnValue({ toBuffer: m.toBuffer });
    m.toBuffer.mockResolvedValue(compressed);
  };

  describe('happy path', () => {
    it('avatar: compresses JPEG 35MB and returns <100KB WebP result', async () => {
      const original = Buffer.alloc(35 * 1024 * 1024, 0xff);
      arrange(85);

      const result = await service.compress(original, 'avatar', 'image/jpeg');

      expect(result.buffer.length).toBe(85 * 1024);
      expect(result.sizeKb).toBe(85);
      expect(result.originalSizeKb).toBe(35 * 1024);
      // 35840 / 85 ≈ 421.6
      expect(result.ratio).toBeGreaterThan(400);
      expect(result.mimetype).toBe('image/webp');
    });

    it('incident: compresses PNG 20MB and returns <300KB WebP result', async () => {
      const original = Buffer.alloc(20 * 1024 * 1024, 0xee);
      arrange(250);

      const result = await service.compress(original, 'incident', 'image/png');

      expect(result.sizeKb).toBe(250);
      expect(result.mimetype).toBe('image/webp');
    });

    it('comment: passes quality=60 to sharp (same as incident)', async () => {
      const original = Buffer.alloc(1024, 0x01);
      arrange(128);

      await service.compress(original, 'comment', 'image/webp');

      expect(sharp().webp).toHaveBeenCalledWith({ quality: 60 });
    });

    it('avatar: passes quality=45 to sharp', async () => {
      const original = Buffer.alloc(1024, 0x01);
      arrange(50);

      await service.compress(original, 'avatar', 'image/jpeg');

      expect(sharp().webp).toHaveBeenCalledWith({ quality: 45 });
    });

    it('sharp.toBuffer is called without options (timeout enforced via Promise.race, not sharp API)', async () => {
      const original = Buffer.alloc(1024, 0x01);
      arrange(10);

      await service.compress(original, 'avatar', 'image/jpeg');

      // sharp does not expose a toBuffer timeout option; design D6's 30s
      // budget is enforced via Promise.race in the service.
      expect(sharp().toBuffer).toHaveBeenCalledWith();
    });
  });

  describe('R4 — pre-compression size validation', () => {
    it('rejects 150MB buffer with FileTooLargeError (sharp MUST NOT be invoked)', async () => {
      const huge = Buffer.alloc(150 * 1024 * 1024, 0xff);

      await expect(
        service.compress(huge, 'avatar', 'image/jpeg'),
      ).rejects.toBeInstanceOf(FileTooLargeError);

      expect(sharp().callable).not.toHaveBeenCalled();
    });

    it('FileTooLargeError is a BadRequestException subclass', () => {
      const e = new FileTooLargeError(150 * 1024);
      expect(e).toBeInstanceOf(BadRequestException);
    });
  });

  describe('R5 — MIME type validation', () => {
    it('rejects BMP with UnsupportedMimeType', async () => {
      const buf = Buffer.alloc(1024, 0x01);

      await expect(
        service.compress(buf, 'avatar', 'image/bmp'),
      ).rejects.toBeInstanceOf(UnsupportedMimeType);

      expect(sharp().callable).not.toHaveBeenCalled();
    });

    it('UnsupportedMimeType is an UnsupportedMediaTypeException subclass', () => {
      const e = new UnsupportedMimeType('image/bmp');
      expect(e).toBeInstanceOf(UnsupportedMediaTypeException);
    });

    it('accepts each of image/jpeg, image/png, image/webp', async () => {
      const buf = Buffer.alloc(1024, 0x01);
      arrange(10);

      for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
        await expect(
          service.compress(buf, 'avatar', mime),
        ).resolves.toBeDefined();
      }
    });
  });

  describe('R1/R2/R3 — post-compression size validation', () => {
    it('rejects avatar result >100KB with CompressionSizeExceeded', async () => {
      const original = Buffer.alloc(1024 * 1024, 0xff);
      arrange(150); // > 100KB cap for avatar

      await expect(
        service.compress(original, 'avatar', 'image/jpeg'),
      ).rejects.toBeInstanceOf(CompressionSizeExceeded);
    });

    it('rejects incident result >300KB with CompressionSizeExceeded', async () => {
      const original = Buffer.alloc(1024 * 1024, 0xee);
      arrange(350); // > 300KB cap for incident

      await expect(
        service.compress(original, 'incident', 'image/png'),
      ).rejects.toBeInstanceOf(CompressionSizeExceeded);
    });

    it('exposes imageType, sizeKb, limitKb on the thrown error', async () => {
      const original = Buffer.alloc(1024 * 1024, 0xff);
      arrange(150);

      try {
        await service.compress(original, 'avatar', 'image/jpeg');
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(CompressionSizeExceeded);
        const e = err as CompressionSizeExceeded;
        expect(e.imageType).toBe('avatar');
        expect(e.sizeKb).toBe(150);
        expect(e.limitKb).toBe(100);
      }
    });
  });

  describe('R6 — sharp error handling', () => {
    it('wraps sharp.toBuffer rejection in CompressionFailed (HTTP 422)', async () => {
      const original = Buffer.alloc(1024, 0x01);
      const sharpError = new Error('Input image is corrupt or truncated');
      const m = sharp();
      m.webp.mockReturnValue({ toBuffer: m.toBuffer });
      m.toBuffer.mockRejectedValue(sharpError);

      await expect(
        service.compress(original, 'avatar', 'image/jpeg'),
      ).rejects.toBeInstanceOf(CompressionFailed);
    });

    it('CompressionFailed is an UnprocessableEntityException subclass', () => {
      const e = new CompressionFailed(new Error('x'));
      expect(e).toBeInstanceOf(UnprocessableEntityException);
    });

    it('does NOT rewrap known domain errors as CompressionFailed', async () => {
      // CompressionSizeExceeded must pass through, not be wrapped in 422.
      const original = Buffer.alloc(1024 * 1024, 0xff);
      arrange(150);

      await expect(
        service.compress(original, 'avatar', 'image/jpeg'),
      ).rejects.toBeInstanceOf(CompressionSizeExceeded);
    });
  });

  describe('R7 — logging', () => {
    it('emits a single log line in [ImageCompression] type: XKB → YKB (ratio Z:1) format', async () => {
      const original = Buffer.alloc(35 * 1024 * 1024, 0xff);
      arrange(85);

      const logSpy = jest
        .spyOn((service as unknown as { logger: { log: jest.Mock } }).logger, 'log')
        .mockImplementation(() => undefined);

      await service.compress(original, 'avatar', 'image/jpeg');

      expect(logSpy).toHaveBeenCalledTimes(1);
      const msg = logSpy.mock.calls[0][0] as string;
      expect(msg).toMatch(/^\[ImageCompression\] avatar: \d+KB → \d+KB \(ratio [\d.]+:1\)$/);
      expect(msg).toContain('avatar');
      expect(msg).toContain('KB');
      expect(msg).toContain(':1');

      logSpy.mockRestore();
    });

    it('does not log on compression failure (no half-reported success)', async () => {
      const original = Buffer.alloc(1024, 0x01);
      const m = sharp();
      m.webp.mockReturnValue({ toBuffer: m.toBuffer });
      m.toBuffer.mockRejectedValue(new Error('boom'));

      const logSpy = jest
        .spyOn((service as unknown as { logger: { log: jest.Mock } }).logger, 'log')
        .mockImplementation(() => undefined);

      await expect(
        service.compress(original, 'avatar', 'image/jpeg'),
      ).rejects.toBeInstanceOf(CompressionFailed);

      expect(logSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });
});
