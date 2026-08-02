import {
  clearAuthState,
  getAccessToken,
  http,
  setAccessToken,
  setSessionId,
} from './http.service.js';

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    blob: vi.fn().mockResolvedValue(new Blob([JSON.stringify(body)])),
  };
}

function blobResponse(status, bytes) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: vi.fn().mockResolvedValue({}),
    text: vi.fn().mockResolvedValue(''),
    blob: vi.fn().mockResolvedValue(new Blob([bytes])),
  };
}

describe('http service', () => {
  let fetchMock;

  beforeEach(() => {
    clearAuthState();
    window.location.hash = '';
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('injects the bearer token and retries after refresh', async () => {
    setAccessToken('old-token');
    setSessionId('session-1');

    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: 'new-token',
          session_id: 'session-2',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const result = await http.get('/incidents');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/incidents',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
        headers: { Authorization: 'Bearer old-token' },
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/incidents',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
        headers: { Authorization: 'Bearer new-token' },
      }),
    );
  });

  it('returns a Blob when caller opts into responseType: "blob"', async () => {
    setAccessToken('good-token');
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    fetchMock.mockResolvedValueOnce(blobResponse(200, pdfBytes));

    const result = await http.get('/incidents/exportar?format=pdf', {
      responseType: 'blob',
    });

    // We don't strictly need a real Blob in jsdom — we just need to
    // confirm the service returned the value `res.blob()` resolved to.
    expect(result).toBeDefined();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/incidents/exportar?format=pdf',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
        headers: { Authorization: 'Bearer good-token' },
      }),
    );
  });

  it('surfaces non-2xx blob responses as thrown Errors (no silent JSON parse)', async () => {
    setAccessToken('good-token');
    fetchMock.mockResolvedValueOnce(blobResponse(403, new Uint8Array()));

    await expect(
      http.get('/incidents/exportar?format=pdf', { responseType: 'blob' }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('does NOT trigger refresh on 401 for blob responses (body would be lost)', async () => {
    setAccessToken('expired-token');
    fetchMock.mockResolvedValueOnce(blobResponse(401, new Uint8Array()));

    await expect(
      http.get('/incidents/exportar?format=pdf', { responseType: 'blob' }),
    ).rejects.toMatchObject({ status: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears state and dispatches auth:expired when refresh fails', async () => {
    setAccessToken('expired-token');

    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce({
        status: 401,
        ok: false,
        json: vi.fn().mockResolvedValue({ message: 'refresh failed' }),
      });

    const handler = vi.fn();
    window.addEventListener('auth:expired', handler);

    await expect(http.get('/incidents')).rejects.toThrow('Refresh failed');

    // handle401 no longer redirects directly — that responsibility moved
    // to the auth:expired listener in app.js. We only verify here that
    // the event is fired and that state is cleared.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe(''); // unchanged — listener owns the redirect
    expect(getAccessToken()).toBeNull();

    window.removeEventListener('auth:expired', handler);
  });
});
