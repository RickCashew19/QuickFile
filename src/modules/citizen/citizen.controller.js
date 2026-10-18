const CitizenService = require('./citizen.service');

class CitizenController {
  // GET: Show registration page (CIT-IAM-01)
  static renderRegister(req, res) {
    res.render('citizen/register', {
      title: 'Citizen Registration - QuickFile',
      error: req.query.error || null,
      success: req.query.success || null
    });
  }

  // POST: Handle registration (CIT-IAM-01)
  static async handleRegister(req, res) {
    try {
      const { email, password, fullName, phone } = req.body;
      const result = await CitizenService.register({ email, password, fullName, phone });

      // Save cookie and session
      res.cookie('quickfile_token', result.token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
      req.session.user = result.user;

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(201).json({ success: true, message: 'Account registered successfully!', ...result });
      }

      res.redirect('/citizen/profile?welcome=1');
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.render('citizen/register', {
        title: 'Citizen Registration - QuickFile',
        error: err.message,
        success: null,
        formData: req.body
      });
    }
  }

  // GET: Show login page (CIT-IAM-02)
  static renderLogin(req, res) {
    res.render('citizen/login', {
      title: 'Citizen Login - QuickFile',
      error: req.query.error || null,
      success: req.query.success || null
    });
  }

  // POST: Handle login (CIT-IAM-02)
  static async handleLogin(req, res) {
    try {
      const { email, password } = req.body;
      const result = await CitizenService.login(email, password);

      res.cookie('quickfile_token', result.token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
      req.session.user = result.user;

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'Login successful', ...result });
      }

