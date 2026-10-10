import { Logger } from '@nestjs/common';
import {
  CompressionFailed,
  CompressionSizeExceeded,
  FileTooLargeError,
  UnsupportedMimeType,
} from './compression-error.exception';
import { ImageCompressionService } from './image-compression.service';

/**
 * Unit tests for ImageCompressionService (F7 — T2.3). Sharp is MOCKED here
 * so the tests run in milliseconds and assert on the service's contract:
 * order of validations, error type, error message, the exact log format
 * (R7), and the option-shape passed to sharp's `toBuffer` (D3 — no
 * `timeout` option, that's a TS overload error).
 *
 * Mock strategy: jest replaces the `sharp` module with a callable factory
 * that returns a chainable object whose terminal `toBuffer` resolves or
 * rejects per the test. The factory also records calls so we can assert
 * on the webp options and the absence of a `toBuffer` `timeout` option.
 */

jest.mock('sharp', () => {
  const chain = {
    webp: jest.fn(),
    toBuffer: jest.fn(),
  };
  chain.webp.mockImplementation(() => chain);
  const sharpMock = jest.fn(() => chain) as jest.Mock & { __chain: typeof chain };
  sharpMock.__chain = chain;
  return { __esModule: true, default: sharpMock };
});

// Re-import after the mock is registered so the service holds the mock.
import sharp from 'sharp';
import { COMPRESSION_CONFIG } from './compression-config';

const sharpMock = sharp as unknown as jest.Mock & {
  __chain: { webp: jest.Mock; toBuffer: jest.Mock };
};
const sharpChain = sharpMock.__chain;

