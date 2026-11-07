const express = require('express');
const router = express.Router();
const staffController = require('./staff.controller');
const { verifyController } = require('../verify/verify.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/permission.middleware');
const { userApiLimiter, pollingLimiter } = require('../../middleware/rateLimiter.middleware');
const { upload } = require('../../utils/fileUpload');
const { sanitizeNoSql } = require('../../middleware/sanitizeNoSql.middleware');
const { ROLES } = require('../../config/constants');

// Base guards: Staff or Admin role only
router.use(authenticate, authorize(ROLES.STAFF, ROLES.ADMIN), userApiLimiter);

// Dashboard & Live Metrics
router.get('/dashboard', staffController.getDashboard);
router.get('/requests/live-stats', pollingLimiter, staffController.getLiveStats);

// Request Lists & Records
router.get('/requests', staffController.listRequests);
router.get('/records', staffController.listRecords);

// Resident Search & Walk-In Submission
router.get('/residents', staffController.searchResidents);
router.post(
  '/requests/walk-in',
  upload.array('attachments', 3),
  sanitizeNoSql,
  staffController.createWalkIn
);

// Reports (Guarded by can_view_reports)
router.get('/reports', requirePermission('can_view_reports'), staffController.getReports);

// Staff QR Verification Scan (Guarded by can_verify_qr)
router.get('/verify/:code', requirePermission('can_verify_qr'), verifyController.staffVerify);

// Single Request Details & Notes
router.get('/requests/:id', staffController.getRequest);
router.post('/requests/:id/notes', staffController.appendNotes);

// Workflow Status Transitions
router.post(
  '/requests/:id/review',
  requirePermission('can_review_requests'),
  staffController.reviewRequest
);
router.post(
  '/requests/:id/approve',
  requirePermission('can_review_requests'),
  staffController.approveRequest
);
router.post(
  '/requests/:id/reject',
  requirePermission('can_review_requests'),
  staffController.rejectRequest
);
router.post(
  '/requests/:id/prepare',
  requirePermission('can_prepare_documents'),
  staffController.prepareRequest
);
router.post(
  '/requests/:id/issue',
  requirePermission('can_prepare_documents'),
  staffController.issueRequest
);
router.get(
  '/requests/:id/print-data',
  requirePermission('can_print_documents'),
  staffController.getPrintData
);
router.post(
  '/requests/:id/release',
  requirePermission('can_release_documents'),
  staffController.releaseRequest
);
router.post(
  '/requests/:id/archive',
  requirePermission('can_archive_records'),
  staffController.archiveRequest
);

module.exports = router;
