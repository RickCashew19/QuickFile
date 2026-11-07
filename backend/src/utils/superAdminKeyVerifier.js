const crypto = require('crypto');
const { config } = require('../config');
const { SuperAdminLockout, AuditLog } = require('../models');
const { SUPER_ADMIN_LOCKOUT } = require('../config/constants');

/**
 * Verifies the Super Admin Key using crypto.timingSafeEqual
 * Enforces lockout after 5 consecutive failures and audits all attempts
 * NEVER logs the key itself
 * 
 * @param {Object} params
 * @param {string} params.providedKey - Key provided by the user
 * @param {string} [params.actorId] - User ObjectId
 * @param {string} [params.actorName] - User full name
 * @param {string} [params.ipAddress] - Request IP
 * @param {string} [params.userAgent] - Request User-Agent
 * @returns {Promise<boolean>}
 */
async function verifySuperAdminKey({ providedKey, actorId = null, actorName = 'Admin', ipAddress = '', userAgent = '' }) {
  const configuredKey = config.getSuAdminKey();
  if (!configuredKey) {
    const err = new Error('SU_ADMIN_KEY is not configured on the server.');
    err.statusCode = 500;
    throw err;
  }

  // Find or create the single lockout record
  let lockout = await SuperAdminLockout.findOne();
  if (!lockout) {
    lockout = await SuperAdminLockout.create({});
  }

  // 1. Check if currently locked out
  if (lockout.locked_until && new Date() < lockout.locked_until) {
    const remainingMs = lockout.locked_until.getTime() - Date.now();
    const remainingMinutes = Math.ceil(remainingMs / 60000);

    await AuditLog.create({
      user_id: actorId,
      actor_name: actorName,
      action: 'SU_KEY_VERIFY_BLOCKED_LOCKED',
      module: 'SETTINGS',
      target_type: 'SuperAdminLockout',
      details: { remaining_minutes: remainingMinutes },
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    const err = new Error(`Super Admin Key is locked. Try again in ${remainingMinutes} minute(s).`);
    err.statusCode = 423; // Locked
    throw err;
  }

  // 2. Timing-safe comparison using SHA-256 fixed-length buffers
  const hashConfigured = crypto.createHash('sha256').update(configuredKey).digest();
  const hashProvided = crypto.createHash('sha256').update(String(providedKey || '')).digest();
  const isMatch = crypto.timingSafeEqual(hashConfigured, hashProvided);

  if (isMatch) {
    // Reset lockout counters on success
    lockout.failed_attempts = 0;
    lockout.locked_until = null;
    lockout.last_verified_at = new Date();
    await lockout.save();

    await AuditLog.create({
      user_id: actorId,
      actor_name: actorName,
      action: 'SU_KEY_VERIFY_SUCCESS',
      module: 'SETTINGS',
      target_type: 'SuperAdminLockout',
      details: { verified: true },
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return true;
  }

  // 3. Handle verification failure
  lockout.failed_attempts += 1;
  const isNowLocked = lockout.failed_attempts >= SUPER_ADMIN_LOCKOUT.MAX_ATTEMPTS;

  if (isNowLocked) {
    lockout.locked_until = new Date(Date.now() + SUPER_ADMIN_LOCKOUT.LOCKOUT_MINUTES * 60 * 1000);
  }

  await lockout.save();

  await AuditLog.create({
    user_id: actorId,
    actor_name: actorName,
    action: isNowLocked ? 'SU_KEY_VERIFY_LOCKOUT_TRIGGERED' : 'SU_KEY_VERIFY_FAILED',
    module: 'SETTINGS',
    target_type: 'SuperAdminLockout',
    details: {
      failed_attempts: lockout.failed_attempts,
      locked: isNowLocked,
    },
    ip_address: ipAddress,
    user_agent: userAgent,
  });

  if (isNowLocked) {
    const err = new Error(
      `Invalid Super Admin Key. Maximum attempts exceeded. Locked out for ${SUPER_ADMIN_LOCKOUT.LOCKOUT_MINUTES} minutes.`
    );
    err.statusCode = 423;
    throw err;
  }

  const remainingAttempts = SUPER_ADMIN_LOCKOUT.MAX_ATTEMPTS - lockout.failed_attempts;
  const err = new Error(`Invalid Super Admin Key. ${remainingAttempts} attempt(s) remaining before lockout.`);
  err.statusCode = 401;
  throw err;
}

module.exports = {
  verifySuperAdminKey,
};
