import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiClient, ApiError } from '../api/apiClient';
import { authStorage } from '../api/authStorage';

function jsonResponse(status, payload, extraHeaders = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json', ...extraHeaders }),
    json: async () => payload,
  };
}

function expiredResponse() {
  return jsonResponse(401, { success: false, code: 'TOKEN_EXPIRED', message: 'Token has expired.' });
}

function refreshedResponse(token = 'refreshed_access_token') {
  return jsonResponse(200, {
    success: true,
    message: 'Session refreshed successfully.',
    data: { access_token: token, token_type: 'Bearer', user: { id: 'u1', role: 'citizen' } },
  });
}

function okResponse(data) {
  return jsonResponse(200, { success: true, message: 'OK', data });
}

describe('Silent token refresh', () => {
  beforeEach(() => {
    authStorage.clearAll();
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('refreshes on TOKEN_EXPIRED then retries the original request', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    let protectedCalls = 0;
    let refreshCalls = 0;
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('/auth/refresh')) {
        refreshCalls += 1;
        return refreshedResponse('new_token_123');
      }
      protectedCalls += 1;
      return protectedCalls === 1 ? expiredResponse() : okResponse({ id: 42 });
    });

    const result = await apiClient.get('/citizen/profile');

    expect(result).toEqual({ id: 42 });
    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toBe(2);
    expect(authStorage.getToken()).toBe('new_token_123');
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('shares a single refresh across concurrent expired requests (single-flight)', async () => {
    authStorage.setToken('stale_token');
    let refreshCalls = 0;
    const attempted = new Set();
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('/auth/refresh')) {
        refreshCalls += 1;
        await Promise.resolve();
        return refreshedResponse('shared_token');
      }
      // First attempt for each endpoint is expired; the retry after refresh
      // succeeds so the token is not cleared.
      if (!attempted.has(url)) {
        attempted.add(url);
        return expiredResponse();
      }
      return okResponse({ ok: true });
    });

    const results = await Promise.allSettled([
      apiClient.get('/a'),
      apiClient.get('/b'),
      apiClient.get('/c'),
    ]);

    expect(refreshCalls).toBe(1);
    expect(authStorage.getToken()).toBe('shared_token');
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('falls back to session-expired handling when refresh fails', async () => {
    authStorage.setToken('stale_token');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    let refreshCalls = 0;
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('/auth/refresh')) {
        refreshCalls += 1;
        return jsonResponse(401, { success: false, code: 'REFRESH_REVOKED', message: 'Session revoked.' });
      }
      return expiredResponse();
    });

    await expect(apiClient.get('/citizen/profile')).rejects.toThrow(ApiError);
    expect(refreshCalls).toBe(1);
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'quickfile:auth:expired' }));
  });

  it('does NOT refresh on TOKEN_INVALID / TOKEN_INVALIDATED', async () => {
    authStorage.setToken('invalidated_token');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('/auth/refresh')) throw new Error('refresh must not be called');
      return jsonResponse(401, { success: false, code: 'TOKEN_INVALIDATED', message: 'Token invalidated.' });
    });

    await expect(apiClient.get('/data')).rejects.toThrow(ApiError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'quickfile:auth:expired' }));
  });

  it('never recursively refreshes the refresh endpoint itself', async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse(401, { success: false, code: 'TOKEN_EXPIRED', message: 'Token has expired.' })
    );

    await expect(apiClient.post('/auth/refresh')).rejects.toThrow(ApiError);
    // One call only: the refresh endpoint must not trigger another refresh.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not refresh on auth-flow 401 (wrong password)', async () => {
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('/auth/refresh')) throw new Error('refresh must not be called');
      return jsonResponse(401, { success: false, message: 'Invalid email or password.' });
    });

    await expect(apiClient.post('/auth/login', {})).rejects.toThrow(ApiError);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
