import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiClient, ApiError } from '../services/apiClient';
import { authStorage } from '../services/authStorage';

describe('ApiClient Service Suite', () => {
  beforeEach(() => {
    authStorage.clearAll();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('unwraps standard { success: true, message, data } response envelope', async () => {
    const mockData = { id: 123, name: 'Barangay Central' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, message: 'Success', data: mockData }),
    });

    const result = await apiClient.get('/test-endpoint');
    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/test-endpoint'),
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('automatically attaches Authorization: Bearer token when present', async () => {
    authStorage.setToken('bearer_mock_jwt_token');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, message: 'OK', data: { authorized: true } }),
    });

    await apiClient.get('/protected-route');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer bearer_mock_jwt_token',
        }),
      })
    );
  });

  it('throws typed ApiError on non-ok responses with parsed status and message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: false,
        message: 'Invalid request parameters.',
        code: 'VALIDATION_ERROR',
      }),
    });

    await expect(apiClient.post('/fail', {})).rejects.toThrow(ApiError);
    await expect(apiClient.post('/fail', {})).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request parameters.',
    });
  });

  it('handles 401 Unauthorized by clearing tokens and dispatching quickfile:auth:expired', async () => {
    authStorage.setToken('expired_token');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: false,
        message: 'Token expired',
        code: 'TOKEN_EXPIRED',
      }),
    });

    await expect(apiClient.get('/secured')).rejects.toThrow(ApiError);
    expect(authStorage.getToken()).toBeNull();
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'quickfile:auth:expired',
      })
    );
  });

  it('parses Retry-After header on 429 Too Many Requests response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({
        'content-type': 'application/json',
        'Retry-After': '45',
      }),
      json: async () => ({
        success: false,
        message: 'Rate limit exceeded.',
      }),
    });

    await expect(apiClient.get('/limited')).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      data: { retryAfterSeconds: 45 },
    });
  });

  it('handles 409 Conflict response appropriately', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        success: false,
        message: 'Document already approved by another staff member.',
      }),
    });

    await expect(apiClient.post('/conflict', {})).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
    });
  });
});
