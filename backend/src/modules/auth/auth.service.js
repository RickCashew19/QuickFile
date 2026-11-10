const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { config } = require('../../config');
const { ROLES } = require('../../config/constants');
const {
  User,
  CitizenProfile,
  StaffDetail,
  StaffPermission,
  PasswordReset,
  AppSetting,
  AuditLog,
} = require('../../models');
const { sendMail } = require('../../utils/mailer');
const { normalizePhilippinePhone } = require('../../utils/phoneUtil');
const { isValidEmail } = require('../../utils/emailValidator');
const { escapeHtml } = require('../../utils/escapeHtml');

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
  const fullName = [first_name.trim(), middle_name ? middle_name.trim() : '', last_name.trim(), suffix ? suffix.trim() : '']
    .filter(Boolean)
    .join(' ');

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

  // 1. Create User
  const newUser = await User.create({
    email: normalizedEmail,
    password_hash: passwordHash,
    full_name: fullName,
    phone: primaryPhone,
    role: ROLES.CITIZEN,
    is_active: true,
  });

  // 2. Create Citizen Profile (standard registration includes birthdate & gender)
  const profile = await CitizenProfile.create({
    user_id: newUser._id,
    first_name: first_name.trim(),
    middle_name: (middle_name || '').trim(),
    last_name: last_name.trim(),
    suffix: (suffix || '').trim(),
    birthdate: new Date(birthdate),
    gender,
    civil_status: civil_status || 'single',
    contact_number: primaryPhone,
    purok_zone: (purok_zone || '').trim(),
    street_address: (street_address || '').trim(),
    barangay: (barangay || config.jurisdiction.barangayName()).trim(),
    city: (city || config.jurisdiction.cityMunicipality()).trim(),
    province: (province || config.jurisdiction.province()).trim(),
    occupation: (occupation || '').trim(),
    emergency_contact_name: (emergency_contact_name || '').trim(),
    emergency_contact_number: emergencyPhone,
    profile_complete: true,
  });

  // 3. Issue Token
  const token = generateToken(newUser);

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
    token_type: 'Bearer',
    user: newUser.toJSON(),
    profile,
  };
}

/**
 * Business logic for User login (supports Citizen, Staff, Admin)
 */
async function loginUser(email, password, ipAddress, userAgent) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    throw error;
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    throw error;
  }

  if (!user.is_active) {
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
    token_type: 'Bearer',
    user: user.toJSON(),
    profile,
  };
}

/**
 * Sends a password reset email with a single-use token hash
 * Prevents timing attacks and account enumeration by not awaiting the email send
 */
async function requestPasswordReset(email, ipAddress, userAgent, clientOrigin) {
  const normalizedEmail = (email || '').toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  if (user && user.is_active) {
    // 1. Invalidate previous unused reset tokens for this user
    await PasswordReset.updateMany({ user_id: user._id, used: false }, { used: true });

    // 2. Generate cryptographically strong random token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // 3. Store hash with 15-minute expiration
    await PasswordReset.create({
      user_id: user._id,
      email: user.email,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
      used: false,
    });

    // 4. Construct reset link using resolved client origin or PUBLIC_APP_URL
    let baseUrl = config.publicAppUrl || 'http://localhost:5173';
    if (clientOrigin) {
      try {
        const parsed = new URL(clientOrigin).origin;
        const allowedOrigins = (config.frontendUrl || '')
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);

        const isDevLanOrigin =
          !config.isProduction &&
          /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(
            parsed
          );

        if (isDevLanOrigin || allowedOrigins.includes(parsed) || (!config.isProduction && (parsed.startsWith('http://') || parsed.startsWith('https://')))) {
          baseUrl = parsed;
        }
      } catch {
        // Fallback to configured baseUrl
      }
    }

    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
    const safeFullName = escapeHtml(user.full_name);
    const safeResetUrl = escapeHtml(resetUrl);

    // Fix 7: Do not await email sending so response timing does not leak user existence
    sendMail({
      to: user.email,
      subject: 'QuickFile - Password Reset Request',
      text: `Hello ${user.full_name},\n\nYou requested a password reset. Click the link below to set a new password:\n${resetUrl}\n\nThis link will expire in 15 minutes.\nIf you did not request this, please ignore this email.`,
      html: `<p>Hello <strong>${safeFullName}</strong>,</p><p>You requested a password reset. Click the button below to set a new password:</p><p><a href="${safeResetUrl}" style="background:#1d4ed8;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px;">Reset Password</a></p><p>Or copy this link: ${safeResetUrl}</p><p>This link will expire in 15 minutes.</p>`,
    }).catch((err) => {
      console.warn(`[Mailer] Warning: Failed to send password reset email to ${user.email}:`, err.message);
    });

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
    message: 'If the email address is registered, instructions to reset your password have been sent.',
  };
}

/**
 * Resets user password using verified raw token, updates password hash and password_changed_at
 */
async function resetPasswordWithToken(token, newPassword, ipAddress, userAgent) {
  if (!token || !newPassword) {
    const error = new Error('Reset token and new password are required.');
    error.statusCode = 400;
    throw error;
  }

  if (typeof token !== 'string' || typeof newPassword !== 'string') {
    const error = new Error('Validation error: Token and password must be strings.');
    error.statusCode = 400;
    throw error;
  }

  if (newPassword.length < 6 || newPassword.length > 72) {
    const error = new Error('Validation error: Password must be between 6 and 72 characters.');
    error.statusCode = 400;
    throw error;
  }

  // 1. Hash the incoming token to match database record
  const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

  // 2. Locate active, non-expired, single-use token record
  const resetRecord = await PasswordReset.findOne({
    token_hash: tokenHash,
    used: false,
    expires_at: { $gt: new Date() },
  });

  if (!resetRecord) {
    const error = new Error('Invalid or expired password reset token.');
    error.statusCode = 400;
    throw error;
  }

  // 3. Locate user
  const user = await User.findById(resetRecord.user_id);
  if (!user || !user.is_active) {
    const error = new Error('User account not found or deactivated.');
    error.statusCode = 400;
    throw error;
  }

  // 4. Update password and record password_changed_at (Fix 6)
  user.password_hash = await User.hashPassword(newPassword);
  user.password_changed_at = new Date();
  await user.save();

  // 5. Invalidate token
  resetRecord.used = true;
  await resetRecord.save();

  // 6. Record audit log
  await AuditLog.create({
    user_id: user._id,
    actor_name: user.full_name,
    action: 'PASSWORD_RESET',
    module: 'AUTH',
    target_id: user._id.toString(),
    target_type: 'User',
    details: { email: user.email },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  return {
    message: 'Password has been reset successfully. You can now log in with your new password.',
  };
}

/**
 * Logs out user and writes to audit log
 */
async function logoutUser(user, ipAddress, userAgent) {
  if (user) {
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
  registerCitizen,
  loginUser,
  loginWithGoogle,
  requestPasswordReset,
  resetPasswordWithToken,
  logoutUser,
  getUserProfile,
};
