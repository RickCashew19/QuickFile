import { API_BASE_URL } from '../config/constants';
import { authStorage } from './authStorage';
import { extractFilenameFromHeader } from '../utils/downloadHelper';

export class ApiError extends Error {
  constructor(message, status = 500, code = null, data = null, errors = null) {
    super(message || 'An unexpected server error occurred.');
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
    this.errors = errors;
  }
}

/**
 * Native Fetch HTTP Client
 */
async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  const token = authStorage.getToken();

  const headers = {
    ...options.headers,
  };

  // Only set Content-Type to JSON if body is NOT FormData
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Attach Bearer token if present
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  // Stringify JSON body if standard object
  if (config.body && typeof config.body === 'object' && !isFormData) {
    config.body = JSON.stringify(config.body);
  }

  let response;
  try {
    response = await fetch(url, config);
  } catch (err) {
    throw new ApiError(
      'Unable to connect to the QuickFile server. Please check your network connection.',
      0,
      'NETWORK_ERROR'
    );
  }

  // Parse JSON response body if available
  let body = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  }

  // Handle Rate Limiting (429)
  if (response.status === 429) {
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 60;
    const msg = (body && body.message) || 'Too many requests. Please wait a moment before trying again.';
    throw new ApiError(msg, 429, 'RATE_LIMITED', { retryAfterSeconds });
  }

  // Handle Token Invalidation / Expiration (401)
  if (response.status === 401) {
    const code = (body && body.code) || 'UNAUTHORIZED';
    authStorage.clearAll();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('quickfile:auth:expired', {
          detail: {
            message: (body && body.message) || 'Your session has expired. Please log in again.',
            code,
          },
        })
      );
    }
    throw new ApiError((body && body.message) || 'Unauthorized.', 401, code);
  }

  // Handle Resource Conflict (409)
  if (response.status === 409) {
    const msg = (body && body.message) || 'This record was recently modified. Please refresh and try again.';
    throw new ApiError(msg, 409, 'CONFLICT', body ? body.data : null);
  }

  // Handle Other HTTP Error Statuses
  if (!response.ok) {
    const message = (body && body.message) || `Request failed with status ${response.status}.`;
    const code = (body && body.code) || null;
    const errors = (body && body.errors) || null;
    throw new ApiError(message, response.status, code, body ? body.data : null, errors);
  }

  // Return standard unwrap
  return body ? body.data : null;
}

/**
 * Binary Blob Stream Downloader
 */
async function download(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  const token = authStorage.getToken();

  const headers = {
    ...options.headers,
  };
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch {
    throw new ApiError('File download failed. Check network connection.', 0, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    let msg = `Download failed (${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson && errJson.message) msg = errJson.message;
    } catch {
      // Ignore text parse error
    }
    throw new ApiError(msg, response.status);
  }

  const disposition = response.headers.get('Content-Disposition');
  const filename = extractFilenameFromHeader(disposition, 'quickfile_export');
  const truncated = response.headers.get('X-Export-Truncated') === 'true';
  const blob = await response.blob();

  return { blob, filename, truncated };
}

export const apiClient = {
  get: (url, opts) => request(url, { ...opts, method: 'GET' }),
  post: (url, body, opts) => request(url, { ...opts, method: 'POST', body }),
  put: (url, body, opts) => request(url, { ...opts, method: 'PUT', body }),
  patch: (url, body, opts) => request(url, { ...opts, method: 'PATCH', body }),
  delete: (url, opts) => request(url, { ...opts, method: 'DELETE' }),
  download,
};
