const express = require('express');
const router = express.Router();
const staffController = require('./staff.controller');
const { verifyController } = require('../verify/verify.controller');
const { authenticate, authorize } = require('../../middleware/auth.middleware');
const { requirePermission } = require('../../middleware/permission.middleware');
const { userApiLimiter, pollingLimiter } = require('../../middleware/rateLimiter.middleware');
const { upload } = require('../../utils/fileUpload');
const { sanitizeNoSql } = require('../../middleware/sanitizeNoSql.middleware');
const { validateObjectIdParam } = require('../../middleware/validateObjectId.middleware');
const { ROLES } = require('../../config/constants');

// Base guards: Staff or Admin role only
router.use(authenticate, authorize(ROLES.STAFF, ROLES.ADMIN));

// Item 1: Polling route registered BEFORE userApiLimiter, using ONLY pollingLimiter
router.get('/requests/live-stats', pollingLimiter, staffController.getLiveStats);

// All other staff routes use userApiLimiter (300 requests per 15 min per user)
router.use(userApiLimiter);

// Dashboard (Accessible to any authenticated staff member)
router.get('/dashboard', staffController.getDashboard);

// Item 2: Request Lists & Notes -> Guarded by can_review_requests
router.get('/requests', requirePermission('can_review_requests'), staffController.listRequests);
router.get(
  '/requests/:id',
  validateObjectIdParam('id'),
  requirePermission('can_review_requests'),
  staffController.getRequest
);
router.post(
  '/requests/:id/notes',
  validateObjectIdParam('id'),
  requirePermission('can_review_requests'),
  staffController.appendNotes
);

// Item 2: Records -> Guarded by can_archive_records
router.get('/records', requirePermission('can_archive_records'), staffController.listRecords);

// Item 2: Residents Search & Walk-In Submission -> Guarded by can_prepare_documents
router.get('/residents', requirePermission('can_prepare_documents'), staffController.searchResidents);
router.post(
  '/requests/walk-in',
  requirePermission('can_prepare_documents'),
  upload.array('attachments', 3),
  sanitizeNoSql,
  staffController.createWalkIn
);

// Reports -> Guarded by can_view_reports
router.get('/reports', requirePermission('can_view_reports'), staffController.getReports);

// Staff QR Verification Scan -> Guarded by can_verify_qr
router.get('/verify/:code', requirePermission('can_verify_qr'), verifyController.staffVerify);

// Workflow Status Transitions
router.post(
  '/requests/:id/review',
  validateObjectIdParam('id'),
  requirePermission('can_review_requests'),
  staffController.reviewRequest
);
router.post(
  '/requests/:id/approve',
  validateObjectIdParam('id'),
  requirePermission('can_review_requests'),
  staffController.approveRequest
);
router.post(
  '/requests/:id/reject',
  validateObjectIdParam('id'),
  requirePermission('can_review_requests'),
  staffController.rejectRequest
);
router.post(
  '/requests/:id/prepare',
  validateObjectIdParam('id'),
  requirePermission('can_prepare_documents'),
  staffController.prepareRequest
);
router.post(
  '/requests/:id/issue',
  validateObjectIdParam('id'),
  requirePermission('can_prepare_documents'),
  staffController.issueRequest
);
router.get(
  '/requests/:id/print-data',
  validateObjectIdParam('id'),
  requirePermission('can_print_documents'),
  staffController.getPrintData
);
router.post(
  '/requests/:id/release',
  validateObjectIdParam('id'),
  requirePermission('can_release_documents'),
  staffController.releaseRequest
);
router.post(
  '/requests/:id/archive',
  validateObjectIdParam('id'),
  requirePermission('can_archive_records'),
  staffController.archiveRequest
);

module.exports = router;
