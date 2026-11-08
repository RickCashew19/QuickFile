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

  describe('401 Session Expiration Logic', () => {
    it('does NOT treat 401 on POST /auth/login as expired session (wrong password)', async () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      authStorage.setToken('existing_token');

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          message: 'Invalid email or password.',
        }),
      });

      await expect(apiClient.post('/auth/login', { email: 'user@test.ph', password: 'bad' })).rejects.toThrow(
        ApiError
      );

      // Must NOT clear token and must NOT dispatch expired event
      expect(authStorage.getToken()).toBe('existing_token');
      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('does NOT treat 401 on other auth endpoints as expired session', async () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          message: 'Unauthorized register attempt.',
        }),
      });

      await expect(apiClient.post('/auth/register', {})).rejects.toThrow(ApiError);
      await expect(apiClient.post('/auth/forgot-password', {})).rejects.toThrow(ApiError);
      await expect(apiClient.post('/auth/reset-password', {})).rejects.toThrow(ApiError);
      await expect(apiClient.post('/auth/google', {})).rejects.toThrow(ApiError);

      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('treats 401 as expired session on authenticated routes when token was sent', async () => {
      authStorage.setToken('expired_token');
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          message: 'Session has ended.',
        }),
      });

      await expect(apiClient.get('/citizen/profile')).rejects.toThrow(ApiError);
      expect(authStorage.getToken()).toBeNull();
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'quickfile:auth:expired',
        })
      );
    });

    it('treats 401 with explicit TOKEN_EXPIRED or TOKEN_INVALID code as expired session', async () => {
      authStorage.setToken('stale_token');
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          code: 'TOKEN_INVALIDATED',
          message: 'Token has been revoked.',
        }),
      });

      await expect(apiClient.get('/data')).rejects.toThrow(ApiError);
      expect(authStorage.getToken()).toBeNull();
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'quickfile:auth:expired',
        })
      );
    });

    it('does NOT trigger session expired when no token was sent', async () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          message: 'Unauthorized access.',
        }),
      });

      await expect(apiClient.get('/public-view')).rejects.toThrow(ApiError);
      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });

  describe('429 Rate Limiting', () => {
    it('extracts retryAfter from response body before checking headers', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({
          'content-type': 'application/json',
          'Retry-After': '99',
        }),
        json: async () => ({
          success: false,
          message: 'Rate limit exceeded.',
          retryAfter: 25,
        }),
      });

      await expect(apiClient.get('/limited')).rejects.toMatchObject({
        status: 429,
        code: 'RATE_LIMITED',
        data: { retryAfterSeconds: 25 },
      });
    });

    it('falls back to Retry-After header when body retryAfter is missing', async () => {
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

    it('defaults retryAfter to 60 when neither body nor header specifies a value', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({
          'content-type': 'application/json',
        }),
        json: async () => ({
          success: false,
          message: 'Too many requests.',
        }),
      });

      await expect(apiClient.get('/limited')).rejects.toMatchObject({
        status: 429,
        code: 'RATE_LIMITED',
        data: { retryAfterSeconds: 60 },
      });
    });
  });

  describe('download() error and stream handling', () => {
    it('handles 401 during download and dispatches expired event when token sent', async () => {
      authStorage.setToken('valid_token');
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: false, message: 'Expired during download' }),
      });

      await expect(apiClient.download('/files/export.pdf')).rejects.toThrow(ApiError);
      expect(authStorage.getToken()).toBeNull();
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'quickfile:auth:expired' })
      );
    });

    it('handles 429 rate limit during download', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({
          'content-type': 'application/json',
          'Retry-After': '30',
        }),
        json: async () => ({ success: false, message: 'Download quota exceeded' }),
      });

      await expect(apiClient.download('/files/report.xlsx')).rejects.toMatchObject({
        status: 429,
        code: 'RATE_LIMITED',
        data: { retryAfterSeconds: 30 },
      });
    });

    it('successfully extracts filename and blob from successful download response', async () => {
      const mockBlob = new Blob(['sample-data'], { type: 'application/pdf' });
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'Content-Disposition': 'attachment; filename="barangay_clearance.pdf"',
          'X-Export-Truncated': 'false',
        }),
        blob: async () => mockBlob,
      });

      const result = await apiClient.download('/files/attachment.pdf');
      expect(result.filename).toBe('barangay_clearance.pdf');
      expect(result.truncated).toBe(false);
      expect(result.blob).toBe(mockBlob);
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
