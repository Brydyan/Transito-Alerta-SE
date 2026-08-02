/**
 * assignmentService unit tests (Phase 3 — historial-asignacion-operadores).
 *
 * Mirrors comment.service.test.js conventions: http.service.js is
 * partially mocked (get/post/delete) via vi.mock + importOriginal, and
 * each test asserts the endpoint/method/payload contract plus the
 * returned shape.
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
import { assignmentService } from './assignment.service.js';

describe('assignmentService', () => {
  beforeEach(() => {
    clearAuthState();
    setAccessToken('test-token');
    vi.clearAllMocks();
  });

  it('list fetches assignments for the given incident with default pagination and returns { data, meta }', async () => {
    http.get.mockResolvedValue({
      data: [
        {
          id: 1,
          incident_id: 42,
          user_id: 7,
          role: 'responsable',
          user: { first_name: 'Ana', last_name: 'Lopez' },
        },
      ],
      meta: { current_page: 1, last_page: 1, total: 1 },
    });

    const result = await assignmentService.list(42);

    expect(http.get).toHaveBeenCalledWith(
      '/incidents/42/assignments?page=1&per_page=20',
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0].role).toBe('responsable');
    expect(result.meta).toEqual({ current_page: 1, last_page: 1, total: 1 });
  });

  it('list forwards page/perPage overrides to the query string', async () => {
    http.get.mockResolvedValue({ data: [], meta: { current_page: 2 } });

    await assignmentService.list(42, { page: 2, perPage: 50 });

    expect(http.get).toHaveBeenCalledWith(
      '/incidents/42/assignments?page=2&per_page=50',
    );
  });

  it('list falls back to an empty data array and null meta when the backend omits both', async () => {
    http.get.mockResolvedValue({});

    const result = await assignmentService.list(1);

    expect(result).toEqual({ data: [], meta: null });
  });

  it('create posts user_id and role to /incidents/{id}/assignments and returns the created row', async () => {
    http.post.mockResolvedValue({
      data: { id: 5, incident_id: 42, user_id: 7, role: 'apoyo' },
    });

    const result = await assignmentService.create(42, 7, 'apoyo');

    expect(http.post).toHaveBeenCalledWith('/incidents/42/assignments', {
      user_id: 7,
      role: 'apoyo',
    });
    expect(result.id).toBe(5);
    expect(result.role).toBe('apoyo');
  });

  it('create falls back to the raw response when it has no .data envelope', async () => {
    http.post.mockResolvedValue({ id: 9, role: 'responsable' });

    const result = await assignmentService.create(1, 3, 'responsable');

    expect(result).toEqual({ id: 9, role: 'responsable' });
  });

  it('remove calls DELETE on /incidents/{id}/assignments/{assignmentId}', async () => {
    http.delete.mockResolvedValue(null);

    await assignmentService.remove(42, 5);

    expect(http.delete).toHaveBeenCalledWith('/incidents/42/assignments/5');
  });
});
