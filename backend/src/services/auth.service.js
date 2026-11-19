const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { config } = require('../config');
const { ROLES, PASSWORD_RESET } = require('../config/constants');
const { validatePasswordPolicy } = require('../validators/passwordValidator');
const {
  User,
  CitizenProfile,
  StaffDetail,
  StaffPermission,
  PasswordReset,
  AppSetting,
  AuditLog,
} = require('../models');
const { sendMail } = require('../helpers/mailer');
const { sendSms } = require('../helpers/sms');
const { normalizePhilippinePhone } = require('../helpers/phoneUtil');
const { buildUserProfileMirror } = require('../helpers/userProfileSync');
const { isValidEmail } = require('../helpers/emailValidator');
const { escapeHtml } = require('../helpers/escapeHtml');
const { withTransaction } = require('../helpers/transaction');
const { issueSession, revokeFamily, revokeUserSessions } = require('./refreshSession.service');

/**
 * Dependency-injected Google Token Verifier (allows clean test mocking without environment backdoors)
 */
let googleTokenVerifier = null;

function setGoogleTokenVerifier(verifier) {
  googleTokenVerifier = verifier;
}

async function verifyGoogleIdToken(idToken) {
  if (typeof googleTokenVerifier === 'function') {
    return googleTokenVerifier(idToken);
  }

  const clientId = config.google.resolveClientId().value;
  if (!clientId) {
    const error = new Error('Google Client ID is not configured on the server.');
    error.statusCode = 500;
    throw error;
  }

  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId,
  });
  return ticket.getPayload();
}

/**
 * Signs a standard JWT access token for an authenticated user
 */
