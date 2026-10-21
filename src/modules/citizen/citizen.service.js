const CitizenModel = require('./citizen.model');
const { hashPassword, comparePassword, generateToken, generateResetToken } = require('../auth/auth.helper');

class CitizenService {
  /**
   * CIT-IAM-01: Account Registration
   */
  static async register({ email, password, fullName, phone }) {
    if (!email || !password || !fullName) {
      throw new Error('Full Name, Email, and Password are required.');
    }

    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    const existingUser = CitizenModel.findUserByEmail(email);
    if (existingUser) {
      throw new Error('An account with this email already exists.');
    }

    const passwordHash = hashPassword(password);
    const userId = CitizenModel.createUser({
      email,
      passwordHash,
      fullName,
      phone
    });

    // Auto-create initial profile entry with available registration name
    const nameParts = fullName.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    CitizenModel.createProfile(userId, {
      first_name: firstName,
      last_name: lastName,
      contact_number: phone || ''
    });

    const user = CitizenModel.findUserById(userId);
    const token = generateToken({ id: user.id, email: user.email, role: user.role, fullName: user.full_name });

    return { user, token };
  }

  /**
   * CIT-IAM-02: User Login
   */
  static async login(email, password) {
    if (!email || !password) {
      throw new Error('Email and password are required.');
    }

    const user = CitizenModel.findUserByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password.');
    }

    if (!user.is_active) {
      throw new Error('Your account has been deactivated. Please contact the barangay hall.');
    }

    const isMatch = comparePassword(password, user.password_hash);
    if (!isMatch) {
      throw new Error('Invalid email or password.');
    }

    const token = generateToken({ id: user.id, email: user.email, role: user.role, fullName: user.full_name });
    const profile = CitizenModel.getProfileByUserId(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: user.full_name,
        phone: user.phone
      },
      profile,
      token
    };
  }

  /**
   * CIT-IAM-04: Password Recovery - Step 1: Request Reset
   */
  static async initiatePasswordRecovery(email) {
    if (!email) {
      throw new Error('Email is required.');
    }

    const trimmedEmail = email ? email.trim().toLowerCase() : '';
    const user = CitizenModel.findUserByEmail(trimmedEmail);
    if (!user) {
      console.log(`[Password Recovery] Requested for <${trimmedEmail}> - not found in database.`);
      // Return safe message without exposing whether user exists
      return {
        success: true,
        message: 'If that email address is registered in our system, a password reset link has been dispatched to your inbox.'
      };
    }

    const resetToken = generateResetToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiration

    CitizenModel.createPasswordReset(user.id, resetToken, expiresAt);
    const resetUrl = `/citizen/reset-password?token=${resetToken}`;

    // Dispatch real email via SMTP Mailer
    const Mailer = require('../../utils/mailer');
    const mailResult = await Mailer.sendPasswordResetEmail(user.email, resetUrl, user.full_name);
    console.log(`[Password Recovery Mail Result] To: ${user.email} ->`, mailResult);

    return {
      success: true,
      token: resetToken,
      resetUrl,
      message: `A password reset link has been dispatched to ${user.email}. Please check your inbox and spam folder.`
    };
  }

  /**
   * CIT-IAM-04: Password Recovery - Step 2: Validate Reset Token
   */
  static async validateResetToken(token) {
    if (!token) {
      throw new Error('Reset token is required.');
    }

    const record = CitizenModel.findValidPasswordReset(token);
    if (!record) {
      throw new Error('Invalid or expired password reset link.');
    }

    return record;
  }

  /**
   * CIT-IAM-04: Password Recovery - Step 3: Complete Reset
   */
  static async resetPassword(token, newPassword) {
    if (!token || !newPassword) {
      throw new Error('Reset token and new password are required.');
    }

    if (newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    const record = await this.validateResetToken(token);
    const passwordHash = hashPassword(newPassword);

    CitizenModel.updatePassword(record.user_id, passwordHash);
    CitizenModel.markPasswordResetUsed(token);

    return {
      success: true,
      message: 'Password reset successfully. You may now log in with your new password.'
    };
  }

  /**
   * CIT-APM-01: Profile Creation
   */
  static async createProfile(userId, profileData) {
    return CitizenModel.createProfile(userId, profileData);
  }

  /**
   * CIT-APM-02: Profile Update
   */
  static async updateProfile(userId, profileData) {
    return CitizenModel.updateProfile(userId, profileData);
  }

  /**
   * CIT-APM-03: Profile Reuse
   * Formats and returns stored profile information ready to prefill document requests
   */
  static async getReusableProfile(userId) {
    const user = CitizenModel.findUserById(userId);
    if (!user) {
      throw new Error('User not found.');
    }

    const profile = CitizenModel.getProfileByUserId(userId) || {};

    // Calculate full formal name
    const middleInitial = profile.middle_name ? `${profile.middle_name.trim().charAt(0)}.` : '';
    const formattedFullName = [
      profile.first_name,
      middleInitial,
      profile.last_name,
      profile.suffix
    ].filter(Boolean).join(' ') || user.full_name;

    // Full address
    const formattedAddress = [
      profile.street_address,
      profile.purok_zone,
      'Barangay Central'
    ].filter(Boolean).join(', ');

    // Calculate profile completeness percentage
    const essentialFields = [
      profile.first_name,
      profile.last_name,
      profile.birthdate,
      profile.gender,
      profile.civil_status,
      profile.purok_zone,
      profile.street_address,
      profile.contact_number
    ];
    const filledCount = essentialFields.filter(f => f && f.toString().trim() !== '').length;
    const completenessPercentage = Math.round((filledCount / essentialFields.length) * 100);

    return {
      reusableData: {
        userId: user.id,
        email: user.email,
        fullName: formattedFullName,
        firstName: profile.first_name || '',
        middleName: profile.middle_name || '',
        lastName: profile.last_name || '',
        suffix: profile.suffix || '',
        birthdate: profile.birthdate || '',
        gender: profile.gender || '',
        civilStatus: profile.civil_status || '',
        purokZone: profile.purok_zone || '',
        streetAddress: profile.street_address || '',
        completeAddress: formattedAddress,
        contactNumber: profile.contact_number || user.phone || '',
        occupation: profile.occupation || '',
        voterStatus: profile.voter_status || 'Unregistered',
        emergencyContactName: profile.emergency_contact_name || '',
        emergencyContactNumber: profile.emergency_contact_number || ''
      },
      completenessPercentage,
      isReadyForDocumentRequest: completenessPercentage >= 75
    };
  }

  static async getProfile(userId) {
    const user = CitizenModel.findUserById(userId);
    const profile = CitizenModel.getProfileByUserId(userId);
    return { user, profile };
  }
}

module.exports = CitizenService;
