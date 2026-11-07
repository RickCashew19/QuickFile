const jwt = require('jsonwebtoken');
const { config } = require('../../config');
const { ROLES } = require('../../config/constants');
const {
  User,
  CitizenProfile,
  StaffDetail,
  StaffPermission,
  AuditLog,
} = require('../../models');

function generateToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    },
    config.jwt.secret,
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

  const primaryPhone = (phone || contact_number || '').trim();

  // 1. Create User
  const newUser = await User.create({
    email: normalizedEmail,
    password_hash: passwordHash,
    full_name: fullName,
    phone: primaryPhone,
    role: ROLES.CITIZEN,
    is_active: true,
  });

  // 2. Create Citizen Profile (Requirement 5: default jurisdiction from config)
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
    emergency_contact_number: (emergency_contact_number || '').trim(),
  });

  // 3. Issue Token
  const token = generateToken(newUser);

  // 4. Append-Only Audit Log (Requirement 4: actor_name and target_type)
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
 * Business logic for User login
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

  // Requirement 4: actor_name & target_type in AuditLog
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
 * Business logic to retrieve authenticated profile
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
  registerCitizen,
  loginUser,
  getUserProfile,
};
