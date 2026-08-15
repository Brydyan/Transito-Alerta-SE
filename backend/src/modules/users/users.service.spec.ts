import { NotFoundException } from '@nestjs/common';
import { UsersService, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './users.service';

describe('UsersService', () => {
  let userRepo: { findOne: jest.Mock; update: jest.Mock; findAndCount: jest.Mock };
  let sessionRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let avatarStorage: { upload: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    userRepo = { findOne: jest.fn(), update: jest.fn(), findAndCount: jest.fn() };
    sessionRepo = { findOne: jest.fn(), save: jest.fn(), create: jest.fn((x) => x) };
    avatarStorage = { upload: jest.fn() };
    service = new UsersService(userRepo as any, sessionRepo as any, avatarStorage as any);
  });

  describe('findById', () => {
    it('returns the user when found', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1' });
      const result = await service.findById('u1');
      expect(result).toEqual({ id: 'u1' });
    });

    it('throws NotFoundException when missing', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.findById('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('updates first_name/last_name and returns the fresh row', async () => {
      userRepo.update.mockResolvedValue({ affected: 1 });
      userRepo.findOne.mockResolvedValue({ id: 'u1', firstName: 'Ana', lastName: 'Lopez' });

      const result = await service.updateProfile('u1', { firstName: 'Ana', lastName: 'Lopez' });

      expect(userRepo.update).toHaveBeenCalledWith('u1', { firstName: 'Ana', lastName: 'Lopez' });
      expect(result.firstName).toBe('Ana');
    });
  });

  describe('updateAvatar', () => {
    it('uploads via AvatarStorageService and persists the signed URL, without any live S3 call', async () => {
      avatarStorage.upload.mockResolvedValue('https://storage.example.com/avatars/u1/x.png?sig=abc');
      userRepo.update.mockResolvedValue({ affected: 1 });
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        avatarUrl: 'https://storage.example.com/avatars/u1/x.png?sig=abc',
      });

      const file = { buffer: Buffer.from('x'), mimetype: 'image/png', originalname: 'x.png' };
      const result = await service.updateAvatar('u1', file);

      expect(avatarStorage.upload).toHaveBeenCalledWith('u1', file);
      expect(userRepo.update).toHaveBeenCalledWith('u1', {
        avatarUrl: 'https://storage.example.com/avatars/u1/x.png?sig=abc',
      });
      expect(result.avatarUrl).toContain('storage.example.com');
    });
  });

  describe('list', () => {
    it('applies the default page size when none is given', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list();

      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: DEFAULT_PAGE_SIZE, skip: 0 }),
      );
    });

    it('caps an oversized limit at MAX_PAGE_SIZE', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list(1, 10_000);

      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: MAX_PAGE_SIZE }),
      );
    });

    it('computes skip from the page number', async () => {
      userRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.list(3, 20);

      expect(userRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20, skip: 40 }),
      );
    });
  });

  describe('recordSession', () => {
    it('creates a session row for a new device', async () => {
      sessionRepo.findOne.mockResolvedValue(null);

      await service.recordSession('u1', 'device-abc');

      expect(sessionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', deviceUuid: 'device-abc' }),
      );
    });

    it('does not duplicate a session row for an already-tracked device', async () => {
      sessionRepo.findOne.mockResolvedValue({ id: 's1' });

      await service.recordSession('u1', 'device-abc');

      expect(sessionRepo.save).not.toHaveBeenCalled();
    });
  });
});
