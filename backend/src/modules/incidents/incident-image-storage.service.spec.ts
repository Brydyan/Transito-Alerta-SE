import { ImageCompressionService } from '../../core/image/image-compression.service';
import {
  CompressionSizeExceeded,
  FileTooLargeError,
} from '../../core/image/compression-error.exception';
import { IStorageClient } from '../../core/storage/storage-client.interface';
import {
  IncidentImageStorageService,
  MulterFile,
} from './incident-image-storage.service';

function makeFile(name = 'photo.jpg', mime = 'image/jpeg'): MulterFile {
  return {
    originalname: name,
    mimetype: mime,
    buffer: Buffer.from('fake'),
    size: 4,
    fieldname: 'images',
    encoding: '7bit',
  };
}

function makeCompressionMock(): jest.Mocked<ImageCompressionService> {
  return {
    compress: jest.fn(),
  } as unknown as jest.Mocked<ImageCompressionService>;
}

function makeClientMock(): jest.Mocked<IStorageClient> {
  return {
    upload: jest.fn(),
    getSignedUrl: jest.fn(),
    delete: jest.fn(),
  };
}

describe('IncidentImageStorageService', () => {
  let compression: jest.Mocked<ImageCompressionService>;
  let client: jest.Mocked<IStorageClient>;
  let service: IncidentImageStorageService;

  beforeEach(() => {
    compression = makeCompressionMock();
    client = makeClientMock();
    service = new IncidentImageStorageService(compression, client);
  });

  describe('upload (F7 image-compression-webp, T4.1/T4.2)', () => {
    it('compresses with type=incident before persisting', async () => {
      const compressed = Buffer.from('webp');
      compression.compress.mockResolvedValue({
        buffer: compressed,
        sizeKb: 250,
        originalSizeKb: 20000,
        ratio: 80,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({
        key: 'ignored',
        url: 'https://real.example/incidents/inc-123/uuid.webp',
      });

      const callOrder: string[] = [];
      compression.compress.mockImplementation(async () => {
        callOrder.push('compress');
        return {
          buffer: compressed,
          sizeKb: 250,
          originalSizeKb: 20000,
          ratio: 80,
          mimetype: 'image/webp',
        };
      });
      client.upload.mockImplementation(async () => {
        callOrder.push('upload');
        return { key: 'ignored', url: 'https://real.example/x' };
      });

      await service.upload('inc-123', makeFile());

      expect(callOrder).toEqual(['compress', 'upload']);
      expect(compression.compress).toHaveBeenCalledWith(
        expect.any(Buffer),
        'incident',
        'image/jpeg',
      );
    });

    it('key passed to client.upload is incidents/{incidentId}/{uuid}.webp (original extension dropped)', async () => {
      compression.compress.mockResolvedValue({
        buffer: Buffer.from('x'),
        sizeKb: 1,
        originalSizeKb: 1,
        ratio: 1,
        mimetype: 'image/webp',
      });
      // Echo the key the service computed — same shape, real-world Supabase
      // returns a server-assigned key which can differ, but the contract
      // we care about is what WE pass to the client.
      client.upload.mockImplementation(async (key) => ({
        key,
        url: `https://real.example/${key}`,
      }));

      await service.upload('inc-123', makeFile('my photo (1).jpg'));

      const [key] = client.upload.mock.calls[0];
      expect(key).toMatch(/^incidents\/inc-123\/.+\.webp$/);
      expect(key).not.toContain(' ');
      expect(key).not.toContain('(');
      expect(key).not.toContain(')');
      expect(key).not.toContain('.jpg');
    });

    it('passes the compressed buffer + image/webp mimetype to client.upload', async () => {
      const compressed = Buffer.from('webp-bytes');
      compression.compress.mockResolvedValue({
        buffer: compressed,
        sizeKb: 250,
        originalSizeKb: 20000,
        ratio: 80,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({
        key: 'ignored',
        url: 'https://real.example/x',
      });

      await service.upload('inc-123', makeFile());

      const [key, buffer, mimetype] = client.upload.mock.calls[0];
      expect(buffer).toBe(compressed);
      expect(mimetype).toBe('image/webp');
      expect(key).toMatch(/^incidents\/inc-123\/.+\.webp$/);
    });

    it('returns the url resolved by the injected IStorageClient verbatim', async () => {
      compression.compress.mockResolvedValue({
        buffer: Buffer.from('x'),
        sizeKb: 1,
        originalSizeKb: 1,
        ratio: 1,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({
        key: 'incidents/inc-abc/uuid.webp',
        url: 'https://real.example/incidents/inc-abc/uuid.webp',
      });

      const result = await service.upload('inc-abc', makeFile());

      expect(result).toEqual({
        key: 'incidents/inc-abc/uuid.webp',
        url: 'https://real.example/incidents/inc-abc/uuid.webp',
      });
    });

    it('propagates CompressionSizeExceeded from the compression service (300KB cap)', async () => {
      const err = new CompressionSizeExceeded('incident', 350, 300);
      compression.compress.mockRejectedValue(err);

      await expect(service.upload('inc-1', makeFile())).rejects.toBe(err);
      expect(client.upload).not.toHaveBeenCalled();
    });

    it('propagates FileTooLargeError before any upload attempt', async () => {
      const err = new FileTooLargeError(150 * 1024);
      compression.compress.mockRejectedValue(err);

      await expect(service.upload('inc-1', makeFile())).rejects.toBe(err);
      expect(client.upload).not.toHaveBeenCalled();
    });

    it('a different incidentId produces a differently scoped key passed to client.upload', async () => {
      compression.compress.mockResolvedValue({
        buffer: Buffer.from('x'),
        sizeKb: 1,
        originalSizeKb: 1,
        ratio: 1,
        mimetype: 'image/webp',
      });
      client.upload.mockImplementation(async (key) => ({
        key,
        url: `https://real.example/${key}`,
      }));

      await service.upload('inc-xyz', makeFile());

      const [key] = client.upload.mock.calls[0];
      expect(key).toMatch(/^incidents\/inc-xyz\//);
    });
  });

  describe('getSignedUrl()', () => {
    it('delegates to the injected IStorageClient and returns its resolved url', async () => {
      client.getSignedUrl.mockResolvedValue('https://real.example/signed');

      const url = await service.getSignedUrl('incidents/inc-1/uuid.webp');

      expect(client.getSignedUrl).toHaveBeenCalledWith('incidents/inc-1/uuid.webp');
      expect(url).toBe('https://real.example/signed');
    });
  });

  describe('delete()', () => {
    it('delegates to the injected IStorageClient', async () => {
      client.delete.mockResolvedValue(undefined);

      await service.delete('incidents/inc-1/uuid.webp');

      expect(client.delete).toHaveBeenCalledWith('incidents/inc-1/uuid.webp');
    });
  });
});