describe('ImageCompressionService', () => {
  let service: ImageCompressionService;
  let loggerLogSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  const fakeResult = (sizeKb: number) => Buffer.alloc(sizeKb * 1024, 0xab);

  function resetChain() {
    sharpChain.toBuffer.mockReset();
    sharpMock.mockClear();
  }

  beforeEach(() => {
    resetChain();
    service = new ImageCompressionService();
    loggerLogSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('happy path (R1 / R2 / R3)', () => {
    it('avatar: 35000KB JPEG → WebP at quality 45, under 100KB', async () => {
      const webp = fakeResult(85);
      sharpChain.toBuffer.mockResolvedValue(webp);

      const result = await service.compress(
        Buffer.alloc(35_000 * 1024),
        'avatar',
        'image/jpeg',
      );

      expect(sharpMock).toHaveBeenCalledTimes(1);
      expect(sharpChain.webp).toHaveBeenCalledWith({ quality: 45 });
      expect(sharpChain.toBuffer).toHaveBeenCalledWith();
      expect(result.sizeKb).toBe(85);
      expect(result.originalSizeKb).toBe(35_000);
      expect(result.mimetype).toBe('image/webp');
    });

    it('incident: 20000KB PNG → WebP at quality 60, under 300KB', async () => {
      const webp = fakeResult(250);
      sharpChain.toBuffer.mockResolvedValue(webp);

      const result = await service.compress(
        Buffer.alloc(20_000 * 1024),
        'incident',
        'image/png',
      );

      expect(sharpChain.webp).toHaveBeenCalledWith({ quality: 60 });
      expect(result.sizeKb).toBe(250);
      expect(result.mimetype).toBe('image/webp');
    });

    it('comment: 500KB WEBP → re-normalised to WebP at quality 60, under 300KB', async () => {
      const webp = fakeResult(120);
      sharpChain.toBuffer.mockResolvedValue(webp);

      const result = await service.compress(
        Buffer.alloc(500 * 1024),
        'comment',
        'image/webp',
      );

      expect(sharpChain.webp).toHaveBeenCalledWith({ quality: 60 });
      expect(result.sizeKb).toBe(120);
      expect(result.mimetype).toBe('image/webp');
    });

    it('returns mimetype "image/webp" regardless of input MIME', async () => {
      const webp = fakeResult(50);
      sharpChain.toBuffer.mockResolvedValue(webp);

      const result = await service.compress(
        Buffer.alloc(1024),
        'avatar',
        'image/png',
      );
      expect(result.mimetype).toBe('image/webp');
    });
  });

  describe('R4 — pre-compression size gate', () => {
    it('rejects >100MB input with FileTooLargeError BEFORE sharp runs', async () => {
      const tooBig = Buffer.alloc(
        (COMPRESSION_CONFIG.maxInputSizeMb + 1) * 1024 * 1024,
      );

      await expect(
        service.compress(tooBig, 'avatar', 'image/jpeg'),
      ).rejects.toBeInstanceOf(FileTooLargeError);

      expect(sharpMock).not.toHaveBeenCalled();
    });

    it('accepts exactly 100MB input (boundary, inclusive)', async () => {
      const webp = fakeResult(80);
      sharpChain.toBuffer.mockResolvedValue(webp);

      const atLimit = Buffer.alloc(
        COMPRESSION_CONFIG.maxInputSizeMb * 1024 * 1024,
      );
      const result = await service.compress(
        atLimit,
        'avatar',
        'image/jpeg',
      );
      expect(result.sizeKb).toBe(80);
    });
  });

  describe('R5 — MIME allow-list', () => {
    it('rejects BMP with UnsupportedMimeType BEFORE sharp runs', async () => {
      await expect(
        service.compress(Buffer.alloc(1024), 'avatar', 'image/bmp'),
      ).rejects.toBeInstanceOf(UnsupportedMimeType);

      expect(sharpMock).not.toHaveBeenCalled();
    });

    it('rejects GIF with UnsupportedMimeType', async () => {
      await expect(
        service.compress(Buffer.alloc(1024), 'avatar', 'image/gif'),
      ).rejects.toBeInstanceOf(UnsupportedMimeType);
      expect(sharpMock).not.toHaveBeenCalled();
    });

    it('rejects unknown mime types with UnsupportedMimeType', async () => {
      await expect(
        service.compress(
          Buffer.alloc(1024),
          'incident',
          'application/octet-stream',
        ),
      ).rejects.toBeInstanceOf(UnsupportedMimeType);
    });
  });

  describe('R1-R3 — post-compression size cap', () => {
    it('rejects avatar result over 100KB with CompressionSizeExceeded', async () => {
      sharpChain.toBuffer.mockResolvedValue(fakeResult(150));

      await expect(
        service.compress(Buffer.alloc(1024), 'avatar', 'image/jpeg'),
      ).rejects.toBeInstanceOf(CompressionSizeExceeded);
    });

    it('rejects incident result over 300KB with CompressionSizeExceeded', async () => {
      sharpChain.toBuffer.mockResolvedValue(fakeResult(350));

      await expect(
        service.compress(Buffer.alloc(1024), 'incident', 'image/png'),
      ).rejects.toBeInstanceOf(CompressionSizeExceeded);
    });

    it('rejects comment result over 300KB with CompressionSizeExceeded', async () => {
      sharpChain.toBuffer.mockResolvedValue(fakeResult(400));

      await expect(
        service.compress(Buffer.alloc(1024), 'comment', 'image/jpeg'),
      ).rejects.toBeInstanceOf(CompressionSizeExceeded);
    });
  });

  describe('R6 — sharp failure handling', () => {
    it('wraps sharp errors in CompressionFailed (422)', async () => {
      sharpChain.toBuffer.mockRejectedValue(
        new Error('Input image is corrupt or truncated'),
      );

      await expect(
        service.compress(Buffer.alloc(1024), 'avatar', 'image/jpeg'),
      ).rejects.toBeInstanceOf(CompressionFailed);
    });

    it('logs the sharp error stack before throwing CompressionFailed', async () => {
      sharpChain.toBuffer.mockRejectedValue(new Error('boom'));

      await expect(
        service.compress(Buffer.alloc(1024), 'incident', 'image/png'),
      ).rejects.toBeInstanceOf(CompressionFailed);
      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  describe('R7 — logging format', () => {
    it('logs once with format [ImageCompression] {type}: {X}KB → {Y}KB (ratio {Z}:1)', async () => {
      sharpChain.toBuffer.mockResolvedValue(fakeResult(85));

      await service.compress(
        Buffer.alloc(35_000 * 1024),
        'avatar',
        'image/jpeg',
      );

      expect(loggerLogSpy).toHaveBeenCalledTimes(1);
      expect(loggerLogSpy).toHaveBeenCalledWith(
        '[ImageCompression] Avatar: 35000KB → 85KB (ratio 411.8:1)',
      );
    });

    it('does not log when sharp fails (R6 takes over)', async () => {
      sharpChain.toBuffer.mockRejectedValue(new Error('boom'));

      await expect(
        service.compress(Buffer.alloc(1024), 'avatar', 'image/jpeg'),
      ).rejects.toBeInstanceOf(CompressionFailed);
      expect(loggerLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('ratio calculation', () => {
    it('reports original/compressed rounded to 1 decimal', async () => {
      sharpChain.toBuffer.mockResolvedValue(fakeResult(100));

      const result = await service.compress(
        Buffer.alloc(2000 * 1024),
        'avatar',
        'image/jpeg',
      );
      // 2000 / 100 = 20.0
      expect(result.ratio).toBe(20);
    });
  });

  describe('typed exception payloads', () => {
    it('CompressionSizeExceeded carries imageType, sizeKb, limitKb for callers', async () => {
      sharpChain.toBuffer.mockResolvedValue(fakeResult(150));

      try {
        await service.compress(Buffer.alloc(1024), 'avatar', 'image/jpeg');
        fail('expected CompressionSizeExceeded');
      } catch (err) {
        expect(err).toBeInstanceOf(CompressionSizeExceeded);
        const typed = err as CompressionSizeExceeded;
        expect(typed.imageType).toBe('avatar');
        expect(typed.sizeKb).toBe(150);
        expect(typed.limitKb).toBe(100);
      }
    });
  });
});
