const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { config } = require('../config');
const { ROLES } = require('../config/constants');
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
 * Sends a password reset email with a 6-digit PIN code
 * Prevents timing attacks and account enumeration by not awaiting the email send
 */
async function requestPasswordReset(email, ipAddress, userAgent) {
  const normalizedEmail = (email || '').toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  if (user && user.is_active) {
    // 1. Invalidate previous unused reset tokens for this user
    await PasswordReset.updateMany({ user_id: user._id, used: false }, { used: true });

    // 2. Generate a 6-digit numeric verification PIN code (1,000,000 possibilities)
    const pin = crypto.randomInt(100000, 1000000).toString();
    const tokenHash = crypto.createHash('sha256').update(pin + ':' + user.email).digest('hex');

    // 3. Store hash with 15-minute expiration and 0 initial attempts
    await PasswordReset.create({
      user_id: user._id,
      email: user.email,
      token_hash: tokenHash,
      attempts: 0,
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
      used: false,
    });

    const safeFullName = escapeHtml(user.full_name);
    const resetPageUrl = `${config.publicAppUrl.replace(/\/$/, '')}/reset-password?email=${encodeURIComponent(user.email)}`;
    const safeResetPageUrl = escapeHtml(resetPageUrl);

    // 4. Send email with 6-digit PIN code via SMTP (isTransactional: true guarantees send even if general notifications are toggled off)
    sendMail({
      to: user.email,
      subject: `QuickFile - Password Reset PIN Code (${pin})`,
      text: `Hello ${user.full_name},\n\nYou requested a password reset for your QuickFile Barangay Portal account.\n\nYour 6-digit verification PIN code is: ${pin}\n\nThis code will expire in 15 minutes. Enter this code on the password reset page along with your new password.\n\nReset page: ${resetPageUrl}\n\nIf you did not request this, please ignore this email.`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
          <h2 style="color: #1e40af; margin-top: 0; font-size: 20px;">Password Reset Verification</h2>
          <p style="color: #334155; font-size: 15px;">Hello <strong>${safeFullName}</strong>,</p>
          <p style="color: #334155; font-size: 15px;">You requested to reset your password for the QuickFile Barangay Portal.</p>
          <p style="color: #334155; font-size: 15px; margin-bottom: 8px;">Your 6-digit verification PIN code is:</p>
          <div style="background: #eff6ff; border: 2px dashed #3b82f6; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
            <span style="font-size: 38px; font-weight: 800; letter-spacing: 12px; color: #1d4ed8; font-family: monospace;">${pin}</span>
          </div>
          <p style="color: #64748b; font-size: 13px;">This code will expire in <strong>15 minutes</strong>. Enter this 6-digit code on the reset page along with your new password.</p>
          <p style="color: #64748b; font-size: 13px;"><a href="${safeResetPageUrl}">Open the password reset page</a></p>
          <p style="color: #64748b; font-size: 13px;">If you did not request a password reset, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">QuickFile Barangay Document Request & Management System</p>
        </div>
      `,
      isTransactional: true,
    }).catch((err) => {
      console.warn(`[Mailer] Warning: Failed to send password reset email to ${user.email}:`, err.message);
    });

    // 5. Also send 6-digit PIN via SMS if citizen has registered mobile number
    (async () => {
      try {
        const citizenProfile = await CitizenProfile.findOne({ user_id: user._id });
        if (citizenProfile && citizenProfile.contact_number) {
          await sendSms({
            recipient: citizenProfile.contact_number,
            message: `QuickFile: Your password reset PIN code is ${pin}. Valid for 15 minutes. Do not share this code.`,
            isTransactional: true,
          });
        }
      } catch (smsErr) {
        console.warn(`[SMS] Failed to send reset SMS to ${user.email}:`, smsErr.message);
      }
    })();

    await AuditLog.create({
      user_id: user._id,
      actor_name: user.full_name,
      action: 'PASSWORD_RESET_REQUEST',
      module: 'AUTH',
      target_id: user._id.toString(),
      target_type: 'User',
      details: { email: user.email },
      ip_address: ipAddress || '',
      user_agent: userAgent || '',
    });
  }

  // Generic message prevents account enumeration
  return {
    message: 'If the email address is registered, instructions and your 6-digit verification PIN code have been sent.',
  };
}

/**
 * Resets user password using a verified 6-digit PIN bound to the account email
 */
async function resetPasswordWithToken(resetData, newPasswordArg, ipAddressArg, userAgentArg) {
  let email = '';
  let code = '';
  let newPassword = '';
  let ipAddress = '';
  let userAgent = '';

  if (typeof resetData === 'object' && resetData !== null) {
    email = resetData.email || '';
    code = resetData.pin || resetData.token || '';
    newPassword = resetData.new_password || resetData.password || newPasswordArg || '';
    ipAddress = ipAddressArg || resetData.ip || '';
    userAgent = userAgentArg || resetData.userAgent || '';
  } else {
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

  // Only account-bound 6-digit PINs are accepted. Unsalted/raw token lookups were
  // removed because they allowed cross-account resets and bypassed attempt tracking.
  if (!/^\d{6}$/.test(code)) {
    const error = new Error('Verification PIN must be exactly 6 digits.');
    error.statusCode = 400;
    throw error;
  }

  if (!newPassword) {
    const error = new Error('A new password is required.');
    error.statusCode = 400;
    throw error;
  }

  if (newPassword.length < 8 || newPassword.length > 72) {
    const error = new Error('Validation error: Password must be between 8 and 72 characters.');
    error.statusCode = 400;
    throw error;
  }

  const now = new Date();
  const saltedHash = crypto.createHash('sha256').update(code + ':' + normalizedEmail).digest('hex');
  const resetRecord = await PasswordReset.findOne({
    email: normalizedEmail,
    token_hash: saltedHash,
    used: false,
    expires_at: { $gt: now },
  });

  if (!resetRecord) {
    // Track failed attempts on the latest still-valid PIN for this email.
    const pendingRecord = await PasswordReset.findOne({
      email: normalizedEmail,
      used: false,
      expires_at: { $gt: now },
    }).sort({ created_at: -1 });

    if (pendingRecord) {
      pendingRecord.attempts = (pendingRecord.attempts || 0) + 1;
      if (pendingRecord.attempts >= 5) {
        pendingRecord.used = true;
        await pendingRecord.save();
        const err = new Error('Too many failed attempts. This PIN code has been invalidated. Please request a new code.');
        err.statusCode = 400;
        throw err;
      }
      await pendingRecord.save();
      const remaining = 5 - pendingRecord.attempts;
      const err = new Error(`Invalid 6-digit PIN code. ${remaining} attempt(s) remaining.`);
      err.statusCode = 400;
      throw err;
    }

    const error = new Error('Invalid or expired password reset PIN code.');
    error.statusCode = 400;
    throw error;
  }

  // Locate user and confirm the token still belongs to this account.
  const user = await User.findById(resetRecord.user_id);
  if (!user || !user.is_active) {
    const error = new Error('User account not found or deactivated.');
    error.statusCode = 400;
    throw error;
  }
  if (user.email.toLowerCase().trim() !== normalizedEmail) {
    const error = new Error('Invalid or expired password reset PIN code.');
    error.statusCode = 400;
    throw error;
  }

  // 4-7. Password change, token invalidation and audit log commit atomically.
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

    await PasswordReset.updateMany(
      { user_id: user._id, used: false },
      { $set: { used: true } },
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
  resetPasswordWithToken,
  logoutUser,
  getUserProfile,
};
