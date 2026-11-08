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
 * Common response error handler for request() and download()
 */
function handleCommonErrors(response, body, endpoint, options, tokenSent) {
  // 1. Handle Rate Limiting (429)
  if (response.status === 429) {
    let retryAfterSeconds = 60;
    if (body) {
      const bodyVal =
        body.retryAfter ??
        body.retry_after ??
        (body.data && (body.data.retryAfter ?? body.data.retry_after ?? body.data.retryAfterSeconds));
      if (typeof bodyVal === 'number' && !isNaN(bodyVal)) {
        retryAfterSeconds = bodyVal;
      } else if (typeof bodyVal === 'string' && !isNaN(parseInt(bodyVal, 10))) {
        retryAfterSeconds = parseInt(bodyVal, 10);
      } else {
        const headerVal = response.headers.get('Retry-After');
        if (headerVal && !isNaN(parseInt(headerVal, 10))) {
          retryAfterSeconds = parseInt(headerVal, 10);
        }
      }
    } else {
      const headerVal = response.headers.get('Retry-After');
      if (headerVal && !isNaN(parseInt(headerVal, 10))) {
        retryAfterSeconds = parseInt(headerVal, 10);
      }
    }
    const msg = (body && body.message) || 'Too many requests. Please wait a moment before trying again.';
    throw new ApiError(msg, 429, 'RATE_LIMITED', { retryAfterSeconds });
  }

  // 2. Handle 401 Unauthorized
  if (response.status === 401) {
    const code = (body && (body.code || (body.data && body.data.code))) || 'UNAUTHORIZED';
    const method = (options.method || 'GET').toUpperCase();
    const isAuthExempt =
      method === 'POST' &&
      (endpoint.includes('/auth/login') ||
        endpoint.includes('/auth/register') ||
        endpoint.includes('/auth/forgot-password') ||
        endpoint.includes('/auth/reset-password') ||
        endpoint.includes('/auth/google'));

    const isExplicitTokenErrorCode = ['TOKEN_EXPIRED', 'TOKEN_INVALID', 'TOKEN_INVALIDATED'].includes(code);
    const isAuthEndpoint =
      endpoint.includes('/auth/login') ||
      endpoint.includes('/auth/register') ||
      endpoint.includes('/auth/forgot-password') ||
      endpoint.includes('/auth/reset-password') ||
      endpoint.includes('/auth/google');

    // Treat as expired session ONLY when token was sent AND (code is token error OR endpoint is not auth endpoint)
    const isExpiredSession = !isAuthExempt && tokenSent && (isExplicitTokenErrorCode || !isAuthEndpoint);

    if (isExpiredSession) {
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
    }
    throw new ApiError((body && body.message) || 'Unauthorized.', 401, code);
  }

  // 3. Handle Resource Conflict (409)
  if (response.status === 409) {
    const msg = (body && body.message) || 'This record was recently modified. Please refresh and try again.';
    throw new ApiError(msg, 409, 'CONFLICT', body ? body.data : null);
  }

  // 4. Handle Other HTTP Error Statuses
  if (!response.ok) {
    const message = (body && body.message) || `Request failed with status ${response.status}.`;
    const code = (body && body.code) || null;
    const errors = (body && body.errors) || null;
    throw new ApiError(message, response.status, code, body ? body.data : null, errors);
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

  // Evaluate error status codes (401, 409, 429, 500, etc.)
  handleCommonErrors(response, body, endpoint, options, Boolean(headers['Authorization'] || token));

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

  // If response is not ok, attempt to parse JSON body for error details
  if (!response.ok) {
    let body = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        body = await response.json();
      } catch {
        body = null;
      }
    }
    handleCommonErrors(response, body, endpoint, options, Boolean(headers['Authorization'] || token));
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
