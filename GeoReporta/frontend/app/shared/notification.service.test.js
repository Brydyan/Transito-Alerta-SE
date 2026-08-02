import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setAccessToken, clearAuthState } from '../core/http.service.js';

vi.mock('../core/http.service.js', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    setAccessToken: mod.setAccessToken,
    clearAuthState: mod.clearAuthState,
    http: {
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn().mockResolvedValue({ data: {} }),
      put: vi.fn().mockResolvedValue({ data: {} }),
      patch: vi.fn().mockResolvedValue({ data: {} }),
      delete: vi.fn().mockResolvedValue(null),
    },
  };
});

import { http } from '../core/http.service.js';
import { notificationService } from './notification.service.js';

describe('notificationService', () => {
  beforeEach(() => {
    clearAuthState();
    setAccessToken('test-token');
    vi.clearAllMocks();
  });

  it('list fetches notifications and returns data shape', async () => {
    http.get.mockResolvedValue({
      data: [
        {
          id: 1,
          type: 'claim',
          message: 'x',
          read: false,
          data: {},
          created_at: '2026-07-06',
        },
      ],
      meta: { total: 1 },
      unread_count: 1,
    });

    const result = await notificationService.list({ page: 1, perPage: 10 });

    expect(http.get).toHaveBeenCalledWith(
      expect.stringContaining('/notifications?'),
    );
    expect(result.data).toHaveLength(1);
    expect(result.unreadCount).toBe(1);
  });

  it('list sends unread_only when requested', async () => {
    http.get.mockResolvedValue({ data: [], unread_count: 0 });

    await notificationService.list({ unreadOnly: true });

    expect(http.get).toHaveBeenCalledWith(
      expect.stringContaining('unread_only=1'),
    );
  });

  it('unreadCount siempre pide fresco al backend', async () => {
    http.get.mockResolvedValue({ unread_count: 5 });

    const first = await notificationService.unreadCount();
    const second = await notificationService.unreadCount();
    const third = await notificationService.unreadCount();

    expect(first).toBe(5);
    expect(second).toBe(5);
    expect(third).toBe(5);
    // Sin caché — cada llamada es un fetch.
    expect(http.get).toHaveBeenCalledTimes(3);
  });

  it('markRead y unreadCount son independientes', async () => {
    http.get.mockResolvedValue({ unread_count: 2 });
    http.patch.mockResolvedValue({});

    await notificationService.unreadCount();
    await notificationService.markRead(99);
    await notificationService.unreadCount();

    // markRead es PATCH, no GET; los dos unreadCount son GETs independientes.
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it('markAllRead no afecta el fetch del badge', async () => {
    http.get.mockResolvedValue({ unread_count: 7 });
    http.patch.mockResolvedValue({ updated: 7 });

    await notificationService.unreadCount();
    const after = await notificationService.markAllRead();

    expect(after.updated).toBe(7);

    // Sin caché — el segundo unreadCount fetchea de nuevo.
    const cached = await notificationService.unreadCount();
    expect(cached).toBe(7);
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  // ─── approve ─────────────────────────────────────────────────────────────────

  it('approve calls POST and returns payload', async () => {
    const payload = { id: 123, status: 'approved' };
    http.post.mockResolvedValue({ data: payload });

    const result = await notificationService.approve(123);

    expect(http.post).toHaveBeenCalledWith('/notifications/123/approve');
    expect(result).toEqual(payload);
  });

  it('approve propagates 4xx', async () => {
    const err = new Error('Forbidden');
    err.status = 403;
    http.post.mockRejectedValue(err);

    await expect(notificationService.approve(123)).rejects.toThrow('Forbidden');
  });

  it('approve propagates 5xx', async () => {
    const err = new Error('Internal Server Error');
    err.status = 500;
    http.post.mockRejectedValue(err);

    await expect(notificationService.approve(123)).rejects.toThrow(
      'Internal Server Error',
    );
  });

  // ─── reject ──────────────────────────────────────────────────────────────────

  it('reject sends reason in body', async () => {
    const payload = {
      id: 123,
      status: 'rejected',
      reason: 'motivo válido 123',
    };
    http.post.mockResolvedValue({ data: payload });

    const result = await notificationService.reject(123, 'motivo válido 123');

    expect(http.post).toHaveBeenCalledWith('/notifications/123/reject', {
      reason: 'motivo válido 123',
    });
    expect(result).toEqual(payload);
  });

  it('reject throws when reason too short', async () => {
    await expect(notificationService.reject(123, 'corto')).rejects.toThrow(
      'Reason must be a string between 10 and 500 characters.',
    );
  });

  it('reject throws when reason too long', async () => {
    await expect(
      notificationService.reject(123, 'x'.repeat(501)),
    ).rejects.toThrow('Reason must be a string between 10 and 500 characters.');
  });

  it('reject throws when reason not string', async () => {
    await expect(notificationService.reject(123, null)).rejects.toThrow(
      'Reason must be a string between 10 and 500 characters.',
    );
  });

  it('reject propagates 4xx', async () => {
    const err = new Error('Forbidden');
    err.status = 403;
    http.post.mockRejectedValue(err);

    await expect(
      notificationService.reject(123, 'motivo válido 123'),
    ).rejects.toThrow('Forbidden');
  });

  it('reject propagates 5xx', async () => {
    const err = new Error('Internal Server Error');
    err.status = 500;
    http.post.mockRejectedValue(err);

    await expect(
      notificationService.reject(123, 'motivo válido 123'),
    ).rejects.toThrow('Internal Server Error');
  });

  // ─── getPendingApprovals ─────────────────────────────────────────────────────

  it('getPendingApprovals constructs URL with all params', async () => {
    http.get.mockResolvedValue({ data: [] });

    await notificationService.getPendingApprovals({ page: 2, perPage: 10 });

    expect(http.get).toHaveBeenCalledWith(expect.stringContaining('page=2'));
    expect(http.get).toHaveBeenCalledWith(
      expect.stringContaining('per_page=10'),
    );
    expect(http.get).toHaveBeenCalledWith(
      expect.stringContaining('type=incident_pending_approval'),
    );
    expect(http.get).toHaveBeenCalledWith(
      expect.stringContaining('unread_only=1'),
    );
  });

  it('getPendingApprovals with organizationId sets the param', async () => {
    http.get.mockResolvedValue({ data: [] });

    await notificationService.getPendingApprovals({ organizationId: 5 });

    expect(http.get).toHaveBeenCalledWith(
      expect.stringContaining('organization_id=5'),
    );
  });

  it('getPendingApprovals with unreadOnly=false omits the param', async () => {
    http.get.mockResolvedValue({ data: [] });

    await notificationService.getPendingApprovals({ unreadOnly: false });

    const callUrl = http.get.mock.calls[0][0];
    expect(callUrl).not.toContain('unread_only');
  });
});
