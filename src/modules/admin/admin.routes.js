const express = require('express');
const router = express.Router();
const AdminController = require('./admin.controller');
const { authenticateUser } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/role.middleware');

// Public Admin IAM Routes
// ADM-IAM-01: Administrator Login
router.get('/login', AdminController.renderLogin);
router.post('/login', AdminController.handleLogin);

// ADM-IAM-02: Administrator Logout
router.get('/logout', AdminController.logout);
router.post('/logout', AdminController.logout);

// Protected Admin Routes (Requires admin role)
router.use(authenticateUser, requireRole(['admin']));

// Admin Dashboard
router.get('/dashboard', AdminController.renderDashboard);

// ADM-URM: Staff & User Role Management
router.get('/staff-management', AdminController.renderStaffManagement);

// ADM-URM-01: Staff Account Creation
router.post('/staff', AdminController.handleCreateStaff);

// ADM-URM-02: Staff Account Management (Edit)
router.post('/staff/:staffId/update', AdminController.handleUpdateStaff);

// ADM-URM-03: Staff Account Deactivation / Activation
router.post('/staff/:staffId/status', AdminController.handleToggleStaffStatus);

// ADM-URM-04: Access Control Management (Permissions)
router.post('/staff/:staffId/permissions', AdminController.handleUpdateAccessControl);

module.exports = router;

