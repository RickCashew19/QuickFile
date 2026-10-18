const express = require('express');
const router = express.Router();
const StaffController = require('./staff.controller');
const { authenticateUser } = require('../../middleware/auth.middleware');
const { requireRole } = require('../../middleware/role.middleware');
const { requirePermission } = require('../../middleware/permission.middleware');

// Public Staff IAM Routes
// STF-IAM-01: Staff Login
router.get('/login', StaffController.renderLogin);
router.post('/login', StaffController.handleLogin);

// STF-IAM-02: Staff Logout
router.get('/logout', StaffController.logout);
router.post('/logout', StaffController.logout);

// Protected Staff Portal
router.use(authenticateUser, requireRole(['staff', 'admin']));

// Staff Dashboard
router.get('/dashboard', StaffController.renderDashboard);

// STF-RVP-01: Request Viewing Queue
router.get('/requests', requirePermission('can_review_requests'), StaffController.renderRequestsQueue);

// STF-RVP-02: Requirement Review & Inspection
router.get('/requests/:id', requirePermission('can_review_requests'), StaffController.renderRequestDetails);

// STF-RVP-02 & STF-RSM-01: Under Review Status
router.post('/requests/:id/review', requirePermission('can_review_requests'), StaffController.handleStartReview);

// STF-RVP-03 & STF-RSM-01: Request Validation / Approval
router.post('/requests/:id/approve', requirePermission('can_review_requests'), StaffController.handleApprove);

// STF-RVP-04: Request Rejection
router.post('/requests/:id/reject', requirePermission('can_review_requests'), StaffController.handleReject);

// STF-DPP-01 & STF-QDV-02: Document Preparation & QR Code Generation
router.post('/requests/:id/prepare', requirePermission('can_prepare_documents'), StaffController.handlePrepareDocument);

// STF-DPP-02: Document Printing View
router.get('/requests/:id/print', requirePermission('can_print_documents'), StaffController.renderPrintDocument);

// STF-DPP-03: Document Release
router.post('/requests/:id/release', requirePermission('can_release_documents'), StaffController.handleReleaseDocument);

// STF-RA-01: Document Archiving
router.post('/requests/:id/archive', requirePermission('can_archive_records'), StaffController.handleArchiveDocument);

// STF-RA-02: Records Retrieval Console
router.get('/records', requirePermission('can_archive_records'), StaffController.renderRecords);

// STF-QDV-01: Electronic Document Verification Console
router.get('/verify', requirePermission('can_verify_qr'), StaffController.renderVerifyPage);

// STF-TR-01 & STF-TR-02: Transaction Reporting & Workload Monitoring
router.get('/reports', requirePermission('can_view_reports'), StaffController.renderReports);

module.exports = router;
