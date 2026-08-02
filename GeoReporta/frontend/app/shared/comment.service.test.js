/**
 * commentService unit tests (Phase 3 — 33bd3210).
 *
 * Mirrors notification.service.test.js conventions: http.service.js is
 * partially mocked (get/post) via vi.mock + importOriginal, and each test
 * asserts the endpoint/method/payload contract plus the returned shape.
 */
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
import { commentService } from './comment.service.js';

describe('commentService', () => {
  beforeEach(() => {
    clearAuthState();
    setAccessToken('test-token');
    vi.clearAllMocks();
  });

  it('list fetches comments for the given incident and returns data shape', async () => {
    http.get.mockResolvedValue({
      data: [
        {
          id: 1,
          message: 'Hola',
          user: { first_name: 'Ana', last_name: 'Lopez' },
          created_at: '2026-07-08T10:00:00Z',
        },
      ],
      meta: { total: 1 },
    });

    const result = await commentService.list(42, { page: 1, perPage: 10 });

    expect(http.get).toHaveBeenCalledWith(
      expect.stringContaining('/incidents/42/comments?'),
    );
    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ total: 1 });
  });

  it('list sends page and per_page query params', async () => {
    http.get.mockResolvedValue({ data: [] });

    await commentService.list(7, { page: 2, perPage: 5 });

    const calledUrl = http.get.mock.calls[0][0];
    expect(calledUrl).toContain('/incidents/7/comments?');
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('per_page=5');
  });

  it('list defaults to page 1 / perPage 20 when omitted', async () => {
    http.get.mockResolvedValue({ data: [] });

    await commentService.list(3);

    const calledUrl = http.get.mock.calls[0][0];
    expect(calledUrl).toContain('page=1');
    expect(calledUrl).toContain('per_page=20');
  });

  it('list falls back to an empty array + null meta when the backend omits them', async () => {
    http.get.mockResolvedValue({});

    const result = await commentService.list(1);

    expect(result.data).toEqual([]);
    expect(result.meta).toBeNull();
  });

  it('create posts the message to /incidents/{id}/comments and returns the created comment', async () => {
    http.post.mockResolvedValue({
      data: {
        id: 99,
        message: 'Nuevo comentario',
        created_at: '2026-07-08T11:00:00Z',
      },
    });

    const result = await commentService.create(42, {
      message: 'Nuevo comentario',
    });

    expect(http.post).toHaveBeenCalledWith('/incidents/42/comments', {
      message: 'Nuevo comentario',
    });
    expect(result.id).toBe(99);
    expect(result.message).toBe('Nuevo comentario');
  });

  it('create falls back to the raw response when it has no .data envelope', async () => {
    http.post.mockResolvedValue({ id: 5, message: 'x' });

    const result = await commentService.create(1, { message: 'x' });

    expect(result).toEqual({ id: 5, message: 'x' });
  });
});
