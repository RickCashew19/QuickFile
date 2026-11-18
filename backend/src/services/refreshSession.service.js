const crypto = require('crypto');
const mongoose = require('mongoose');
const { config } = require('../config');
const { RefreshToken, User, AuditLog } = require('../models');

const DAY_MS = 24 * 60 * 60 * 1000;

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

function newFamilyId() {
  return new mongoose.Types.ObjectId().toString();
}

/**
 * Issues a brand-new refresh session (one family per login). The raw token is
 * returned to the caller for the httpOnly cookie; only its hash is persisted.
 */
async function issueSession(user, ipAddress = '', userAgent = '') {
  const rawToken = crypto.randomBytes(48).toString('base64url');
  const now = Date.now();
  await RefreshToken.create({
    user_id: user._id,
    family_id: newFamilyId(),
    token_hash: hashToken(rawToken),
    expires_at: new Date(now + config.session.refreshIdleDays * DAY_MS),
    absolute_expires_at: new Date(now + config.session.refreshAbsoluteDays * DAY_MS),
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });
  return rawToken;
}

/**
 * Rotates a refresh token within its family.
 *
 * Security properties:
 *  - Hash lookup only; the raw token is never stored or logged.
 *  - Idle (7d) and absolute (30d) expiries are both enforced.
 *  - Reuse of an already-rotated token revokes the ENTIRE family and emits an
 *    audit event (theft detection, RFC 9700 4.14.2).
 *  - Every rotation produces a new token; the old one is permanently burned.
 *
 * @returns {Promise<{ refreshToken: string, user: Object }>}
 */
async function rotateSession(rawToken, ipAddress = '', userAgent = '') {
  if (!rawToken || typeof rawToken !== 'string') {
    const err = new Error('A refresh token is required.');
    err.statusCode = 401;
    err.code = 'REFRESH_REQUIRED';
    throw err;
  }

  const tokenHash = hashToken(rawToken);
  const record = await RefreshToken.findOne({ token_hash: tokenHash });

  if (!record) {
    const err = new Error('Invalid refresh token. Please log in again.');
    err.statusCode = 401;
    err.code = 'REFRESH_INVALID';
    throw err;
  }

  if (record.revoked_at) {
    const err = new Error('This session has been revoked. Please log in again.');
    err.statusCode = 401;
    err.code = 'REFRESH_REVOKED';
    throw err;
  }

  if (record.used_at) {
    // Reuse of a consumed token => the family was stolen. Kill every token in it.
    await RefreshToken.updateMany(
      { family_id: record.family_id, revoked_at: null },
      { $set: { revoked_at: new Date() } }
    );
    await AuditLog.create({
      user_id: record.user_id,
      actor_name: 'System',
      action: 'REFRESH_REUSE_DETECTED',
      module: 'AUTH',
      target_id: record.user_id.toString(),
      target_type: 'User',
      details: { family_id: record.family_id, reason: 'rotated_token_replayed' },
      ip_address: ipAddress || '',
      user_agent: userAgent || '',
    });
    const err = new Error('Refresh token reuse detected. All sessions in this family were revoked.');
    err.statusCode = 401;
    err.code = 'REFRESH_REUSE_DETECTED';
    throw err;
  }

  const now = Date.now();
  if (record.expires_at.getTime() <= now) {
    const err = new Error('Session idle timeout reached. Please log in again.');
    err.statusCode = 401;
    err.code = 'REFRESH_EXPIRED';
    throw err;
  }
  if (record.absolute_expires_at.getTime() <= now) {
    const err = new Error('Maximum session lifetime reached. Please log in again.');
    err.statusCode = 401;
    err.code = 'REFRESH_ABSOLUTE_EXPIRED';
    throw err;
  }

  const user = await User.findById(record.user_id).select('-password_hash');
  if (!user || !user.is_active) {
    const err = new Error('Account not found or deactivated. Please log in again.');
    err.statusCode = 401;
    err.code = 'REFRESH_INVALID';
    throw err;
  }

  // Password change invalidates every outstanding session, including refresh
  // tokens that predate the change (defence in depth alongside access tokens).
  if (user.password_changed_at && record.created_at && record.created_at < user.password_changed_at) {
    await revokeUserSessions(user._id);
    const err = new Error('Session invalidated by a recent password change. Please log in again.');
    err.statusCode = 401;
    err.code = 'TOKEN_INVALIDATED';
    throw err;
  }

  // Mark the presented token consumed, then mint a replacement in the family.
  record.used_at = new Date();
  await record.save();

  const rawTokenNext = crypto.randomBytes(48).toString('base64url');
  await RefreshToken.create({
    user_id: user._id,
    family_id: record.family_id,
    token_hash: hashToken(rawTokenNext),
    expires_at: new Date(now + config.session.refreshIdleDays * DAY_MS),
    absolute_expires_at: record.absolute_expires_at,
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  return { refreshToken: rawTokenNext, user };
}

/**
 * Revokes every token in the family that owns the given raw token.
 */
async function revokeFamily(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return 0;
  const record = await RefreshToken.findOne({ token_hash: hashToken(rawToken) });
  if (!record) return 0;
  const result = await RefreshToken.updateMany(
    { family_id: record.family_id, revoked_at: null },
    { $set: { revoked_at: new Date() } }
  );
  return result.modifiedCount || 0;
}

/**
 * Revokes all sessions for a user (used on password change / admin reset).
 */
async function revokeUserSessions(userId) {
  const result = await RefreshToken.updateMany(
    { user_id: userId, revoked_at: null },
    { $set: { revoked_at: new Date() } }
  );
  return result.modifiedCount || 0;
}

module.exports = {
  hashToken,
  issueSession,
  rotateSession,
  revokeFamily,
  revokeUserSessions,
};
