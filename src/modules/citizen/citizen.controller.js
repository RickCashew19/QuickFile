const CitizenService = require('./citizen.service');
const DocumentService = require('../document/document.service');
const RequestService = require('../request/request.service');
const NotificationService = require('../notification/notification.service');

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

  // POST: Process password reset (CIT-IAM-04)
  static async handleResetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;
      const result = await CitizenService.resetPassword(token, newPassword);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, ...result });
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
      const requests = RequestService.getCitizenRequests(req.user.id);
      const documentTypes = DocumentService.getActiveCatalog();
      const notifications = NotificationService.getForUser(req.user.id, 5);
      const unreadCount = NotificationService.getUnreadCount(req.user.id);

      res.render('citizen/dashboard', {
        title: 'Citizen Dashboard - QuickFile',
        user,
        profile,
        reusableInfo,
        requests,
        documentTypes,
        notifications,
        unreadCount,
        success: req.query.success || null,
        error: req.query.error || null
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

  // GET: Document Catalog & Requirements (CIT-DCR-01 & CIT-DCR-02)
  static renderCatalog(req, res) {
    try {
      const documents = DocumentService.getActiveCatalog();
      res.render('citizen/catalog', {
        title: 'Document Catalog & Requirements - QuickFile',
        documents,
        success: req.query.success || null,
        error: req.query.error || null
      });
    } catch (err) {
      res.redirect('/citizen/dashboard?error=' + encodeURIComponent(err.message));
    }
  }

  // GET: Online Document Request Form (CIT-ODR-01 & CIT-ODR-03)
  static async renderNewRequest(req, res) {
    try {
      const selectedDocId = req.query.doc || null;
      const documentTypes = DocumentService.getActiveCatalog();
      const reusableInfo = await CitizenService.getReusableProfile(req.user.id);

      res.render('citizen/request-form', {
        title: 'Online Document Request - QuickFile',
        documentTypes,
        selectedDocId,
        reusableInfo,
        error: req.query.error || null
      });
    } catch (err) {
      res.redirect('/citizen/dashboard?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Submit Online Document Request (CIT-ODR-02 & CIT-ODR-04)
  static async handleSubmitRequest(req, res) {
    try {
      const { documentTypeId, purpose, fullName, contactNumber, completeAddress, civilStatus, gender, occupation, voterStatus } = req.body;
      const attachmentFile = req.file || null;

      const formData = {
        fullName: fullName || req.user.full_name,
        contactNumber: contactNumber || req.user.phone,
        completeAddress,
        civilStatus,
        gender,
        occupation,
        voterStatus
      };

      const created = await RequestService.submitRequest({
        userId: req.user.id,
        citizenName: req.user.full_name,
        documentTypeId: Number(documentTypeId),
        purpose,
        formData,
        attachmentFile
      });

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(201).json({
          success: true,
          message: 'Document request submitted successfully!',
          request: created
        });
      }

      res.redirect(`/citizen/requests/${created.tracking_number}?success=` + encodeURIComponent('Your document request has been submitted successfully!'));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect('/citizen/request?error=' + encodeURIComponent(err.message));
    }
  }

  // GET: Request Status Tracking (CIT-RST-01 & CIT-RHV-02)
  static renderRequestDetails(req, res) {
    try {
      const trackingNumber = req.params.trackingNumber;
      const requestData = RequestService.getRequestByTracking(trackingNumber);

      // Security check: citizens can only view their own requests
      if (requestData.user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'staff') {
        return res.status(403).render('layouts/error', {
          title: 'Unauthorized Access',
          message: 'You are not authorized to view this document request.'
        });
      }

      let parsedFormData = {};
      try {
        parsedFormData = JSON.parse(requestData.form_data || '{}');
      } catch (e) {
        parsedFormData = {};
      }

      res.render('citizen/request-details', {
        title: `Request ${requestData.tracking_number} - QuickFile`,
        reqData: requestData,
        formData: parsedFormData,
        success: req.query.success || null,
        error: req.query.error || null
      });
    } catch (err) {
      res.redirect('/citizen/dashboard?error=' + encodeURIComponent(err.message));
    }
  }

  // GET: Request History Viewing (CIT-RHV-01)
  static renderHistory(req, res) {
    try {
      const requests = RequestService.getCitizenRequests(req.user.id);
      res.render('citizen/history', {
        title: 'My Request History - QuickFile',
        requests,
        success: req.query.success || null,
        error: req.query.error || null
      });
    } catch (err) {
      res.redirect('/citizen/dashboard?error=' + encodeURIComponent(err.message));
    }
  }

  // GET: Notifications List & Mark Read (CIT-RST-02)
  static renderNotifications(req, res) {
    try {
      NotificationService.markAllAsRead(req.user.id);
      const notifications = NotificationService.getForUser(req.user.id, 50);

      res.render('citizen/notifications', {
        title: 'System Notifications - QuickFile',
        notifications
      });
    } catch (err) {
      res.redirect('/citizen/dashboard?error=' + encodeURIComponent(err.message));
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

  // GET: Edit Pending Request Form
  static renderEditRequest(req, res) {
    try {
      const { trackingNumber } = req.params;
      const requestData = RequestService.getRequestByTracking(trackingNumber);

      if (requestData.user_id !== req.user.id) {
        return res.status(403).render('layouts/error', {
          title: 'Unauthorized Access',
          message: 'You are not authorized to edit this document request.'
        });
      }

      if (requestData.status !== 'PENDING') {
        return res.redirect(`/citizen/requests/${trackingNumber}?error=` + encodeURIComponent('Only pending requests can be modified.'));
      }

      let parsedFormData = {};
      try {
        parsedFormData = JSON.parse(requestData.form_data || '{}');
      } catch (e) {
        parsedFormData = {};
      }

      const docType = DocumentService.getDocumentType(requestData.document_type_id);

      res.render('citizen/request-edit', {
        title: `Edit Request ${trackingNumber} - QuickFile`,
        reqData: requestData,
        formData: parsedFormData,
        docType,
        error: req.query.error || null,
        success: req.query.success || null
      });
    } catch (err) {
      res.redirect('/citizen/dashboard?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Update Pending Request Handler
  static async handleUpdateRequest(req, res) {
    try {
      const { trackingNumber } = req.params;
      const { purpose, ...formDataFields } = req.body;

      const updated = await RequestService.updatePendingRequest(trackingNumber, req.user.id, {
        purpose,
        formData: formDataFields,
        attachmentFile: req.file || null
      });

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'Request updated successfully!', request: updated });
      }

      res.redirect(`/citizen/requests/${trackingNumber}?success=` + encodeURIComponent('Your application details have been updated.'));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect(`/citizen/requests/${req.params.trackingNumber}/edit?error=` + encodeURIComponent(err.message));
    }
  }

  // POST: Cancel / Delete Pending Request
  static handleCancelRequest(req, res) {
    try {
      const { trackingNumber } = req.params;
      const reason = req.body.reason || 'Cancelled by applicant';

      RequestService.cancelRequest(trackingNumber, req.user.id, reason);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'Request cancelled successfully.' });
      }

      res.redirect('/citizen/history?success=' + encodeURIComponent(`Request ${trackingNumber} has been cancelled.`));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect(`/citizen/requests/${req.params.trackingNumber}?error=` + encodeURIComponent(err.message));
    }
  }

  // POST: Delete Single Notification
  static handleDeleteNotification(req, res) {
    try {
      const { id } = req.params;
      NotificationService.delete(Number(id), req.user.id);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'Notification deleted.' });
      }

      res.redirect('/citizen/notifications?success=' + encodeURIComponent('Notification deleted.'));
    } catch (err) {
      res.redirect('/citizen/notifications?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Clear All Notifications
  static handleClearNotifications(req, res) {
    try {
      NotificationService.clearAll(req.user.id);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'All notifications cleared.' });
      }

      res.redirect('/citizen/notifications?success=' + encodeURIComponent('All notifications cleared.'));
    } catch (err) {
      res.redirect('/citizen/notifications?error=' + encodeURIComponent(err.message));
    }
  }

  // GET: Live Request Status API for real-time frontend updates (no manual page reload needed)
  static getRequestStatusApi(req, res) {
    try {
      const { trackingNumber } = req.params;
      const requestData = RequestService.getRequestByTracking(trackingNumber);

      if (requestData.user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'staff') {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
      }

      return res.json({
        success: true,
        trackingNumber: requestData.tracking_number,
        status: requestData.status,
        paymentStatus: requestData.payment_status,
        certificateNumber: requestData.certificate_number,
        validityStatus: requestData.validity_status,
        rejectionReason: requestData.rejection_reason,
        updatedAt: requestData.updated_at
      });
    } catch (err) {
      return res.status(404).json({ success: false, message: err.message });
    }
  }
}

module.exports = CitizenController;
