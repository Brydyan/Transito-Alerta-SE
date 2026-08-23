import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CommentImagesService } from './comment-images.service';
import { CommentImageStorageService, MulterFile } from './comment-image-storage.service';

type MockCommentRepo = { findOne: jest.Mock };
type MockImageRepo = { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; delete: jest.Mock };
type MockStorage = { upload: jest.Mock; delete: jest.Mock };

function makeFile(mimetype = 'image/jpeg', size = 1024): MulterFile {
  return {
    originalname: 'test.jpg',
    mimetype,
    size,
    buffer: Buffer.alloc(0),
    fieldname: 'images',
    encoding: '7bit',
  };
}

const OWNER_ID = 'user-owner';
const OTHER_ID = 'user-other';
const COMMENT_ID = 'comment-1';
const IMAGE_ID = 'image-1';
const OWNER_PERMISSIONS: string[] = [];
const STAFF_PERMISSIONS = ['CREATE comment-images'];
const DELETE_PERMISSIONS = ['DELETE comment-images'];

describe('CommentImagesService', () => {
  let commentRepo: MockCommentRepo;
  let imageRepo: MockImageRepo;
  let storage: MockStorage;
  let service: CommentImagesService;

  const mockComment = { id: COMMENT_ID, userId: OWNER_ID };
  const mockImage = { id: IMAGE_ID, commentId: COMMENT_ID, storageKey: 'comments/comment-1/file.jpg' };
  const savedEntity = { id: IMAGE_ID, url: 'https://storage.example.com/key?sig=abc', mimeType: 'image/jpeg', fileSize: 1024, createdAt: new Date() };

  beforeEach(() => {
    commentRepo = { findOne: jest.fn() };
    imageRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn(), delete: jest.fn() };
    storage = {
      upload: jest.fn().mockResolvedValue({ key: 'comments/comment-1/uuid-test.jpg', url: 'https://storage.example.com/key?sig=abc' }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    service = new CommentImagesService(
      commentRepo as never,
      imageRepo as never,
      storage as unknown as CommentImageStorageService,
    );
    imageRepo.create.mockImplementation((data: Record<string, unknown>) => ({ ...data }));
    imageRepo.save.mockResolvedValue(savedEntity);
  });

  // ---- attachToComment -------------------------------------------------------

  it('happy path: returns array of 2 DTOs after uploading 2 files', async () => {
    commentRepo.findOne.mockResolvedValue(mockComment);
    imageRepo.save
      .mockResolvedValueOnce({ ...savedEntity, id: 'img-1' })
      .mockResolvedValueOnce({ ...savedEntity, id: 'img-2' });

    const result = await service.attachToComment(COMMENT_ID, OWNER_ID, OWNER_PERMISSIONS, [makeFile(), makeFile()]);

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('id', 'img-1');
    expect(result[1]).toHaveProperty('id', 'img-2');
    expect(storage.upload).toHaveBeenCalledTimes(2);
  });

  it('non-owner without CREATE comment-images permission: throws ForbiddenException', async () => {
    commentRepo.findOne.mockResolvedValue(mockComment);
    await expect(
      service.attachToComment(COMMENT_ID, OTHER_ID, [], [makeFile()]),
    ).rejects.toThrow(ForbiddenException);
  });

  it('non-owner WITH CREATE comment-images permission: succeeds', async () => {
    commentRepo.findOne.mockResolvedValue(mockComment);
    const result = await service.attachToComment(COMMENT_ID, OTHER_ID, STAFF_PERMISSIONS, [makeFile()]);
    expect(result).toHaveLength(1);
  });

  it('invalid MIME type: throws UnprocessableEntityException', async () => {
    commentRepo.findOne.mockResolvedValue(mockComment);
    await expect(
      service.attachToComment(COMMENT_ID, OWNER_ID, OWNER_PERMISSIONS, [makeFile('application/pdf')]),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('comment not found: throws NotFoundException', async () => {
    commentRepo.findOne.mockResolvedValue(null);
    await expect(
      service.attachToComment(COMMENT_ID, OWNER_ID, OWNER_PERMISSIONS, [makeFile()]),
    ).rejects.toThrow(NotFoundException);
  });

  // ---- removeFromComment -----------------------------------------------------

  it('happy path: calls storage.delete + imageRepo.delete', async () => {
    imageRepo.findOne.mockResolvedValue(mockImage);
    commentRepo.findOne.mockResolvedValue(mockComment);

    await service.removeFromComment(COMMENT_ID, IMAGE_ID, OWNER_ID, OWNER_PERMISSIONS);

    expect(storage.delete).toHaveBeenCalledWith(mockImage.storageKey);
    expect(imageRepo.delete).toHaveBeenCalledWith({ id: IMAGE_ID });
  });

  it('S3 delete failure: still calls imageRepo.delete, logs warning (no throw)', async () => {
    imageRepo.findOne.mockResolvedValue(mockImage);
    commentRepo.findOne.mockResolvedValue(mockComment);
    storage.delete.mockRejectedValue(new Error('S3 unavailable'));

    await expect(
      service.removeFromComment(COMMENT_ID, IMAGE_ID, OWNER_ID, OWNER_PERMISSIONS),
    ).resolves.toBeUndefined();

    expect(imageRepo.delete).toHaveBeenCalledWith({ id: IMAGE_ID });
  });

  it('image belongs to different comment: throws NotFoundException', async () => {
    imageRepo.findOne.mockResolvedValue({ ...mockImage, commentId: 'other-comment' });
    await expect(
      service.removeFromComment(COMMENT_ID, IMAGE_ID, OWNER_ID, OWNER_PERMISSIONS),
    ).rejects.toThrow(NotFoundException);
  });

  it('non-owner without DELETE permission: throws ForbiddenException', async () => {
    imageRepo.findOne.mockResolvedValue(mockImage);
    commentRepo.findOne.mockResolvedValue(mockComment);
    await expect(
      service.removeFromComment(COMMENT_ID, IMAGE_ID, OTHER_ID, []),
    ).rejects.toThrow(ForbiddenException);
  });

  it('non-owner WITH DELETE comment-images permission: succeeds', async () => {
    imageRepo.findOne.mockResolvedValue(mockImage);
    commentRepo.findOne.mockResolvedValue(mockComment);
    await expect(
      service.removeFromComment(COMMENT_ID, IMAGE_ID, OTHER_ID, DELETE_PERMISSIONS),
    ).resolves.toBeUndefined();
    expect(imageRepo.delete).toHaveBeenCalledWith({ id: IMAGE_ID });
  });
});
