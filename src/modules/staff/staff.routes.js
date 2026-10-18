const express = require('express');
const router = express.Router();
const StaffController = require('./staff.controller');
const { authenticateUser } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/role.middleware');

// Public Staff IAM Routes
// STF-IAM-01: Staff Login
router.get('/login', StaffController.renderLogin);
router.post('/login', StaffController.handleLogin);

// STF-IAM-02: Staff Logout
router.get('/logout', StaffController.logout);
router.post('/logout', StaffController.logout);

// Protected Staff Portal
router.use(authenticateUser, requireRole(['staff', 'admin']));
router.get('/dashboard', StaffController.renderDashboard);

module.exports = router;

