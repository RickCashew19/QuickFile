const { config } = require('../config');

const COOKIE_NAME = 'quickfile_session';
const REFRESH_COOKIE_NAME = 'quickfile_refresh';
// Refresh cookies are only ever sent to the auth endpoints that need them.
const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * Stores the short-lived access token in an httpOnly, SameSite=Strict cookie so
 * it cannot be read by page JavaScript (XSS token theft). Host-scoped (no
 * Domain), Secure in production. maxAge matches the JWT lifetime so the browser
 * drops the cookie on the same schedule as the token it carries.
 */
function setAuthCookie(res, token) {
  if (!token) return;
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: config.jwt.expiresInMs,
  });
}

/**
 * Stores the opaque refresh token in an httpOnly cookie restricted to the auth
 * route prefix. The value is never exposed to JavaScript and never sent to
 * ordinary API routes, minimising accidental leakage.
 */
function setRefreshCookie(res, token) {
  if (!token) return;
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: config.session.refreshIdleDays * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict',
    path: '/',
  });
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  });
}

function getCookieValue(req, name) {
  const header = req.headers && req.headers.cookie;
  if (!header || typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    try {
      const value = decodeURIComponent(part.slice(idx + 1).trim());
      return value && value.trim() ? value.trim() : null;
    } catch {
      return null;
    }
  }
  return null;
}

function getTokenFromCookie(req) {
  // Parse the Cookie header directly to avoid adding a cookie-parser dependency.
  return getCookieValue(req, COOKIE_NAME);
}

function getRefreshTokenFromCookie(req) {
  return getCookieValue(req, REFRESH_COOKIE_NAME);
}

module.exports = {
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  setAuthCookie,
  setRefreshCookie,
  clearAuthCookie,
  getTokenFromCookie,
  getRefreshTokenFromCookie,
  getCookieValue,
};
