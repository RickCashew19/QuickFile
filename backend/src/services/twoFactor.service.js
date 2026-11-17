const crypto = require('crypto');
const { TwoFactorVerification, AuditLog } = require('../models');
const { sendMail } = require('../helpers/mailer');
const { escapeHtml } = require('../helpers/escapeHtml');

/**
 * Mask email address for safe display in UI & logs (e.g., a***n@quickfile.gov.ph)
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') return '*****';
  const parts = email.split('@');
  if (parts.length !== 2) return '*****';
  const [name, domain] = parts;
  if (name.length <= 2) {
    return `${name[0]}*@${domain}`;
  }
  return `${name[0]}${'*'.repeat(name.length - 2)}${name[name.length - 1]}@${domain}`;
}

/**
 * Initiates a 2FA email verification session for Super Admin API key registration/updates.
 * Generates a 6-digit numeric verification code, hashes it with SHA-256,
 * stores it with a 10-minute expiry and 3-attempt limit, and emails the code.
 *
 * @param {Object} params
 * @param {Object} params.user - User document of the authenticated admin
 * @param {Object} params.pendingUpdates - Key-value map of CUSTOM_* settings pending verification
 * @param {Array<string>} [params.pendingResetKeys] - Optional array of CUSTOM_* keys to reset
 * @param {string} [params.ipAddress]
 * @param {string} [params.userAgent]
 * @returns {Promise<{ verification_id: string, email_masked: string, expires_in_seconds: number }>}
 */
async function initiateApiKey2FA({ user, pendingUpdates = {}, pendingResetKeys = [], ipAddress = '', userAgent = '' }) {
  if (!user || !user.email) {
    const err = new Error('Authenticated administrator with registered email is required.');
    err.statusCode = 400;
    throw err;
  }

  // 1. Invalidate any prior unverified 2FA requests for this admin
  await TwoFactorVerification.deleteMany({
    user_id: user._id,
    verified: false,
  });

  // 2. Generate a secure 6-digit numeric verification code
  const code = crypto.randomInt(100000, 1000000).toString();

  // 3. Hash code with email salt for secure storage
  const codeHash = crypto
    .createHash('sha256')
    .update(code + ':' + user.email.toLowerCase().trim())
    .digest('hex');

  const expiryMs = 10 * 60 * 1000; // 10 minutes
  const expiresAt = new Date(Date.now() + expiryMs);

  // 4. Persist pending verification state
  const verification = await TwoFactorVerification.create({
    user_id: user._id,
    email: user.email.toLowerCase().trim(),
    action: 'API_KEY_UPDATE',
    code_hash: codeHash,
    pending_updates: pendingUpdates,
    pending_reset_keys: pendingResetKeys,
    attempts: 0,
    max_attempts: 3,
    expires_at: expiresAt,
    verified: false,
  });

  // 5. Send verification email via transactional mailer (bypasses marketing toggle)
  const safeName = escapeHtml(user.full_name || 'Administrator');
  const maskedEmail = maskEmail(user.email);

  await sendMail({
    to: user.email,
    subject: `QuickFile - API Key Management 2FA Verification Code (${code})`,
    text: `Hello ${user.full_name},\n\nYou have initiated a configuration change to API keys and integration credentials in QuickFile.\n\nYour 6-digit Two-Factor Authentication (2FA) verification code is:\n\n${code}\n\nThis code is valid for 10 minutes and can be attempted a maximum of 3 times.\nIf you did not initiate this change, your administrator account may be compromised. Please change your password immediately.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #0f172a; margin: 0 0 6px 0; font-size: 20px;">Two-Factor Authentication (2FA)</h2>
          <p style="color: #64748b; font-size: 14px; margin: 0;">API Key Registration & Modification</p>
        </div>
        <p style="color: #334155; font-size: 14px;">Hello <strong>${safeName}</strong>,</p>
        <p style="color: #334155; font-size: 14px;">
          A request was submitted to register or modify custom API key configurations in the QuickFile System Settings.
        </p>
        <p style="color: #334155; font-size: 14px; margin-bottom: 8px;">Your 6-digit 2FA verification code is:</p>
        <div style="background: #eff6ff; border: 2px dashed #3b82f6; border-radius: 8px; padding: 18px; text-align: center; margin: 16px 0;">
          <span style="font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #1d4ed8; font-family: monospace;">${code}</span>
        </div>
        <ul style="color: #64748b; font-size: 13px; line-height: 1.6; padding-left: 20px; margin: 16px 0;">
          <li>This code will expire in <strong>10 minutes</strong>.</li>
          <li>Maximum <strong>3 attempts</strong> allowed before code invalidation.</li>
          <li>Do not share this code with anyone. QuickFile staff will never request your 2FA code.</li>
        </ul>
        <div style="background: #fef2f2; border: 1px solid #fee2e2; border-radius: 6px; padding: 12px; margin-top: 16px;">
          <p style="color: #991b1b; font-size: 12px; margin: 0;">
            <strong>Security Warning:</strong> If you did not request this change, someone may be attempting to alter your system's integration keys. Please review your account audit logs immediately.
          </p>
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px 0;" />
        <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">
          QuickFile Barangay Document Request & Management System
        </p>
      </div>
    `,
    isTransactional: true,
  });

  // 6. Audit log entry
  await AuditLog.create({
    user_id: user._id,
    actor_name: user.full_name || 'Admin',
    action: '2FA_CODE_SENT',
    module: 'SETTINGS',
    target_id: verification._id.toString(),
    target_type: 'TwoFactorVerification',
    details: {
      action: 'API_KEY_UPDATE',
      email: maskedEmail,
      keys_modified: Object.keys(pendingUpdates),
    },
    ip_address: ipAddress,
    user_agent: userAgent,
  });

  return {
    verification_id: verification._id.toString(),
    email_masked: maskedEmail,
    expires_in_seconds: 600,
  };
}