function generateToken(user) {
  const secret = config.jwt.getSecret();
  if (!secret) {
    throw new Error('JWT_SECRET is missing in server configuration.');
  }
  return jwt.sign(
    {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    },
    secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

/**
 * Business logic for Citizen self-registration
 */
async function registerCitizen(payload, ipAddress, userAgent) {
  const {
    email,
    password,
    first_name,
    middle_name,
    last_name,
    suffix,
    birthdate,
    gender,
    civil_status,
    phone,
    contact_number,
    purok_zone,
    street_address,
    barangay,
    city,
    province,
    occupation,
    emergency_contact_name,
    emergency_contact_number,
  } = payload;

  if (!isValidEmail(email)) {
    const error = new Error('Validation error: A valid email address is required.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    const error = new Error('An account with this email address already exists.');
    error.statusCode = 409;
    throw error;
  }

  const passwordHash = await User.hashPassword(password);

  let primaryPhone = (phone || contact_number || '').trim();
  if (primaryPhone) {
    const norm = normalizePhilippinePhone(primaryPhone);
    if (norm.isValid) {
      primaryPhone = norm.local;
    }
  }

  let emergencyPhone = (emergency_contact_number || '').trim();
  if (emergencyPhone) {
    const normEmergency = normalizePhilippinePhone(emergencyPhone);
    if (normEmergency.isValid) {
      emergencyPhone = normEmergency.local;
    }
  }

  // Build the profile payload first, then derive the User mirror from the very
  // same data so the two records can never disagree at creation time.
  const profileData = {
    first_name: first_name.trim(),
    middle_name: (middle_name || '').trim(),
    last_name: last_name.trim(),
    suffix: (suffix || '').trim(),
    contact_number: primaryPhone,
    birthdate: new Date(birthdate),
    gender,
    civil_status: civil_status || 'single',
    purok_zone: (purok_zone || '').trim(),
    street_address: (street_address || '').trim(),
    barangay: (barangay || config.jurisdiction.barangayName()).trim(),
    city: (city || config.jurisdiction.cityMunicipality()).trim(),
    province: (province || config.jurisdiction.province()).trim(),
    occupation: (occupation || '').trim(),
    emergency_contact_name: (emergency_contact_name || '').trim(),
    emergency_contact_number: emergencyPhone,
    profile_complete: true,
  };
  const mirror = buildUserProfileMirror(profileData);
  const fullName = mirror.full_name;

  // 1. Create User
  const newUser = await User.create({
    email: normalizedEmail,
    password_hash: passwordHash,
    ...mirror,
    role: ROLES.CITIZEN,
    is_active: true,
  });

  // 2. Create Citizen Profile (standard registration includes birthdate & gender)
  const profile = await CitizenProfile.create({
    user_id: newUser._id,
    ...profileData,
  });

  // 3. Issue short-lived access token + refresh session
  const token = generateToken(newUser);
  const refreshToken = await issueSession(newUser, ipAddress, userAgent);

  // 4. Append-Only Audit Log
  await AuditLog.create({
    user_id: newUser._id,
    actor_name: fullName,
    action: 'CITIZEN_REGISTER',
    module: 'AUTH',
    target_id: newUser._id.toString(),
    target_type: 'CitizenProfile',
    details: { email: newUser.email, full_name: fullName },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  return {
    access_token: token,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    user: newUser.toJSON(),
    profile,
  };
}

/**
 * Records a failed authentication attempt without ever logging the submitted
 * password. Audit failures must never change the 401/403 response returned to
 * the client, so a logging error is suppressed here.
 */
async function recordFailedLogin({ user = null, email = '', reason = 'invalid_credentials', ipAddress = '', userAgent = '' }) {
  try {
    await AuditLog.create({
      user_id: user ? user._id : null,
      actor_name: user ? user.full_name : 'Unknown',
      action: 'LOGIN_FAILED',
      module: 'AUTH',
      target_id: user ? user._id.toString() : '',
      target_type: 'User',
      details: { email, reason },
      ip_address: ipAddress || '',
      user_agent: userAgent || '',
    });
  } catch (auditError) {
    console.warn('[Audit] Failed to record LOGIN_FAILED entry:', auditError.message);
  }
}

/**
 * Business logic for User login (supports Citizen, Staff, Admin)
 */
async function loginUser(email, password, ipAddress, userAgent) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    await recordFailedLogin({ email: normalizedEmail, reason: 'unknown_email', ipAddress, userAgent });
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    throw error;
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    await recordFailedLogin({ user, email: normalizedEmail, reason: 'invalid_password', ipAddress, userAgent });
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    throw error;
  }

  if (!user.is_active) {
    await recordFailedLogin({ user, email: normalizedEmail, reason: 'deactivated_account', ipAddress, userAgent });
    const error = new Error('Your account is deactivated. Please contact the administrator.');
    error.statusCode = 403;
    throw error;
  }

  user.last_login_at = new Date();
  await user.save();

  let profile = null;
  let permissions = null;

  if (user.role === ROLES.CITIZEN) {
    profile = await CitizenProfile.findOne({ user_id: user._id });
  } else if (user.role === ROLES.STAFF) {
    profile = await StaffDetail.findOne({ user_id: user._id });
    permissions = await StaffPermission.findOne({ user_id: user._id });
  }

  const token = generateToken(user);
  const refreshToken = await issueSession(user, ipAddress, userAgent);

  await AuditLog.create({
    user_id: user._id,
    actor_name: user.full_name,
    action: 'USER_LOGIN',
    module: 'AUTH',
    target_id: user._id.toString(),
    target_type: 'User',
    details: { role: user.role, email: user.email },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  return {
    access_token: token,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    user: user.toJSON(),
    profile,
    permissions,
  };
}

/**
 * Google OAuth ID Token verification and Citizen login
 * Only permits citizen accounts, requires email_verified, leaves birthdate/gender empty
 */
async function loginWithGoogle(idToken, ipAddress, userAgent) {
  const setting = await AppSetting.findOne({ key: 'enable_google_login' });
  const isEnabled = setting && (setting.value === true || setting.value === 'true');

  if (!isEnabled) {
    const error = new Error('Google OAuth login is currently disabled by administrator.');
    error.statusCode = 403;
    throw error;
  }

  if (!idToken || typeof idToken !== 'string') {
    const error = new Error('Google ID token is required.');
    error.statusCode = 400;
    throw error;
  }

  const payload = await verifyGoogleIdToken(idToken);

  if (!payload || !payload.email) {
    const error = new Error('Invalid Google ID token payload.');
    error.statusCode = 400;
    throw error;
  }

  // Fix 2: Require email to be verified by Google
  if (payload.email_verified !== true) {
    const error = new Error('Google email address must be verified to log in.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmail = payload.email.toLowerCase().trim();
  let user = await User.findOne({
    $or: [{ google_id: payload.sub }, { email: normalizedEmail }],
  });

  let profile = null;

  if (user) {
    // Fix 2: Never log in or link staff/admin accounts through Google OAuth
    if (user.role !== ROLES.CITIZEN) {
      const error = new Error('Google OAuth is only permitted for citizen accounts. Staff and Admin must log in with email and password.');
      error.statusCode = 403;
      throw error;
    }

    if (!user.is_active) {
      const error = new Error('Your account is deactivated. Please contact the administrator.');
      error.statusCode = 403;
      throw error;
    }

    // Link Google ID if registered via standard email previously
    if (!user.google_id) {
      user.google_id = payload.sub;
    }
    user.last_login_at = new Date();
    await user.save();

    profile = await CitizenProfile.findOne({ user_id: user._id });
  } else {
    // Auto-register new citizen via Google OAuth
    const fullName = payload.name ? payload.name.trim() : 'Citizen';
    const nameParts = fullName.split(' ');
    const firstName = payload.given_name || nameParts[0] || 'Citizen';
    const lastName = payload.family_name || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Resident');

    user = await User.create({
      email: normalizedEmail,
      full_name: fullName,
      role: ROLES.CITIZEN,
      google_id: payload.sub,
      is_active: true,
      last_login_at: new Date(),
    });

    // Fix 2: Do NOT invent birthdate or gender; mark profile_complete: false
    profile = await CitizenProfile.create({
      user_id: user._id,
      first_name: firstName,
      last_name: lastName,
      birthdate: null,
      gender: '',
      profile_complete: false,
      barangay: config.jurisdiction.barangayName(),
      city: config.jurisdiction.cityMunicipality(),
      province: config.jurisdiction.province(),
    });
  }

  const token = generateToken(user);
  const refreshToken = await issueSession(user, ipAddress, userAgent);

  await AuditLog.create({
    user_id: user._id,
    actor_name: user.full_name,
    action: 'USER_LOGIN',
    module: 'AUTH',
    target_id: user._id.toString(),
    target_type: 'User',
    details: { provider: 'google', email: user.email },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  return {
    access_token: token,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    user: user.toJSON(),
    profile,
  };
}

/**
 * Creates a cryptographically secure 6-digit OTP, stores only its hash, and
 * delivers it to the account's registered email (no OTP is ever logged or returned).
 * Each call invalidates any previous unused OTP for that account.
 * @returns {Promise<{user, sentAt: Date}>} the account and time the OTP was issued
 */
async function issuePasswordResetOtp(user) {
  // Invalidate any previous unused OTP/reset authorization for this account (one-time use).
  await PasswordReset.updateMany({ user_id: user._id, used: false }, { used: true });

  // crypto.randomInt is a cryptographically secure generator; 1,000,000 possibilities.
  const otp = crypto.randomInt(100000, 1000000).toString();
  // Email-salted SHA-256: the raw OTP is never stored, logged, or returned.
  const otpHash = crypto.createHash('sha256').update(otp + ':' + user.email).digest('hex');
  const sentAt = new Date();

  await PasswordReset.create({
    user_id: user._id,
    email: user.email,
    token_hash: otpHash,
    attempts: 0,
    expires_at: new Date(sentAt.getTime() + PASSWORD_RESET.OTP_TTL_MS),
    used: false,
  });

  const safeFullName = escapeHtml(user.full_name);
  const resetPageUrl = `${config.publicAppUrl.replace(/\/$/, '')}/reset-password?email=${encodeURIComponent(user.email)}`;
  const safeResetPageUrl = escapeHtml(resetPageUrl);
  const ttlMinutes = Math.round(PASSWORD_RESET.OTP_TTL_MS / 60000);

  // Transactional mail bypasses the marketing notification toggle.
  sendMail({
    to: user.email,
    subject: `QuickFile - Password Reset Verification Code (${otp})`,
    text: `Hello ${user.full_name},\n\nYou requested a password reset for your QuickFile Barangay Portal account.\n\nYour 6-digit verification code is: ${otp}\n\nThis code will expire in ${ttlMinutes} minutes. Enter it on the password reset page to verify your identity, then you will be able to set a new password.\n\nReset page: ${resetPageUrl}\n\nIf you did not request this, please ignore this email.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
        <h2 style="color: #1e40af; margin-top: 0; font-size: 20px;">Password Reset Verification</h2>
        <p style="color: #334155; font-size: 15px;">Hello <strong>${safeFullName}</strong>,</p>
        <p style="color: #334155; font-size: 15px;">You requested to reset your password for the QuickFile Barangay Portal.</p>
        <p style="color: #334155; font-size: 15px; margin-bottom: 8px;">Your 6-digit verification code is:</p>
        <div style="background: #eff6ff; border: 2px dashed #3b82f6; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
          <span style="font-size: 38px; font-weight: 800; letter-spacing: 12px; color: #1d4ed8; font-family: monospace;">${otp}</span>
        </div>
        <p style="color: #64748b; font-size: 13px;">This code will expire in <strong>${ttlMinutes} minutes</strong>. Enter it on the reset page to verify your identity first, then you will be asked to set a new password.</p>
        <p style="color: #64748b; font-size: 13px;"><a href="${safeResetPageUrl}">Open the password reset page</a></p>
        <p style="color: #64748b; font-size: 13px;">If you did not request a password reset, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">QuickFile Barangay Document Request &amp; Management System</p>
      </div>
    `,
    isTransactional: true,
  }).catch(() => {
    // Never log the OTP -- only a generic transport warning.
    console.warn('[Mailer] Warning: Failed to send password reset email.');
  });

  // Also send via SMS when the citizen has a registered mobile number.
  (async () => {
    try {
      const citizenProfile = await CitizenProfile.findOne({ user_id: user._id });
      if (citizenProfile && citizenProfile.contact_number) {
        await sendSms({
          recipient: citizenProfile.contact_number,
          message: `QuickFile: Your password reset verification code is ${otp}. Valid for ${ttlMinutes} minutes. Do not share this code.`,
          isTransactional: true,
        });
      }
    } catch {
      // Never log the OTP. SMS is best-effort; email is authoritative.
    }
  })();

  return { user, sentAt };
}

/**
 * Sends a 6-digit OTP when the email belongs to a real active account.
 * ALWAYS returns the same generic response to prevent account enumeration; when
 * no account exists a dummy hash keeps response times comparable (no OTP is sent).
 */
async function requestPasswordReset(email, ipAddress, userAgent) {
  const normalizedEmail = (email || '').toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });
  const eligible = Boolean(user && user.is_active);

  if (eligible) {
    const { user: account } = await issuePasswordResetOtp(user);
    await AuditLog.create({
      user_id: account._id,
      actor_name: account.full_name,
      action: 'PASSWORD_RESET_REQUEST',
      module: 'AUTH',
      target_id: account._id.toString(),
      target_type: 'User',
      details: { email: account.email },
      ip_address: ipAddress || '',
      user_agent: userAgent || '',
    });
  } else {
    // Timing equalization: equivalent CPU work so an unknown email does not
    // return noticeably faster than a known one.
    await User.hashPassword(crypto.randomBytes(16).toString('hex'));
  }

  return { message: PASSWORD_RESET.GENERIC_RESPONSE };
}


/**
 * STEP 2: verify the 6-digit OTP bound to the account email.
 * On success returns a short-lived, single-use reset token. The OTP and the new
 * password are NEVER accepted in the same request. Errors are generic and never
 * reveal whether an account exists; expired codes get the dedicated expiry message.
 */
async function verifyResetOtp(resetData, ipAddress = '', userAgent = '') {
  const email = String(resetData?.email || '').toLowerCase().trim();
  const code = String(resetData?.otp || resetData?.pin || resetData?.token || '').trim();

  if (!email || !/^\d{6}$/.test(code)) {
    const err = new Error(PASSWORD_RESET.INVALID_OTP_MESSAGE);
    err.statusCode = 400;
    throw err;
  }

  const now = new Date();
  const otpHash = crypto.createHash('sha256').update(code + ':' + email).digest('hex');

  // Distinguish an expired-but-correct code from an incorrect one without
  // revealing account existence: an expired matching record gets the expiry message.
  const expiredMatch = await PasswordReset.findOne({
    email,
    token_hash: otpHash,
    used: false,
    expires_at: { $lte: now },
  });
  if (expiredMatch) {
    const err = new Error(PASSWORD_RESET.EXPIRED_OTP_MESSAGE);
    err.statusCode = 400;
    throw err;
  }

  // The active OTP is the latest unused, unexpired record for this email.
  const active = await PasswordReset.findOne({
    email,
    used: false,
    expires_at: { $gt: now },
  }).sort({ created_at: -1 });

  if (!active || (active.attempts || 0) >= PASSWORD_RESET.MAX_OTP_ATTEMPTS) {
    const err = new Error(PASSWORD_RESET.INVALID_OTP_MESSAGE);
    err.statusCode = 400;
    throw err;
  }

  if (active.token_hash !== otpHash) {
    // Atomic attempt increment; invalidate the OTP at the 5th failed attempt.
    const nextAttempts = (active.attempts || 0) + 1;
    await PasswordReset.updateOne(
      { _id: active._id, used: false },
      nextAttempts >= PASSWORD_RESET.MAX_OTP_ATTEMPTS
        ? { $set: { attempts: nextAttempts, used: true } }
        : { $set: { attempts: nextAttempts } }
    );
    const err = new Error(PASSWORD_RESET.INVALID_OTP_MESSAGE);
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findById(active.user_id);
  if (!user || !user.is_active || user.email.toLowerCase().trim() !== email) {
    const err = new Error(PASSWORD_RESET.INVALID_OTP_MESSAGE);
    err.statusCode = 400;
    throw err;
  }

  // OTP verified atomically -> issue a single-use reset token (hash stored only).
  // The OTP record stays unused until password reset consumes it; re-verifying is
  // harmless because the issued token is single-use.
  const resetToken = crypto.randomBytes(32).toString('hex');
  const verificationTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  const updated = await PasswordReset.findOneAndUpdate(
    { _id: active._id, used: false },
    {
      $set: {
        verification_token_hash: verificationTokenHash,
        verification_expires_at: new Date(now.getTime() + PASSWORD_RESET.RESET_TOKEN_TTL_MS),
      },
    },
    { new: true }
  );
  if (!updated) {
    const err = new Error(PASSWORD_RESET.INVALID_OTP_MESSAGE);
    err.statusCode = 400;
    throw err;
  }

  await AuditLog.create({
    user_id: user._id,
    actor_name: user.full_name,
    action: 'PASSWORD_RESET_OTP_VERIFIED',
    module: 'AUTH',
    target_id: user._id.toString(),
    target_type: 'User',
    details: { email: user.email },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  return {
    reset_token: resetToken,
    email: user.email,
    expires_in: Math.round(PASSWORD_RESET.RESET_TOKEN_TTL_MS / 1000),
  };
}

/**
 * Resend endpoint: enforces a 60-second cooldown (service layer) plus the
 * per-email hourly limiter (middleware), then issues a fresh OTP that
 * invalidates the previous one. Always returns the generic anti-enumeration response.
 */
async function resendResetOtp(email, ipAddress, userAgent) {
  const normalizedEmail = (email || '').toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });
  const eligible = Boolean(user && user.is_active);

  if (eligible) {
    // Cooldown is measured from the most recent send for this account regardless
    // of whether that OTP was consumed, so verification cannot bypass the cooldown.
    const latest = await PasswordReset.findOne({ user_id: user._id }).sort({ created_at: -1 });
    if (latest && Date.now() - latest.created_at.getTime() < PASSWORD_RESET.RESEND_COOLDOWN_MS) {
      const err = new Error('Please wait a moment before requesting another verification code.');
      err.statusCode = 429;
      err.retryAfterSeconds = Math.ceil(
        (PASSWORD_RESET.RESEND_COOLDOWN_MS - (Date.now() - latest.created_at.getTime())) / 1000
      );
      throw err;
    }
    const { user: account } = await issuePasswordResetOtp(user);
    await AuditLog.create({
      user_id: account._id,
      actor_name: account.full_name,
      action: 'PASSWORD_RESET_OTP_RESENT',
      module: 'AUTH',
      target_id: account._id.toString(),
      target_type: 'User',
      details: { email: account.email },
      ip_address: ipAddress || '',
      user_agent: userAgent || '',
    });
  } else {
    await User.hashPassword(crypto.randomBytes(16).toString('hex'));
  }

  return { message: PASSWORD_RESET.GENERIC_RESPONSE };
}

/**
 * Resets user password using the short-lived single-use token returned by verifyResetPin.
 * PINs are intentionally NOT accepted here -- verification must happen as its own step.
 */
async function resetPasswordWithToken(resetData, newPasswordArg, ipAddressArg, userAgentArg) {
  let email = '';
  let code = '';
  let newPassword = '';
  let ipAddress = '';
  let userAgent = '';

  if (typeof resetData === 'object' && resetData !== null) {
    email = resetData.email || '';
    code = resetData.reset_token || resetData.resetToken || '';
    newPassword = resetData.new_password || resetData.password || newPasswordArg || '';
    ipAddress = ipAddressArg || resetData.ip || '';
    userAgent = userAgentArg || resetData.userAgent || '';
  } else {
    // Legacy string form treated as the single-use token only (never a PIN).
    code = resetData || '';
    newPassword = newPasswordArg || '';
    ipAddress = ipAddressArg || '';
    userAgent = userAgentArg || '';
  }

  code = String(code || '').trim();
  newPassword = String(newPassword || '');
  const normalizedEmail = String(email || '').toLowerCase().trim();

  if (!normalizedEmail) {
    const error = new Error('Your registered email address is required to reset your password.');
    error.statusCode = 400;
    throw error;
  }

  if (!code || code.length < 32) {
    const error = new Error('A valid verification token is required. Verify your 6-digit code first.');
    error.statusCode = 400;
    throw error;
  }

  // Shared password policy: 8-72 characters plus a practical compromised-password denylist.
  const policy = validatePasswordPolicy(newPassword);
  if (!policy.valid) {
    const error = new Error(policy.message);
    error.statusCode = 400;
    throw error;
  }

  const now = new Date();
  const tokenHash = crypto.createHash('sha256').update(code).digest('hex');
  const resetRecord = await PasswordReset.findOne({
    email: normalizedEmail,
    verification_token_hash: tokenHash,
    verification_expires_at: { $gt: now },
    expires_at: { $gt: now },
    used: false,
  });

  if (!resetRecord) {
    const error = new Error('Invalid or expired verification token. Please verify your code again.');
    error.statusCode = 400;
    throw error;
  }

  // Locate user and confirm the record still belongs to this account.
  const user = await User.findById(resetRecord.user_id);
  if (!user || !user.is_active) {
    const error = new Error('User account not found or deactivated.');
    error.statusCode = 400;
    throw error;
  }
  if (user.email.toLowerCase().trim() !== normalizedEmail) {
    const error = new Error('Invalid or expired verification token.');
    error.statusCode = 400;
    throw error;
  }

  // Password change, token invalidation and audit log commit atomically.
  const passwordHash = await User.hashPassword(newPassword);
  // Revoke every refresh session as well - access tokens are invalidated by
  // password_changed_at, refresh sessions are revoked outright.
  await revokeUserSessions(user._id);
  await withTransaction(async (session) => {
    await User.updateOne(
      { _id: user._id },
      { $set: { password_hash: passwordHash, password_changed_at: new Date() } },
      { session }
    );

    // Consume every outstanding reset record for this account and clear the
    // verification token hash so the token can never be replayed.
    await PasswordReset.updateMany(
      { user_id: user._id, used: false },
      { $set: { used: true, verification_token_hash: null } },
      { session }
    );

    await AuditLog.create([{
      user_id: user._id,
      actor_name: user.full_name,
      action: 'PASSWORD_RESET',
      module: 'AUTH',
      target_id: user._id.toString(),
      target_type: 'User',
      details: { email: user.email },
      ip_address: ipAddress || '',
      user_agent: userAgent || '',
    }], { session });
  });

  return {
    message: 'Password has been reset successfully. You can now log in with your new password.',
  };
}

/**
 * Logs out user and writes to audit log
 */
async function logoutUser(user, ipAddress, userAgent, rawRefreshToken = null) {
  if (user) {
    // Revoke the current session family so the refresh cookie cannot be reused.
    await revokeFamily(rawRefreshToken);
    await AuditLog.create({
      user_id: user._id,
      actor_name: user.full_name,
      action: 'USER_LOGOUT',
      module: 'AUTH',
      target_id: user._id.toString(),
      target_type: 'User',
      details: { role: user.role, email: user.email },
      ip_address: ipAddress || '',
      user_agent: userAgent || '',
    });
  }

  return {
    message: 'User logged out successfully.',
  };
}

/**
 * Retrieves current authenticated user profile
 */
async function getUserProfile(user) {
  let profile = null;
  let permissions = null;

  if (user.role === ROLES.CITIZEN) {
    profile = await CitizenProfile.findOne({ user_id: user._id });
  } else if (user.role === ROLES.STAFF) {
    profile = await StaffDetail.findOne({ user_id: user._id });
    permissions = await StaffPermission.findOne({ user_id: user._id });
  }

  return {
    user: user.toJSON ? user.toJSON() : user,
    profile,
    permissions,
  };
}

module.exports = {
  setGoogleTokenVerifier,
  generateToken,
  registerCitizen,
  loginUser,
  loginWithGoogle,
  requestPasswordReset,
  verifyResetOtp,
  // Backwards-compatible alias for older clients that used the "PIN" naming.
  verifyResetPin: verifyResetOtp,
  resendResetOtp,
  resetPasswordWithToken,
  logoutUser,
  getUserProfile,
};