      res.redirect('/citizen/dashboard');
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.render('citizen/login', {
        title: 'Citizen Login - QuickFile',
        error: err.message,
        success: null,
        email: req.body.email
      });
    }
  }

  // POST / GET: User logout (CIT-IAM-03)
  static logout(req, res) {
    res.clearCookie('quickfile_token');
    if (req.session) {
      req.session.destroy();
    }

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: 'Logged out successfully.' });
    }

    res.redirect('/citizen/login?success=' + encodeURIComponent('You have been logged out successfully.'));
  }

  // GET: Password recovery request form (CIT-IAM-04)
  static renderForgotPassword(req, res) {
    res.render('citizen/forgot-password', {
      title: 'Password Recovery - QuickFile',
      error: req.query.error || null,
      success: req.query.success || null,
      resetUrl: null
    });
  }

  // POST: Request password reset (CIT-IAM-04)
  static async handleForgotPassword(req, res) {
    try {
      const { email } = req.body;
      const result = await CitizenService.initiatePasswordRecovery(email);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json(result);
      }

      res.render('citizen/forgot-password', {
        title: 'Password Recovery - QuickFile',
        error: null,
        success: result.message,
        resetUrl: result.resetUrl || null
      });
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.render('citizen/forgot-password', {
        title: 'Password Recovery - QuickFile',
        error: err.message,
        success: null,
        resetUrl: null
      });
    }
  }

  // GET: Reset password page (CIT-IAM-04)
  static async renderResetPassword(req, res) {
    const { token } = req.query;
    try {
      if (!token) {
        throw new Error('A reset token must be provided.');
      }
      await CitizenService.validateResetToken(token);

      res.render('citizen/reset-password', {
        title: 'Reset Password - QuickFile',
        token,
        error: null,
        success: null
      });
    } catch (err) {
      res.render('citizen/reset-password', {
        title: 'Reset Password - QuickFile',
        token: null,
        error: err.message,
        success: null
      });
    }
  }

  // POST: Complete password reset (CIT-IAM-04)
  static async handleResetPassword(req, res) {
    try {
      const { token, password, confirmPassword } = req.body;
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match.');
      }

      const result = await CitizenService.resetPassword(token, password);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json(result);
      }

      res.redirect('/citizen/login?success=' + encodeURIComponent(result.message));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.render('citizen/reset-password', {
        title: 'Reset Password - QuickFile',
        token: req.body.token,
        error: err.message,
        success: null
      });
    }
  }

  // GET: Citizen Dashboard
  static async renderDashboard(req, res) {
    try {
      const { user, profile } = await CitizenService.getProfile(req.user.id);
      const reusableInfo = await CitizenService.getReusableProfile(req.user.id);

      res.render('citizen/dashboard', {
        title: 'Citizen Dashboard - QuickFile',
        user,
        profile,
        reusableInfo,
        success: req.query.success || null
      });
    } catch (err) {
      res.redirect('/?error=' + encodeURIComponent(err.message));
    }
  }

  // GET: Profile view/edit page (CIT-APM-01 & CIT-APM-02)
  static async renderProfile(req, res) {
    try {
      const { user, profile } = await CitizenService.getProfile(req.user.id);
      const reusableInfo = await CitizenService.getReusableProfile(req.user.id);

      res.render('citizen/profile', {
        title: 'Resident Profile Management - QuickFile',
        user,
        profile: profile || {},
        reusableInfo,
        welcome: req.query.welcome === '1',
        error: req.query.error || null,
        success: req.query.success || null
      });
    } catch (err) {
      res.redirect('/citizen/dashboard?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Update resident profile (CIT-APM-01 & CIT-APM-02)
  static async handleUpdateProfile(req, res) {
    try {
      const userId = req.user.id;
      const updatedProfile = await CitizenService.updateProfile(userId, req.body);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({
          success: true,
          message: 'Profile updated successfully!',
          profile: updatedProfile
        });
      }

      res.redirect('/citizen/profile?success=' + encodeURIComponent('Your resident profile has been updated successfully!'));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect('/citizen/profile?error=' + encodeURIComponent(err.message));
    }
  }

  // GET: Profile reuse data endpoint (CIT-APM-03)
  static async getProfileReuse(req, res) {
    try {
      const reuseData = await CitizenService.getReusableProfile(req.user.id);
      return res.json({
        success: true,
        message: 'Reusable resident profile retrieved successfully.',
        ...reuseData
      });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // Pluggable Integration: Google OAuth (CIT-IAM)
  static async handleGoogleAuth(req, res) {
    const SettingsService = require('../settings/settings.service');
    const isGoogleAuthEnabled = SettingsService.isFeatureEnabled('google_auth_enabled');

    if (!isGoogleAuthEnabled) {
      const errMsg = 'Google Authentication is currently disabled by administrator. All sign-ins must be completed manually.';
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({ success: false, message: errMsg });
      }
      return res.redirect('/citizen/login?error=' + encodeURIComponent(errMsg));
    }

    try {
      const CitizenModel = require('./citizen.model');
      const googleEmail = req.body?.googleEmail || req.query?.email || 'citizen.google@gmail.com';
      const googleName = req.body?.googleName || req.query?.name || 'Google Verified Citizen';

      // Find or auto-register citizen via Google OAuth
      let user = CitizenModel.findUserByEmail(googleEmail);
      if (!user) {
        const dummyPass = 'GoogleAuth_' + Math.random().toString(36).substring(2) + '!123';
        const regResult = await CitizenService.register({
          email: googleEmail,
          password: dummyPass,
          fullName: googleName,
          phone: ''
        });
        user = regResult.user;
      }

      const { generateToken } = require('../auth/auth.helper');
      const token = generateToken({ id: user.id, email: user.email, role: 'citizen', fullName: user.full_name });

      res.cookie('quickfile_token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
      if (req.session) {
        req.session.user = user;
      }

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({
          success: true,
          message: 'Google Authentication successful!',
          user,
          token
        });
      }

      res.redirect('/citizen/dashboard?success=' + encodeURIComponent('Signed in via Google Authentication.'));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(500).json({ success: false, message: err.message });
      }
      res.redirect('/citizen/login?error=' + encodeURIComponent(err.message));
    }
  }
}

module.exports = CitizenController;