/**
 * Verifies a submitted 6-digit 2FA code.
 * Enforces timing-safe comparison, attempt limits (max 3), and expiration.
 *
 * @param {Object} params
 * @param {string} params.verificationId - ID of TwoFactorVerification record
 * @param {string} params.code - 6-digit code submitted by admin
 * @param {Object} params.user - Authenticated admin user
 * @param {string} [params.ipAddress]
 * @param {string} [params.userAgent]
 * @returns {Promise<{ verified: boolean, pending_updates: Object, pending_reset_keys: Array<string> }>}
 */
async function verifyApiKey2FA({ verificationId, code, user, ipAddress = '', userAgent = '' }) {
  if (!verificationId || !code) {
    const err = new Error('Verification ID and 6-digit verification code are required.');
    err.statusCode = 400;
    throw err;
  }

  const trimmedCode = String(code).trim();
  if (!/^\d{6}$/.test(trimmedCode)) {
    const err = new Error('Verification code must be exactly 6 digits.');
    err.statusCode = 400;
    throw err;
  }

  const verification = await TwoFactorVerification.findById(verificationId);
  if (!verification || verification.verified) {
    const err = new Error('Invalid or already consumed 2FA verification session.');
    err.statusCode = 400;
    throw err;
  }

  // Ensure user owns this verification record
  if (verification.user_id.toString() !== user._id.toString()) {
    const err = new Error('Unauthorized 2FA verification attempt.');
    err.statusCode = 403;
    throw err;
  }

  // Check expiration
  if (new Date() > verification.expires_at) {
    await TwoFactorVerification.deleteOne({ _id: verification._id });
    await AuditLog.create({
      user_id: user._id,
      actor_name: user.full_name,
      action: '2FA_CODE_EXPIRED',
      module: 'SETTINGS',
      target_id: verification._id.toString(),
      target_type: 'TwoFactorVerification',
      details: { verification_id: verificationId },
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    const err = new Error('2FA verification code has expired. Please initiate a new request.');
    err.statusCode = 400;
    throw err;
  }

  // Check attempt limits
  if (verification.attempts >= verification.max_attempts) {
    await TwoFactorVerification.deleteOne({ _id: verification._id });
    await AuditLog.create({
      user_id: user._id,
      actor_name: user.full_name,
      action: '2FA_MAX_ATTEMPTS_EXCEEDED',
      module: 'SETTINGS',
      target_id: verification._id.toString(),
      target_type: 'TwoFactorVerification',
      details: { verification_id: verificationId, attempts: verification.attempts },
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    const err = new Error('Maximum verification attempts exceeded. This 2FA session has been invalidated.');
    err.statusCode = 400;
    throw err;
  }

  // Timing-safe comparison of SHA-256 code hash
  const submittedHash = crypto
    .createHash('sha256')
    .update(trimmedCode + ':' + user.email.toLowerCase().trim())
    .digest('hex');

  const bufStored = Buffer.from(verification.code_hash, 'utf8');
  const bufSubmitted = Buffer.from(submittedHash, 'utf8');
  const isMatch = bufStored.length === bufSubmitted.length && crypto.timingSafeEqual(bufStored, bufSubmitted);

  if (!isMatch) {
    verification.attempts += 1;
    await verification.save();

    const remainingAttempts = Math.max(0, verification.max_attempts - verification.attempts);

    await AuditLog.create({
      user_id: user._id,
      actor_name: user.full_name,
      action: '2FA_CODE_FAILED',
      module: 'SETTINGS',
      target_id: verification._id.toString(),
      target_type: 'TwoFactorVerification',
      details: {
        verification_id: verificationId,
        attempt_number: verification.attempts,
        remaining_attempts: remainingAttempts,
      },
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    if (remainingAttempts === 0) {
      await TwoFactorVerification.deleteOne({ _id: verification._id });
      const err = new Error('Invalid verification code. Maximum attempts exceeded. 2FA session invalidated.');
      err.statusCode = 400;
      throw err;
    }

    const err = new Error(`Invalid verification code. ${remainingAttempts} attempt(s) remaining.`);
    err.statusCode = 400;
    throw err;
  }

  // Verification successful!
  verification.verified = true;
  await verification.save();

  await AuditLog.create({
    user_id: user._id,
    actor_name: user.full_name,
    action: '2FA_CODE_VERIFIED',
    module: 'SETTINGS',
    target_id: verification._id.toString(),
    target_type: 'TwoFactorVerification',
    details: {
      verification_id: verificationId,
      keys_to_update: Object.keys(verification.pending_updates || {}),
    },
    ip_address: ipAddress,
    user_agent: userAgent,
  });

  return {
    verified: true,
    pending_updates: verification.pending_updates || {},
    pending_reset_keys: verification.pending_reset_keys || [],
  };
}

module.exports = {
  maskEmail,
  initiateApiKey2FA,
  verifyApiKey2FA,
};
