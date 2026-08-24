import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { IncidentApprovalService } from './incident-approval.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

const mockNotificationsService = {
  findByUser: jest.fn(),
  countUnread: jest.fn(),
  markAsRead: jest.fn(),
  markAllAsRead: jest.fn(),
};

const mockApprovalService = {
  approve: jest.fn(),
  reject: jest.fn(),
};

const mockUser = {
  userId: 'user-1',
  permissions: ['READ notifications'],
  organizationId: null,
  roleName: null,
  scope: { kind: 'global' },
  sessionId: null,
  isAnonymous: false,
};

describe('NotificationsController', () => {
  let controller: NotificationsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: IncidentApprovalService, useValue: mockApprovalService },
      ],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get<NotificationsController>(NotificationsController);
  });

  describe('GET /notifications/unread', () => {
    it('returns { unread_count: N } (T6.1.A — key changed from unread to unread_count)', async () => {
      mockNotificationsService.countUnread.mockResolvedValue(5);
      const req = { user: mockUser } as any;
      const result = await controller.countUnread(req);
      expect(result).toEqual({ unread_count: 5 });
    });
  });

  describe('GET /notifications/unread-count', () => {
    it('same method as /unread — returns { unread_count: N }', async () => {
      mockNotificationsService.countUnread.mockResolvedValue(2);
      const req = { user: mockUser } as any;
      const result = await controller.countUnread(req);
      expect(result).toEqual({ unread_count: 2 });
    });
  });

  describe('GET /notifications/stream (T6.7 SSE tombstone)', () => {
    it('responds 410 with deprecation message', () => {
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;
      controller.sseDeprecated(res);
      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Socket.IO') }),
      );
    });
  });
});
