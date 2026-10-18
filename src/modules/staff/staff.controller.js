const StaffService = require('./staff.service');
const RequestService = require('../request/request.service');
const RequestModel = require('../request/request.model');
const DocumentService = require('../document/document.service');
const VerificationService = require('../verification/verification.service');
const ReportService = require('../reports/report.service');

class StaffController {
  // GET: Render staff login page (STF-IAM-01)
  static renderLogin(req, res) {
    res.render('staff/login', {
      title: 'Barangay Staff Login - QuickFile',
      error: req.query.error || null,
      success: req.query.success || null
    });
  }

  // POST: Process staff login (STF-IAM-01)
  static async handleLogin(req, res) {
    try {
      const { email, password } = req.body;
      const result = await StaffService.login(email, password);

      res.cookie('quickfile_token', result.token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });
      req.session.user = result.user;
      req.session.permissions = result.permissions;

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'Staff login successful', ...result });
      }

      res.redirect('/staff/dashboard');
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.render('staff/login', {
        title: 'Barangay Staff Login - QuickFile',
        error: err.message,
        success: null,
        email: req.body.email
      });
    }
  }

  // POST / GET: Process staff logout (STF-IAM-02)
  static logout(req, res) {
    res.clearCookie('quickfile_token');
    if (req.session) {
      req.session.destroy();
    }

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: 'Staff logged out successfully.' });
    }

    res.redirect('/staff/login?success=' + encodeURIComponent('Staff logged out successfully.'));
  }

  // GET: Staff Dashboard (STF-IAM & Overview)
  static async renderDashboard(req, res) {
    try {
      const { staff, permissions } = await StaffService.getStaffProfile(req.user.id);
      const overview = RequestModel.getOverviewStats();
      const recentRequests = RequestService.getStaffQueue({ limit: 6 });

      res.render('staff/dashboard', {
        title: 'Barangay Staff Portal - QuickFile',
        staff,
        permissions: permissions || {},
        overview,
        recentRequests,
        success: req.query.success || null,
        error: req.query.error || null
      });
    } catch (err) {
      res.redirect('/staff/login?error=' + encodeURIComponent(err.message));
    }
  }

  // GET: Request Viewing Queue (STF-RVP-01)
  static async renderRequestsQueue(req, res) {
    try {
      const status = req.query.status || 'ALL';
      const search = req.query.search || '';
      const documentTypeId = req.query.documentTypeId ? Number(req.query.documentTypeId) : null;

      const requests = RequestService.getStaffQueue({ status, search, documentTypeId });
      const documentTypes = DocumentService.getAllDocumentTypes();
      const { permissions } = await StaffService.getStaffProfile(req.user.id);

      res.render('staff/requests-queue', {
        title: 'Document Processing Queue - QuickFile',
        requests,
        documentTypes,
        selectedStatus: status,
        searchQuery: search,
        selectedDocType: documentTypeId,
        permissions,
        success: req.query.success || null,
        error: req.query.error || null
      });
    } catch (err) {
      res.redirect('/staff/dashboard?error=' + encodeURIComponent(err.message));
    }
  }

  // GET: Requirement Review & Request Inspection (STF-RVP-02)
  static async renderRequestDetails(req, res) {
    try {
      const requestId = Number(req.params.id);
      const reqData = RequestModel.findById(requestId);
      if (!reqData) throw new Error('Request not found.');

      let parsedFormData = {};
      try {
        parsedFormData = JSON.parse(reqData.form_data || '{}');
      } catch (e) {
        parsedFormData = {};
      }

      const { permissions } = await StaffService.getStaffProfile(req.user.id);

      res.render('staff/request-details', {
        title: `Process Request ${reqData.tracking_number} - QuickFile`,
        reqData,
        formData: parsedFormData,
        permissions,
        success: req.query.success || null,
        error: req.query.error || null
      });
    } catch (err) {
      res.redirect('/staff/requests?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Start review (STF-RVP)
  static async handleStartReview(req, res) {
    try {
      const requestId = Number(req.params.id);
      await RequestService.startReview(requestId, req.user);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'Request status updated to Under Review' });
      }
      res.redirect(`/staff/requests/${requestId}?success=` + encodeURIComponent('Request marked as Under Review.'));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect(`/staff/requests/${req.params.id}?error=` + encodeURIComponent(err.message));
    }
  }

  // POST: Request Validation / Approve (STF-RVP-03 & STF-RSM-01)
  static async handleApprove(req, res) {
    try {
      const requestId = Number(req.params.id);
      await RequestService.approveRequest(requestId, req.user);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'Request approved successfully!' });
      }
      res.redirect(`/staff/requests/${requestId}?success=` + encodeURIComponent('Request has been APPROVED successfully!'));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect(`/staff/requests/${req.params.id}?error=` + encodeURIComponent(err.message));
    }
  }

  // POST: Request Rejection (STF-RVP-04)
  static async handleReject(req, res) {
    try {
      const requestId = Number(req.params.id);
      const { reason } = req.body;
      await RequestService.rejectRequest(requestId, req.user, reason);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'Request rejected.' });
      }
      res.redirect(`/staff/requests/${requestId}?success=` + encodeURIComponent('Request has been marked as Rejected.'));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect(`/staff/requests/${req.params.id}?error=` + encodeURIComponent(err.message));
    }
  }

  // POST: Document Preparation & QR Code Generation (STF-DPP-01 & STF-QDV-02)
  static async handlePrepareDocument(req, res) {
    try {
      const requestId = Number(req.params.id);
      const host = req.get('host') || 'localhost:3000';
      const protocol = req.protocol || 'http';
      const baseUrl = `${protocol}://${host}`;

      await RequestService.prepareDocumentCertificate(requestId, req.user, baseUrl);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'Document certificate and QR code generated!' });
      }
      res.redirect(`/staff/requests/${requestId}?success=` + encodeURIComponent('Official Certificate generated with QR verification code!'));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect(`/staff/requests/${req.params.id}?error=` + encodeURIComponent(err.message));
    }
  }

  // GET: Document Printing (STF-DPP-02)
  static renderPrintDocument(req, res) {
    try {
      const requestId = Number(req.params.id);
      const reqData = RequestModel.findById(requestId);
      if (!reqData) throw new Error('Request not found.');

      let parsedFormData = {};
      try {
        parsedFormData = JSON.parse(reqData.form_data || '{}');
      } catch (e) {
        parsedFormData = {};
      }

      res.render('staff/print-document', {
        title: `Official Certificate - ${reqData.document_name}`,
        reqData,
        formData: parsedFormData,
        currentDate: new Date().toLocaleDateString('en-PH', { dateStyle: 'long' })
      });
    } catch (err) {
      res.redirect(`/staff/requests/${req.params.id}?error=` + encodeURIComponent(err.message));
    }
  }

  // POST: Document Release (STF-DPP-03)
  static handleReleaseDocument(req, res) {
    try {
      const requestId = Number(req.params.id);
      RequestService.releaseDocument(requestId, req.user, true);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'Document marked as released.' });
      }
      res.redirect(`/staff/requests/${requestId}?success=` + encodeURIComponent('Document marked as RELEASED.'));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect(`/staff/requests/${req.params.id}?error=` + encodeURIComponent(err.message));
    }
  }

  // POST: Document Archiving (STF-RA-01)
  static handleArchiveDocument(req, res) {
    try {
      const requestId = Number(req.params.id);
      RequestService.archiveDocument(requestId, req.user);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'Record archived.' });
      }
      res.redirect('/staff/records?success=' + encodeURIComponent('Record archived successfully.'));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect(`/staff/requests/${req.params.id}?error=` + encodeURIComponent(err.message));
    }
  }

  // GET: Records Retrieval & Archiving Console (STF-RA-02)
  static renderRecords(req, res) {
    try {
      const search = req.query.search || '';
      const records = RequestService.getArchivedRecords({ search });

      res.render('staff/records', {
        title: 'Archived Document Records - QuickFile',
        records,
        searchQuery: search,
        success: req.query.success || null,
        error: req.query.error || null
      });
    } catch (err) {
      res.redirect('/staff/dashboard?error=' + encodeURIComponent(err.message));
    }
  }

  // GET: Electronic Document Verification (STF-QDV-01)
  static renderVerifyPage(req, res) {
    const code = req.query.code || '';
    let result = null;
    if (code) {
      try {
        result = VerificationService.verifyDocument(code);
      } catch (err) {
        result = { isValid: false, found: false, searchedCode: code, message: err.message };
      }
    }

    res.render('staff/verify', {
      title: 'QR Code & Document Verification - QuickFile Staff',
      searchedCode: code,
      result
    });
  }

  // GET: Transaction Reporting & Workload Monitoring (STF-TR-01 & STF-TR-02)
  static renderReports(req, res) {
    try {
      const startDate = req.query.startDate || '';
      const endDate = req.query.endDate || '';
      const status = req.query.status || '';

      const reportData = ReportService.getTransactionReport({ startDate, endDate, status });
      const workloadStats = RequestModel.getStaffWorkload();
      const overview = RequestModel.getOverviewStats();

      res.render('staff/reports', {
        title: 'Transaction Reporting & Workload - QuickFile',
        reportData,
        workloadStats,
        overview,
        filter: { startDate, endDate, status }
      });
    } catch (err) {
      res.redirect('/staff/dashboard?error=' + encodeURIComponent(err.message));
    }
  }

  // GET: Walk-in Application Form (Staff filing on behalf of citizen)
  static renderWalkInForm(req, res) {
    try {
      const AdminModel = require('../admin/admin.model');
      const citizens = AdminModel.getAllCitizens();
      const documentTypes = DocumentService.getActiveCatalog();

      res.render('staff/walk-in-form', {
        title: 'File Walk-in Citizen Request - QuickFile Staff',
        citizens,
        documentTypes,
        selectedCitizenId: req.query.citizenId || '',
        error: req.query.error || null,
        success: req.query.success || null
      });
    } catch (err) {
      res.redirect('/staff/dashboard?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Create Walk-in Request
  static async handleWalkInRequest(req, res) {
    try {
      const { citizenId, documentTypeId, purpose, ...formDataFields } = req.body;

      const created = await RequestService.createWalkInRequest({
        citizenId: Number(citizenId),
        staffUser: req.user,
        documentTypeId: Number(documentTypeId),
        purpose,
        formData: formDataFields,
        attachmentFile: req.file || null
      });

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(201).json({ success: true, message: 'Walk-in request created!', request: created });
      }

      res.redirect(`/staff/requests/${created.id}?success=` + encodeURIComponent(`Walk-in request created for tracking #${created.tracking_number}`));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect('/staff/requests/walk-in?error=' + encodeURIComponent(err.message));
    }
  }

  // POST: Update Staff Remarks / Notes on Request
  static handleUpdateNotes(req, res) {
    try {
      const requestId = Number(req.params.id);
      const { notes } = req.body;

      RequestModel.updateStatus(requestId, {
        rejectionReason: notes || ''
      });

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'Processing notes updated.' });
      }

      res.redirect(`/staff/requests/${requestId}?success=` + encodeURIComponent('Notes updated.'));
    } catch (err) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.redirect(`/staff/requests/${req.params.id}?error=` + encodeURIComponent(err.message));
    }
  }

  // GET: Live Queue Statistics API for staff UI auto-refresh
  static getLiveStatsApi(req, res) {
    try {
      const overview = RequestModel.getOverviewStats();
      return res.json({
        success: true,
        totalRequests: overview.total_requests || 0,
        pendingRequests: overview.pending_requests || 0,
        underReviewRequests: overview.under_review_requests || 0,
        approvedRequests: overview.approved_requests || 0,
        readyRequests: overview.ready_requests || 0,
        releasedRequests: overview.released_requests || 0
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}

module.exports = StaffController;
