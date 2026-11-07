const express = require('express');
const router = express.Router();
const adminController = require('./admin.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/role.middleware');
const { validateObjectIdParam } = require('../../middleware/validateObjectId.middleware');
const { userApiLimiter, pollingLimiter } = require('../../middleware/rateLimiter.middleware');
const { ROLES } = require('../../config/constants');

// Guard: All admin routes require authentication and ADMIN role
router.use(authenticate, requireRole([ROLES.ADMIN]));

// 1. Live Stats (Polling route: uses pollingLimiter ONLY)
router.get('/live-stats', pollingLimiter, adminController.getLiveStats);

// All remaining admin routes use standard userApiLimiter
router.use(userApiLimiter);

// 2. Dashboard
router.get('/dashboard', adminController.getDashboard);

// 3. Staff Management
router.get('/staff', adminController.listStaff);
router.get('/staff/:id', validateObjectIdParam('id'), adminController.getStaffById);
router.post('/staff', adminController.createStaff);
router.put('/staff/:id', validateObjectIdParam('id'), adminController.updateStaff);
router.patch('/staff/:id/status', validateObjectIdParam('id'), adminController.updateStaffStatus);
router.put('/staff/:id/permissions', validateObjectIdParam('id'), adminController.updateStaffPermissions);
router.post('/staff/:id/reset-password', validateObjectIdParam('id'), adminController.resetStaffPassword);
router.delete('/staff/:id', validateObjectIdParam('id'), adminController.deleteStaff);

// 4. Citizens Management
router.get('/citizens', adminController.listCitizens);
router.patch('/citizens/:id/status', validateObjectIdParam('id'), adminController.updateCitizenStatus);
router.delete('/citizens/:id', validateObjectIdParam('id'), adminController.deleteCitizen);

// 5. Records & Requests Management
router.get('/records', adminController.listRecords);
router.get('/requests/:id', validateObjectIdParam('id'), adminController.getRequestDetails);
router.delete('/requests/:id', validateObjectIdParam('id'), adminController.deleteRequest);

// 6. Issued Documents
router.get('/issued-documents', adminController.listIssuedDocuments);
router.post('/issued-documents/:id/revoke', validateObjectIdParam('id'), adminController.revokeIssuedDocument);
router.post('/issued-documents/:id/reinstate', validateObjectIdParam('id'), adminController.reinstateIssuedDocument);
router.delete('/issued-documents/:id', validateObjectIdParam('id'), adminController.deleteIssuedDocument);

// 7. Audit Logs (Read-only)
router.get('/audit-logs', adminController.listAuditLogs);

// 8. Reports
router.get('/reports', adminController.getReports);

module.exports = router;
