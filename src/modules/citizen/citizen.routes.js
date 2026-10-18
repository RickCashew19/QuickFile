const express = require('express');
const router = express.Router();
const CitizenController = require('./citizen.controller');
const { authenticateUser } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/role.middleware');
const upload = require('../../middleware/upload.middleware');

// Public Citizen IAM Routes
// CIT-IAM-01: Account Registration
router.get('/register', CitizenController.renderRegister);
router.post('/register', CitizenController.handleRegister);

// CIT-IAM-02: User Login
router.get('/login', CitizenController.renderLogin);
router.post('/login', CitizenController.handleLogin);

// Pluggable Integration: Google OAuth Authentication
router.get('/auth/google', CitizenController.handleGoogleAuth);
router.post('/auth/google', CitizenController.handleGoogleAuth);

// CIT-IAM-03: User Logout
router.get('/logout', CitizenController.logout);
router.post('/logout', CitizenController.logout);

// CIT-IAM-04: Password Recovery
router.get('/forgot-password', CitizenController.renderForgotPassword);
router.post('/forgot-password', CitizenController.handleForgotPassword);
router.get('/reset-password', CitizenController.renderResetPassword);
router.post('/reset-password', CitizenController.handleResetPassword);

// Protected Citizen Routes (Requires citizen role)
router.use(authenticateUser, requireRole(['citizen']));

// Citizen Dashboard
router.get('/dashboard', CitizenController.renderDashboard);

// CIT-APM-01 & CIT-APM-02: Profile Creation and Update
router.get('/profile', CitizenController.renderProfile);
router.post('/profile', CitizenController.handleUpdateProfile);

// CIT-APM-03: Profile Reuse (Used by document request forms to pre-populate citizen information)
router.get('/profile/reuse', CitizenController.getProfileReuse);

// CIT-DCR-01 & CIT-DCR-02: Document Catalog & Requirements
router.get('/catalog', CitizenController.renderCatalog);

// CIT-ODR-01, 02, 03, 04: Online Document Request Form & Submission
router.get('/request', CitizenController.renderNewRequest);
router.post('/request', upload.single('attachment'), CitizenController.handleSubmitRequest);

// CIT-RST-01: Request Status Tracking & Document Viewing
router.get('/requests/:trackingNumber', CitizenController.renderRequestDetails);

// CIT-RHV-01: Request History Viewing
router.get('/history', CitizenController.renderHistory);

// CIT-RST-02: In-App System Notifications
router.get('/notifications', CitizenController.renderNotifications);

module.exports = router;
