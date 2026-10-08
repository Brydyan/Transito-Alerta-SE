import { ImageCompressionService } from '../../core/image/image-compression.service';
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

function makeClientMock(): jest.Mocked<IStorageClient> {
  return {
    upload: jest.fn(),
    getSignedUrl: jest.fn(),
    delete: jest.fn(),
  };
}

function makeCompressionMock(): jest.Mocked<ImageCompressionService> {
  return {
    compress: jest.fn(),
  } as unknown as jest.Mocked<ImageCompressionService>;
}

describe('IncidentImageStorageService', () => {
  let client: jest.Mocked<IStorageClient>;
  let imageCompression: jest.Mocked<ImageCompressionService>;
  let service: IncidentImageStorageService;

  beforeEach(() => {
    client = makeClientMock();
    imageCompression = makeCompressionMock();
    service = new IncidentImageStorageService(client, imageCompression);
  });

  describe('upload', () => {
    it('generates a key with format incidents/{incidentId}/{uuid}.webp (F7)', async () => {
      imageCompression.compress.mockResolvedValue({
        buffer: Buffer.from('webp-bytes'),
        sizeKb: 5,
        originalSizeKb: 1024,
        ratio: 204.8,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({
        key: 'incidents/inc-123/abc.webp',
        url: 'https://real.example/incidents/inc-123/abc.webp',
      });

      const result = await service.upload('inc-123', makeFile('photo.jpg'));

      expect(result.key).toMatch(/^incidents\/inc-123\/.+\.webp$/);
      expect(result.url).toBe(
        'https://real.example/incidents/inc-123/abc.webp',
      );
    });

    it('calls imageCompression.compress with the incident type', async () => {
      imageCompression.compress.mockResolvedValue({
        buffer: Buffer.from('webp-bytes'),
        sizeKb: 5,
        originalSizeKb: 1024,
        ratio: 204.8,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({
        key: 'incidents/inc-1/abc.webp',
        url: 'https://real.example/incidents/inc-1/abc.webp',
      });

      await service.upload('inc-1', makeFile('photo.jpg'));

      expect(imageCompression.compress).toHaveBeenCalledWith(
        expect.any(Buffer),
        'incident',
        'image/jpeg',
      );
    });

    it('passes the WebP buffer and image/webp MIME to client.upload (R8)', async () => {
      const webpBytes = Buffer.from('webp-bytes');
      imageCompression.compress.mockResolvedValue({
        buffer: webpBytes,
        sizeKb: 5,
        originalSizeKb: 1024,
        ratio: 204.8,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({
        key: 'incidents/inc-1/abc.webp',
        url: 'https://real.example/incidents/inc-1/abc.webp',
      });

      await service.upload('inc-1', makeFile('photo.jpg'));

      const [, buffer, mimetype] = client.upload.mock.calls[0];
      expect(buffer).toBe(webpBytes);
      expect(mimetype).toBe('image/webp');
    });

    it('a different incidentId produces a differently scoped key', async () => {
      imageCompression.compress.mockResolvedValue({
        buffer: Buffer.from('webp-bytes'),
        sizeKb: 5,
        originalSizeKb: 1024,
        ratio: 204.8,
        mimetype: 'image/webp',
      });
      client.upload.mockResolvedValue({
        key: 'incidents/inc-xyz/abc.webp',
        url: 'https://real.example/incidents/inc-xyz/abc.webp',
      });

      const result = await service.upload('inc-xyz', makeFile());

      expect(result.key).toMatch(/^incidents\/inc-xyz\//);
    });

    it('generates unique keys for the same incidentId and filename', async () => {
      imageCompression.compress.mockResolvedValue({
        buffer: Buffer.from('webp-bytes'),
        sizeKb: 5,
        originalSizeKb: 1024,
        ratio: 204.8,
        mimetype: 'image/webp',
      });
      client.upload.mockImplementation(async (key) => ({
        key,
        url: `https://real.example/${key}`,
      }));

      const result1 = await service.upload('inc-123', makeFile('photo.jpg'));
      const result2 = await service.upload('inc-123', makeFile('photo.jpg'));

      expect(result1.key).not.toEqual(result2.key);
    });

    it('propagates compress() errors so the upload never reaches the storage client', async () => {
      const { CompressionSizeExceeded } = await import(
        '../../core/image/compression-error.exception'
      );
      const err = new CompressionSizeExceeded('incident', 400, 300);
      imageCompression.compress.mockRejectedValue(err);

      await expect(
        service.upload('inc-1', makeFile('huge.png', 'image/png')),
      ).rejects.toBeInstanceOf(CompressionSizeExceeded);

      expect(client.upload).not.toHaveBeenCalled();
    });
  });

  describe('getSignedUrl', () => {
    it('delegates to the injected IStorageClient (D2 — no more SHA-256 stub)', async () => {
      client.getSignedUrl.mockResolvedValue(
        'https://real.example/signed-incident',
      );

      const url = await service.getSignedUrl('incidents/inc-1/abc.webp');

      expect(client.getSignedUrl).toHaveBeenCalledWith(
        'incidents/inc-1/abc.webp',
      );
      expect(url).toBe('https://real.example/signed-incident');
    });
  });

  describe('delete', () => {
    it('delegates to the injected IStorageClient (D2 — no more no-op stub)', async () => {
      client.delete.mockResolvedValue(undefined);

      await service.delete('incidents/inc-1/abc.webp');

      expect(client.delete).toHaveBeenCalledWith('incidents/inc-1/abc.webp');
    });
  });
});
