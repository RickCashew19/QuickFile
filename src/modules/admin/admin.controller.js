const AdminService = require('./admin.service');
const DocumentService = require('../document/document.service');
const RequestService = require('../request/request.service');
const RequestModel = require('../request/request.model');
const VerificationService = require('../verification/verification.service');
const ReportService = require('../reports/report.service');

class AdminController {
  // GET: Admin Login Page (ADM-IAM-01)
  static renderLogin(req, res) {
    res.render('admin/login', {
      title: 'Barangay Administrator Login - QuickFile',
      error: req.query.error || null,
      success: req.query.success || null
    });
  }

  // POST: Admin Login Handler (ADM-IAM-01)
  static async handleLogin(req, res) {
    try {
      const { email, password } = req.body;
      const result = await AdminService.login(email, password);

      res.cookie('quickfile_token', result.token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
      req.session.user = result.admin;

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'Admin login successful', ...result });
      }

      res.redirect('/admin/dashboard');
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.render('admin/login', {
        title: 'Barangay Administrator Login - QuickFile',
        error: err.message,
        success: null,
        email: req.body.email
      });
    }
  }

  // POST / GET: Admin Logout (ADM-IAM-02)
  static logout(req, res) {
    res.clearCookie('quickfile_token');
    if (req.session) {
      req.session.destroy();
    }

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: 'Admin logged out successfully.' });
    }

    res.redirect('/admin/login?success=' + encodeURIComponent('Administrator logged out successfully.'));
  }

  // GET: Admin Portal Dashboard (ADM-DB-01 & ADM-DB-02)
  static async renderDashboard(req, res) {
    try {
      const staffList = await AdminService.getAllStaff();
      const overview = RequestModel.getOverviewStats();
      const docBreakdown = RequestModel.getDocumentTypeBreakdown();
      const recentRequests = RequestModel.findAll({ limit: 6 });
      const workloadStats = RequestModel.getStaffWorkload();

      res.render('admin/dashboard', {
        title: 'Administrator Dashboard - QuickFile',
        admin: req.user,
        staffList,
        totalStaff: staffList.length,
        activeStaff: staffList.filter(s => s.is_active === 1).length,
        deactivatedStaff: staffList.filter(s => s.is_active === 0).length,
        overview,
        docBreakdown,
        recentRequests,
        workloadStats,
        success: req.query.success || null,
        error: req.query.error || null
      });
    } catch (err) {
      res.redirect('/admin/login?error=' + encodeURIComponent(err.message));
    }
  }

  // GET: Staff & User Role Management Page (ADM-URM)
  static async renderStaffManagement(req, res) {
    try {
      const staffList = await AdminService.getAllStaff();
      res.render('admin/staff-management', {
        title: 'Staff & Role Management (ADM-URM) - QuickFile',
        admin: req.user,
        staffList,
        success: req.query.success || null,
        error: req.query.error || null
      });
    } catch (err) {
      res.redirect('/admin/dashboard?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Create Staff Account (ADM-URM-01)
  static async handleCreateStaff(req, res) {
    try {
      const newStaff = await AdminService.createStaffAccount(req.user, req.body);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(201).json({
          success: true,
          message: 'Staff account created successfully!',
          staff: newStaff
        });
      }

      res.redirect('/admin/staff-management?success=' + encodeURIComponent(`Staff account created for ${newStaff.full_name}`));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect('/admin/staff-management?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Update Staff Profile (ADM-URM-02)
  static async handleUpdateStaff(req, res) {
    try {
      const { staffId } = req.params;
      const updated = await AdminService.updateStaffAccount(req.user, staffId, req.body);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({
          success: true,
          message: 'Staff account updated successfully!',
          staff: updated
        });
      }

      res.redirect('/admin/staff-management?success=' + encodeURIComponent(`Staff account for ${updated.full_name} updated successfully.`));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect('/admin/staff-management?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Toggle Staff Status (ADM-URM-03)
  static async handleToggleStaffStatus(req, res) {
    try {
      const { staffId } = req.params;
      const result = await AdminService.toggleStaffStatus(req.user, staffId);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({
          success: true,
          message: result.message,
          staff: result.staff
        });
      }

      res.redirect('/admin/staff-management?success=' + encodeURIComponent(result.message));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect('/admin/staff-management?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Access Control Management (ADM-URM-04)
  static async handleUpdateAccessControl(req, res) {
    try {
      const { staffId } = req.params;
      const permissions = {
        can_review_requests: req.body.can_review_requests === '1' || req.body.can_review_requests === true || req.body.can_review_requests === 'on',
        can_prepare_documents: req.body.can_prepare_documents === '1' || req.body.can_prepare_documents === true || req.body.can_prepare_documents === 'on',
        can_print_documents: req.body.can_print_documents === '1' || req.body.can_print_documents === true || req.body.can_print_documents === 'on',
        can_release_documents: req.body.can_release_documents === '1' || req.body.can_release_documents === true || req.body.can_release_documents === 'on',
        can_verify_qr: req.body.can_verify_qr === '1' || req.body.can_verify_qr === true || req.body.can_verify_qr === 'on',
        can_view_reports: req.body.can_view_reports === '1' || req.body.can_view_reports === true || req.body.can_view_reports === 'on',
        can_archive_records: req.body.can_archive_records === '1' || req.body.can_archive_records === true || req.body.can_archive_records === 'on'
      };

      const updated = await AdminService.updateStaffAccessControl(req.user, staffId, permissions);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({
          success: true,
          message: `Permissions updated for ${updated.full_name}`,
          staff: updated
        });
      }

      res.redirect('/admin/staff-management?success=' + encodeURIComponent(`Access permissions for ${updated.full_name} updated successfully.`));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect('/admin/staff-management?error=' + encodeURIComponent(err.message));
    }
  }

  // GET: Document Type & Requirement Management Console (ADM-DTM)
  static renderDocumentTypes(req, res) {
    try {
      const docTypes = DocumentService.getAllDocumentTypes();
      res.render('admin/document-types', {
        title: 'Document Types Management (ADM-DTM) - QuickFile',
        docTypes,
        success: req.query.success || null,
        error: req.query.error || null
      });
    } catch (err) {
      res.redirect('/admin/dashboard?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Create Document Type (ADM-DTM-01)
  static handleCreateDocumentType(req, res) {
    try {
      const created = DocumentService.createDocumentType(req.user, req.body);
      res.redirect('/admin/document-types?success=' + encodeURIComponent(`Document type "${created.name}" created successfully!`));
    } catch (err) {
      res.redirect('/admin/document-types?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Update Document Type (ADM-DTM-02)
  static handleUpdateDocumentType(req, res) {
    try {
      const { id } = req.params;
      const data = {
        name: req.body.name,
        description: req.body.description,
        fee: req.body.fee,
        processingDays: req.body.processingDays,
        requirementsText: req.body.requirementsText,
        isActive: req.body.isActive === '1' || req.body.isActive === 'on' || req.body.isActive === true
      };
      const updated = DocumentService.updateDocumentType(req.user, Number(id), data);
      res.redirect('/admin/document-types?success=' + encodeURIComponent(`Document type "${updated.name}" updated successfully!`));
    } catch (err) {
      res.redirect('/admin/document-types?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Delete Document Type (ADM-DTM-03)
  static handleDeleteDocumentType(req, res) {
    try {
      const { id } = req.params;
      DocumentService.deleteDocumentType(req.user, Number(id));
      res.redirect('/admin/document-types?success=' + encodeURIComponent('Document type removed successfully.'));
    } catch (err) {
      res.redirect('/admin/document-types?error=' + encodeURIComponent(err.message));
    }
  }

  // GET: Transaction Monitoring & Reporting Ledger (ADM-TR-01 & ADM-TR-02)
  static renderReports(req, res) {
    try {
      const startDate = req.query.startDate || '';
      const endDate = req.query.endDate || '';
      const status = req.query.status || '';
      const documentTypeId = req.query.documentTypeId ? Number(req.query.documentTypeId) : null;

      const reportData = ReportService.getTransactionReport({ startDate, endDate, status, documentTypeId });
      const docBreakdown = RequestModel.getDocumentTypeBreakdown();
      const workloadStats = RequestModel.getStaffWorkload();
      const documentTypes = DocumentService.getAllDocumentTypes();

      res.render('admin/reports', {
        title: 'Transaction Reporting & Analytics (ADM-TR) - QuickFile',
        reportData,
        docBreakdown,
        workloadStats,
        documentTypes,
        filter: { startDate, endDate, status, documentTypeId }
      });
    } catch (err) {
      res.redirect('/admin/dashboard?error=' + encodeURIComponent(err.message));
    }
  }

  // GET: Centralized Records Search & Historical Retrieval (ADM-CRS-01 & ADM-CRS-02)
  static renderRecords(req, res) {
    try {
      const search = req.query.search || '';
      const records = RequestService.getHistoricalSearch(search);

      res.render('admin/records-search', {
        title: 'Centralized Records Search (ADM-CRS) - QuickFile',
        records,
        searchQuery: search
      });
    } catch (err) {
      res.redirect('/admin/dashboard?error=' + encodeURIComponent(err.message));
    }
  }

  // GET: Issued Document Verification & Monitoring (ADM-IDV-01 & ADM-IDV-02)
  static renderIssuedDocuments(req, res) {
    try {
      const search = req.query.search || '';
      const issuedDocs = VerificationService.getAllIssued({ search });

      res.render('admin/issued-documents', {
        title: 'Issued Document Verification & Monitoring (ADM-IDV) - QuickFile',
        issuedDocs,
        searchQuery: search,
        success: req.query.success || null,
        error: req.query.error || null
      });
    } catch (err) {
      res.redirect('/admin/dashboard?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Revoke Document (ADM-IDV-01)
  static handleRevokeDocument(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      VerificationService.revokeDocument(req.user, Number(id), reason);
      res.redirect('/admin/issued-documents?success=' + encodeURIComponent('Document validity has been officially REVOKED.'));
    } catch (err) {
      res.redirect('/admin/issued-documents?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Reinstate Document (ADM-IDV-01)
  static handleReinstateDocument(req, res) {
    try {
      const { id } = req.params;
      VerificationService.reinstateDocument(req.user, Number(id));
      res.redirect('/admin/issued-documents?success=' + encodeURIComponent('Document validity has been REINSTATED.'));
    } catch (err) {
      res.redirect('/admin/issued-documents?error=' + encodeURIComponent(err.message));
    }
  }

  // GET: System Activity & Records Oversight / Audit Logs (ADM-SAO-01 & ADM-SAO-02)
  static renderAuditLogs(req, res) {
    try {
      const action = req.query.action || null;
      const logs = ReportService.getAuditLogs({ action, limit: 100 });

      res.render('admin/audit-logs', {
        title: 'System Activity & Records Oversight (ADM-SAO) - QuickFile',
        logs,
        selectedAction: action
      });
    } catch (err) {
      res.redirect('/admin/dashboard?error=' + encodeURIComponent(err.message));
    }
  }
}

module.exports = AdminController;
