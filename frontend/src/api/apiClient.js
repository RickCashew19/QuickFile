import { authStorage } from './authStorage';
import { extractFilenameFromHeader } from '../utils/downloadHelper';

const envApiUrl = import.meta.env.VITE_API_URL;

function resolveApiBaseUrl() {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    // When accessing via network IP (e.g. 10.x.x.x, 192.168.x.x) on phones/other devices,
    // dynamically point API requests to the host machine's port 5000 so other devices can connect
    if (!isLocalhost) {
      if (envApiUrl && envApiUrl.includes('localhost')) {
        return envApiUrl.replace('localhost', hostname);
      }
      if (envApiUrl && envApiUrl.includes('127.0.0.1')) {
        return envApiUrl.replace('127.0.0.1', hostname);
      }
      if (!envApiUrl) {
        return `${window.location.protocol}//${hostname}:5000/api/v1`;
      }
    }
  }
  return envApiUrl || 'http://localhost:5000/api/v1';
}

export const API_BASE_URL = resolveApiBaseUrl();

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

    // Super Admin Key verification on /admin/settings returns 401 on wrong key (without TOKEN_* code).
    // Only wrong Super Admin Key avoids logout; an expired token (TOKEN_EXPIRED) on /admin/settings must log out.
    const isWrongSuperAdminKey = endpoint.includes('/admin/settings') && !isExplicitTokenErrorCode;

    // Treat as expired session ONLY when token was sent AND:
    // 1) Explicit token error code (TOKEN_EXPIRED, TOKEN_INVALID, TOKEN_INVALIDATED), OR
    // 2) Non-auth endpoint without being an exempt wrong Super Admin Key
    const isExpiredSession =
      tokenSent &&
      (isExplicitTokenErrorCode || (!isAuthExempt && !isAuthEndpoint && !isWrongSuperAdminKey));

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
    throw new ApiError(msg, 409, (body && body.code) || 'CONFLICT', body ? body.data : null);
  }

  // 4. Handle Other HTTP Error Statuses
  if (!response.ok) {
    const message = (body && body.message) || `Request failed with status ${response.status}.`;
    const code = (body && body.code) || null;
    const errors = (body && body.errors) || null;
    throw new ApiError(message, response.status, code, body ? body.data : null, errors);
  }
}

const REFRESH_ENDPOINT = '/auth/refresh';
// A single in-flight refresh is shared by all requests that expire together,
// preventing a thundering herd of rotation requests on a stale access token.
let refreshInFlight = null;

function isAuthFlowEndpoint(endpoint) {
  return (
    endpoint.includes('/auth/login') ||
    endpoint.includes('/auth/register') ||
    endpoint.includes('/auth/google') ||
    endpoint.includes('/auth/forgot-password') ||
    endpoint.includes('/auth/reset-password') ||
    endpoint.includes(REFRESH_ENDPOINT)
  );
}

/**
 * Calls the refresh endpoint directly with the httpOnly refresh cookie. Uses
 * raw fetch (never apiClient.request) so it can never recurse into itself.
 * Returns the new access token, or throws if the session cannot be refreshed.
 */
async function performSilentRefresh() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const response = await fetch(`${API_BASE_URL}${REFRESH_ENDPOINT}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error('Refresh rejected');
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) throw new Error('Refresh returned no JSON');
    const body = await response.json();
    const accessToken = body && body.data && body.data.access_token;
    if (!accessToken) throw new Error('Refresh returned no access token');
    authStorage.setToken(accessToken);
    return accessToken;
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function parseResponseBody(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Performs a fetch and, on an expired access token, silently refreshes the
 * session and retries the original request exactly once.
 */
async function fetchWithRefresh(url, config, endpoint, tokenSent, networkErrorMessage) {
  let response;
  try {
    response = await fetch(url, config);
  } catch {
    throw new ApiError(networkErrorMessage, 0, 'NETWORK_ERROR');
  }
  let body = await parseResponseBody(response);

  const code = body && body.code;
  const canRefresh =
    response.status === 401 &&
    code === 'TOKEN_EXPIRED' &&
    !endpoint.includes(REFRESH_ENDPOINT) &&
    !isAuthFlowEndpoint(endpoint);

  if (canRefresh) {
    try {
      const newToken = await performSilentRefresh();
      const retryConfig = {
        ...config,
        headers: { ...config.headers, Authorization: `Bearer ${newToken}` },
      };
      response = await fetch(url, retryConfig);
      body = await parseResponseBody(response);
      tokenSent = true;
    } catch {
      // Refresh failed. Fall through so handleCommonErrors clears the session
      // and dispatches the expired event, as it did before refresh existed.
    }
  }
  return { response, body, tokenSent };
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
    // Send the httpOnly session cookie; Bearer headers remain supported for
    // non-browser clients and tests.
    credentials: 'include',
  };

  // Stringify JSON body if standard object
  if (config.body && typeof config.body === 'object' && !isFormData) {
    config.body = JSON.stringify(config.body);
  }

  const initialTokenSent = Boolean(headers['Authorization'] || token);
  const { response, body, tokenSent } = await fetchWithRefresh(
    url,
    config,
    endpoint,
    initialTokenSent,
    'Unable to connect to the QuickFile server. Please check your network connection.'
  );

  // Evaluate error status codes (401, 409, 429, 500, etc.)
  handleCommonErrors(response, body, endpoint, options, tokenSent);

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

  const config = { ...options, headers, credentials: 'include' };
  const initialTokenSent = Boolean(headers['Authorization'] || token);
  const { response, body, tokenSent } = await fetchWithRefresh(
    url,
    config,
    endpoint,
    initialTokenSent,
    'File download failed. Check network connection.'
  );

  // If response is not ok, attempt to parse JSON body for error details
  if (!response.ok) {
    handleCommonErrors(response, body, endpoint, options, tokenSent);
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
  delete: (url, bodyOrOpts = {}, opts = {}) => {
    // If second arg has opts properties (e.g. headers/signal) and no direct body, treat as opts
    if (bodyOrOpts && (bodyOrOpts.headers || bodyOrOpts.signal || bodyOrOpts.body !== undefined)) {
      return request(url, { ...bodyOrOpts, method: 'DELETE' });
    }
    // Otherwise treat second argument as request body
    return request(url, { ...opts, method: 'DELETE', body: bodyOrOpts });
  },
  download,
};
