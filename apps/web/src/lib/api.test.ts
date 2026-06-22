import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, api, setAuthToken, clearAuthToken, parseJwtPayload, resetAuthRedirectState } from './api';

describe('ApiError', () => {
  it('sets name, status, message, and optional code', () => {
    const err = new ApiError('Not found', 404, 'NOT_FOUND');

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.name).toBe('ApiError');
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });
});

describe('request helper via api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    clearAuthToken();
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_id');
    resetAuthRedirectState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed JSON on success', async () => {
    const matches = [{ id: 'm1', status: 'live' }];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(matches),
    } as Response);

    await expect(api.getMatches()).resolves.toEqual(matches);
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/matches',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('throws ApiError with a string error body', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ error: 'Invalid match' }),
    } as Response);

    await expect(api.getMatches()).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Invalid match',
      status: 400,
    });
  });

  it('throws ApiError with an object error body', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () =>
        Promise.resolve({ error: { code: 'FORBIDDEN', message: 'Access denied' } }),
    } as Response);

    await expect(api.getMatches()).rejects.toMatchObject({
      message: 'Access denied',
      status: 403,
      code: 'FORBIDDEN',
    });
  });

  it('includes auth header when a token is set', async () => {
    setAuthToken('test-token');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    } as Response);

    await api.getMatches();

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/matches',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );
  });

  it('clears auth and redirects on 401 for protected routes', async () => {
    setAuthToken('expired-token');
    localStorage.setItem('refresh_token', 'refresh');
    localStorage.setItem('user_id', 'user-1');

    let redirectedTo = '';
    vi.stubGlobal('location', {
      pathname: '/settings',
      search: '',
      get href() {
        return redirectedTo;
      },
      set href(value: string) {
        redirectedTo = value;
      },
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ error: 'Authentication required' }),
    } as Response);

    await expect(api.getMatches()).rejects.toMatchObject({ status: 401 });

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(localStorage.getItem('user_id')).toBeNull();
    expect(redirectedTo).toContain('/login?redirect=');
  });

  it('does not redirect on 401 from auth login endpoint', async () => {
    let redirectedTo = '';
    vi.stubGlobal('location', {
      pathname: '/login',
      search: '',
      get href() {
        return redirectedTo;
      },
      set href(value: string) {
        redirectedTo = value;
      },
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ error: 'Invalid email or password' }),
    } as Response);

    await expect(api.login({ email: 'a@b.com', password: 'wrong' })).rejects.toMatchObject({
      status: 401,
    });

    expect(redirectedTo).toBe('');
  });
});

describe('parseJwtPayload', () => {
  it('decodes sub and email from a JWT payload segment', () => {
    const payload = btoa(JSON.stringify({ sub: 'user-123', email: 'test@example.com' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const token = `header.${payload}.signature`;

    expect(parseJwtPayload(token)).toEqual({
      sub: 'user-123',
      email: 'test@example.com',
    });
  });

  it('returns null for invalid tokens', () => {
    expect(parseJwtPayload('not-a-jwt')).toBeNull();
  });
});

describe('social layer api helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    clearAuthToken();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getMatchPresence fetches spectator count', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ count: 42 }),
    } as Response);

    await expect(api.getMatchPresence('match-1')).resolves.toEqual({ count: 42 });
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/matches/match-1/presence',
      expect.any(Object),
    );
  });

  it('getReactions fetches aggregated counts for a delivery', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [{ deliveryId: 'd1', emoji: '\uD83D\uDD25', count: 3 }],
        }),
    } as Response);

    await expect(api.getReactions('match-1', 'd1')).resolves.toEqual({
      data: [{ deliveryId: 'd1', emoji: '\uD83D\uDD25', count: 3 }],
    });
  });

  it('submitReaction posts emoji payload', async () => {
    setAuthToken('test-token');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: 'r1', emoji: '\uD83D\uDC4F' }),
    } as Response);

    await api.submitReaction('match-1', { deliveryId: 'd1', emoji: '\uD83D\uDC4F' });

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/matches/match-1/reactions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ deliveryId: 'd1', emoji: '\uD83D\uDC4F' }),
      }),
    );
  });
});
