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

// Staff Deletion (Permanent Removal)
router.post('/staff/:staffId/delete', AdminController.handleDeleteStaff);

// ADM-URM-04: Access Control Management (Permissions)
router.post('/staff/:staffId/permissions', AdminController.handleUpdateAccessControl);

// ADM-CUM: Citizen User Management (CRUD)
router.get('/citizens', AdminController.renderCitizens);
router.post('/citizens/:id/status', AdminController.handleToggleCitizenStatus);
router.post('/citizens/:id/delete', AdminController.handleDeleteCitizen);

// ADM-DTM: Document Type & Requirement Management
// ADM-DTM-01: Document Type Addition
// ADM-DTM-02: Document Type Modification
// ADM-DTM-03: Document Type Removal
router.get('/document-types', AdminController.renderDocumentTypes);
router.post('/document-types', AdminController.handleCreateDocumentType);
router.post('/document-types/:id/update', AdminController.handleUpdateDocumentType);
router.post('/document-types/:id/delete', AdminController.handleDeleteDocumentType);

// ADM-TR: Transaction Monitoring & Reporting
// ADM-TR-01: Transaction Report Viewing
// ADM-TR-02: Request Analytics
router.get('/reports', AdminController.renderReports);

// ADM-CRS: Centralized Records Search & Retrieval
// ADM-CRS-01: Historical Record Retrieval
// ADM-CRS-02: Issued Document Record Verification
router.get('/records', AdminController.renderRecords);
router.post('/requests/:id/delete', AdminController.handleDeleteRequest);

// ADM-IDV: Issued Document Verification & Monitoring
// ADM-IDV-01: Document Validity Confirmation
// ADM-IDV-02: Issued Document Monitoring
router.get('/issued-documents', AdminController.renderIssuedDocuments);
router.post('/issued-documents/:id/revoke', AdminController.handleRevokeDocument);
router.post('/issued-documents/:id/reinstate', AdminController.handleReinstateDocument);
router.post('/issued-documents/:id/delete', AdminController.handleDeleteIssuedDocument);

// ADM-SAO: System Activity & Records Oversight
// ADM-SAO-01: Records Oversight
// ADM-SAO-02: Transaction Accountability
router.get('/audit-logs', AdminController.renderAuditLogs);

// Live Admin Stats API
router.get('/live-stats', AdminController.getLiveStatsApi);

module.exports = router;

