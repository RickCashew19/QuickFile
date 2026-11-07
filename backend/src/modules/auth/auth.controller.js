const jwt = require('jsonwebtoken');
const config = require('../../config');
const { ROLES, USER_STATUSES } = require('../../config/constants');
const { User, CitizenProfile, StaffDetail, StaffPermission, AuditLog } = require('../../models');

// Helper to generate signed JWT
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
 * Register a new Citizen account (CIT-IAM-01)
 * POST /api/auth/register
 */
async function register(req, res, next) {
  try {
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
      contact_number,
      street_address,
      zone,
      barangay,
      city,
      province,
    } = req.body;

    // Basic validation
    if (!email || !password || !first_name || !last_name || !birthdate || !gender) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: email, password, first_name, last_name, birthdate, and gender are required.',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.',
      });
    }

    // Hash password
    const password_hash = await User.hashPassword(password);

    // Create user
    const newUser = await User.create({
      email: normalizedEmail,
      password_hash,
      role: ROLES.CITIZEN,
      status: USER_STATUSES.ACTIVE,
    });

    // Create profile
    const profile = await CitizenProfile.create({
      user_id: newUser._id,
      first_name: first_name.trim(),
      middle_name: (middle_name || '').trim(),
      last_name: last_name.trim(),
      suffix: (suffix || '').trim(),
      birthdate: new Date(birthdate),
      gender,
      civil_status: civil_status || 'single',
      contact_number: (contact_number || '').trim(),
      address: {
        street_address: (street_address || '').trim(),
        zone: (zone || '').trim(),
        barangay: (barangay || '').trim(),
        city: (city || '').trim(),
        province: (province || '').trim(),
      },
    });

    // Generate JWT token
    const token = generateToken(newUser);

    // Log to audit log (immutable)
    await AuditLog.create({
      user_id: newUser._id,
      action: 'CITIZEN_REGISTER',
      module: 'AUTH',
      target_id: newUser._id.toString(),
      details: { email: newUser.email },
      ip_address: req.ip,
      user_agent: req.get('User-Agent') || '',
    });

    return res.status(201).json({
      success: true,
      message: 'Citizen account registered successfully.',
      data: {
        token,
        user: newUser.toJSON(),
        profile,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * User Login (CIT-IAM-02, STF-IAM-01, ADM-IAM-01)
 * POST /api/auth/login
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Query user
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Check account status
    if (user.status !== USER_STATUSES.ACTIVE) {
      return res.status(403).json({
        success: false,
        message: `Your account is ${user.status}. Please contact the Barangay administrator.`,
      });
    }

    // Update last login
    user.last_login_at = new Date();
    await user.save();

    // Retrieve associated profile or details
    let profile = null;
    let permissions = null;

    if (user.role === ROLES.CITIZEN) {
      profile = await CitizenProfile.findOne({ user_id: user._id });
    } else if (user.role === ROLES.STAFF) {
      profile = await StaffDetail.findOne({ user_id: user._id });
      permissions = await StaffPermission.findOne({ user_id: user._id });
    }

    // Generate JWT
    const token = generateToken(user);

    // Record login audit
    await AuditLog.create({
      user_id: user._id,
      action: 'USER_LOGIN',
      module: 'AUTH',
      target_id: user._id.toString(),
      details: { role: user.role },
      ip_address: req.ip,
      user_agent: req.get('User-Agent') || '',
    });

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully.',
      data: {
        token,
        user: user.toJSON(),
        profile,
        permissions,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get Authenticated User Profile
 * GET /api/auth/me
 */
async function getMe(req, res, next) {
  try {
    const user = req.user;
    let profile = null;
    let permissions = null;

    if (user.role === ROLES.CITIZEN) {
      profile = await CitizenProfile.findOne({ user_id: user._id });
    } else if (user.role === ROLES.STAFF) {
      profile = await StaffDetail.findOne({ user_id: user._id });
      permissions = await StaffPermission.findOne({ user_id: user._id });
    }

    return res.status(200).json({
      success: true,
      message: 'User profile retrieved.',
      data: {
        user: user.toJSON ? user.toJSON() : user,
        profile,
        permissions,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  getMe,
};
