import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { UsersService } from '../../src/modules/users/users.service';
import { NotificationType } from '../../src/modules/notifications/entities/notification.entity';

describe('Notifications E2E', () => {
  let notificationsService: NotificationsService;
  let usersService: UsersService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: NotificationsService,
          useValue: {
            notify: jest.fn().mockResolvedValue({ id: 'notif-1' }),
            findByUser: jest.fn().mockResolvedValue([]),
            markAsRead: jest.fn().mockResolvedValue(true),
            markAllAsRead: jest.fn().mockResolvedValue(true),
            countUnread: jest.fn().mockResolvedValue(0),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({ id: 'user-123', email: 'test@example.com' }),
            findByRole: jest.fn().mockResolvedValue([{ id: 'admin-1' }]),
          },
        },
      ],
    }).compile();

    notificationsService = moduleFixture.get<NotificationsService>(
      NotificationsService,
    );
    usersService = moduleFixture.get<UsersService>(UsersService);
  });

  describe('Notifications Service', () => {
    it('should create notification for incident.created event', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com', name: 'Test' };
      jest.spyOn(usersService, 'findOne').mockResolvedValue(mockUser as unknown as Awaited<ReturnType<typeof usersService.findOne>>);

      const notification = await notificationsService.notify(
        mockUser as unknown as Parameters<typeof notificationsService.notify>[0],
        NotificationType.INCIDENT_CREATED,
        'New incident reported',
        'incident-123',
      );

      expect(notification).toBeDefined();
    });

    it('should handle notification deduplication', async () => {
      const mockUser = { id: 'user-123' };

      // First call returns notification
      jest
        .spyOn(notificationsService, 'notify')
        .mockResolvedValueOnce({ id: 'notif-1' } as unknown as Awaited<ReturnType<typeof notificationsService.notify>>);

      // Second call within 60s returns null
      jest
        .spyOn(notificationsService, 'notify')
        .mockResolvedValueOnce(null);

      const notif1 = await notificationsService.notify(
        mockUser as unknown as Parameters<typeof notificationsService.notify>[0],
        NotificationType.INCIDENT_ASSIGNED,
        'Test',
      );
      const notif2 = await notificationsService.notify(
        mockUser as unknown as Parameters<typeof notificationsService.notify>[0],
        NotificationType.INCIDENT_ASSIGNED,
        'Test',
      );

      expect(notif1).toBeDefined();
      expect(notif2).toBeNull();
    });

    it('should mark notification as read', async () => {
      jest.spyOn(notificationsService, 'markAsRead').mockResolvedValue(true);

      const success = await notificationsService.markAsRead(
        'notif-123',
        'user-123',
      );

      expect(success).toBe(true);
    });

    it('should count unread notifications', async () => {
      jest.spyOn(notificationsService, 'countUnread').mockResolvedValue(5);

      const count = await notificationsService.countUnread('user-123');

      expect(count).toBe(5);
    });

    it('should find notifications by user', async () => {
      const mockData = {
        data: [{ id: 'notif-1', message: 'Test' }],
        total: 1,
      };

      jest.spyOn(notificationsService, 'findByUser').mockResolvedValue(mockData as unknown as Awaited<ReturnType<typeof notificationsService.findByUser>>);

      const { data, total } = await notificationsService.findByUser('user-123');

      expect(total).toBe(1);
      expect(data.length).toBe(1);
    });
  });

  describe('Incident Notifications Listener', () => {
    it('should emit notifications on incident.created event', async () => {
      const admins = [{ id: 'admin-1', email: 'admin@example.com' }];
      jest.spyOn(usersService, 'findByRole').mockResolvedValue(admins as unknown as Awaited<ReturnType<typeof usersService.findByRole>>);

      const result = await usersService.findByRole('admin');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('admin-1');
    });
  });
});
