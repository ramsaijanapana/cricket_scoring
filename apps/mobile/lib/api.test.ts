import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, api } from './api';

vi.mock('./storage', () => ({
  storage: {
    getToken: vi.fn().mockResolvedValue(null),
    getRefreshToken: vi.fn().mockResolvedValue(null),
  },
}));

import { storage } from './storage';

function mockMatchRaw(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    format: 't20',
    formatConfigId: 'fc1',
    teamAId: 't1',
    teamBId: 't2',
    tossWinnerId: null,
    tossDecision: null,
    venue: null,
    venueId: null,
    weather: null,
    playingConditions: null,
    dlsActive: false,
    superOverId: null,
    result: null,
    status: 'live',
    scheduledAt: null,
    tournamentId: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    teams: [
      { teamId: 't1', teamName: 'Home XI', designation: 'home' },
      { teamId: 't2', teamName: 'Away XI', designation: 'away' },
    ],
    ...overrides,
  };
}

describe('ApiError', () => {
  it('sets name, status, message, and optional code/details', () => {
    const err = new ApiError('Not found', 404, 'NOT_FOUND', { field: 'id' });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.name).toBe('ApiError');
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.details).toEqual({ field: 'id' });
  });
});

describe('auth token normalization', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('normalizes login response from snake_case API fields', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          access_token: 'access-abc',
          refresh_token: 'refresh-xyz',
          expires_in: 7200,
        }),
    } as Response);

    await expect(api.login({ email: 'a@b.com', password: 'secret' })).resolves.toEqual({
      token: 'access-abc',
      refreshToken: 'refresh-xyz',
      expiresIn: 7200,
    });
  });

  it('defaults expiresIn to 3600 when refresh omits expires_in', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          access_token: 'access-abc',
          refresh_token: 'refresh-xyz',
        }),
    } as Response);

    await expect(api.refreshToken('refresh-xyz')).resolves.toEqual({
      token: 'access-abc',
      refreshToken: 'refresh-xyz',
      expiresIn: 3600,
    });
  });
});

describe('getMatches pagination unwrap', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('returns normalized matches from a plain array response', async () => {
    const raw = mockMatchRaw();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([raw]),
    } as Response);

    const matches = await api.getMatches();

    expect(matches).toHaveLength(1);
    expect(matches[0].teamA).toEqual({
      id: 't1',
      name: 'Home XI',
      shortName: null,
    });
    expect(matches[0].teamB).toEqual({
      id: 't2',
      name: 'Away XI',
      shortName: null,
    });
  });

  it('unwraps paginated { data: [...] } responses', async () => {
    const raw = mockMatchRaw({ id: 'm2', status: 'scheduled' });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [raw],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        }),
    } as Response);

    const matches = await api.getMatches();

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('m2');
    expect(matches[0].teamA?.name).toBe('Home XI');
  });

  it('includes Authorization header when storage has a token', async () => {
    vi.mocked(storage.getToken).mockResolvedValue('stored-token');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    } as Response);

    await api.getMatches();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/matches'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer stored-token',
        }),
      }),
    );
  });
});

describe('error parsing', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(storage.getToken).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
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

  it('throws ApiError with structured object error body', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () =>
        Promise.resolve({
          error: {
            code: 'FORBIDDEN',
            message: 'Access denied',
            details: { resource: 'matches' },
          },
        }),
    } as Response);

    await expect(api.getMatches()).rejects.toMatchObject({
      message: 'Access denied',
      status: 403,
      code: 'FORBIDDEN',
      details: { resource: 'matches' },
    });
  });

  it('falls back to top-level message when error object lacks message', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: () => Promise.resolve({ message: 'Validation failed' }),
    } as Response);

    await expect(api.getMatches()).rejects.toMatchObject({
      message: 'Validation failed',
      status: 422,
    });
  });

  it('uses status fallback when body has no parseable error', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: () => Promise.resolve({}),
    } as Response);

    await expect(api.getMatches()).rejects.toMatchObject({
      message: 'API error: 500',
      status: 500,
    });
  });
});
