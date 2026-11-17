const { config } = require('../config');

const COOKIE_NAME = 'quickfile_session';

/**
 * Stores the access token in an httpOnly, SameSite=Strict cookie so it cannot be
 * read by page JavaScript (XSS token theft). The cookie is host-scoped (no Domain),
 * Secure in production, and a session cookie so it disappears when the browser closes.
 */
function setAuthCookie(res, token) {
  if (!token) return;
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict',
    path: '/',
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict',
    path: '/',
  });
}

function getTokenFromCookie(req) {
  // Parse the Cookie header directly to avoid adding a cookie-parser dependency.
  const header = req.headers && req.headers.cookie;
  if (!header || typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() !== COOKIE_NAME) continue;
    try {
      const value = decodeURIComponent(part.slice(idx + 1).trim());
      return value && value.trim() ? value.trim() : null;
    } catch {
      return null;
    }
  }
  return null;
}

module.exports = { COOKIE_NAME, setAuthCookie, clearAuthCookie, getTokenFromCookie };
