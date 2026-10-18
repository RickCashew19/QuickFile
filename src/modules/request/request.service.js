const QRCode = require('qrcode');
const RequestModel = require('./request.model');
const DocumentModel = require('../document/document.model');
const NotificationService = require('../notification/notification.service');
const AdminModel = require('../admin/admin.model');

class RequestService {
  static generateTrackingNumber() {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `QF-${dateStr}-${rand}`;
  }

  static generateCertificateNumber() {
    const year = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `CERT-${year}-${rand}`;
  }

  static generateVerificationCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'QF-VER-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  static async submitRequest({ userId, citizenName, documentTypeId, purpose, formData, attachmentFile }) {
    if (!documentTypeId) {
      throw new Error('Please select a valid document type.');
    }
    if (!purpose || purpose.trim() === '') {
      throw new Error('Please provide the purpose for this document request.');
    }

    const docType = DocumentModel.findById(documentTypeId);
    if (!docType || !docType.is_active) {
      throw new Error('The selected document type is currently unavailable.');
    }

    const trackingNumber = this.generateTrackingNumber();

    let attachmentPath = null;
    let attachmentName = null;
    if (attachmentFile) {
      attachmentPath = `/uploads/${attachmentFile.filename}`;
      attachmentName = attachmentFile.originalname;
    }

    const created = RequestModel.create({
      trackingNumber,
      userId,
      documentTypeId,
      purpose: purpose.trim(),
      formData: typeof formData === 'string' ? formData : JSON.stringify(formData || {}),
      attachmentPath,
      attachmentName,
      fee: docType.fee,
      paymentStatus: docType.fee === 0 ? 'WAIVED' : 'UNPAID'
    });

    // Notify citizen (CIT-RST-02)
    NotificationService.send(
      userId,
      'Document Request Submitted',
      `Your request for ${docType.name} (Tracking: ${trackingNumber}) has been submitted and is pending review.`,
      `/citizen/requests/${trackingNumber}`
    );

    // Audit log
    AdminModel.logAudit(
      userId,
      citizenName || 'Citizen User',
      'SUBMIT_REQUEST',
      'document_requests',
      created.id,
      `Submitted request for ${docType.name} (Tracking: ${trackingNumber})`
    );

    return created;
  }

  static startReview(requestId, staffUser) {
    const req = RequestModel.findById(requestId);
    if (!req) throw new Error('Request not found.');

    const updated = RequestModel.updateStatus(requestId, {
      status: 'UNDER_REVIEW',
      reviewedBy: staffUser.id
    });

    NotificationService.send(
      req.user_id,
      'Request Under Review',
      `Your request for ${req.document_name} (${req.tracking_number}) is currently being reviewed by barangay personnel.`,
      `/citizen/requests/${req.tracking_number}`
    );

    AdminModel.logAudit(
      staffUser.id,
      staffUser.full_name || staffUser.fullName,
      'REVIEW_REQUEST',
      'document_requests',
      requestId,
      `Marked request ${req.tracking_number} as Under Review`
    );

    return updated;
  }

  static approveRequest(requestId, staffUser) {
    const req = RequestModel.findById(requestId);
    if (!req) throw new Error('Request not found.');

    const updated = RequestModel.updateStatus(requestId, {
      status: 'APPROVED',
      reviewedBy: staffUser.id
    });

    NotificationService.send(
      req.user_id,
      'Request Approved',
      `Great news! Your request for ${req.document_name} (${req.tracking_number}) has been approved and is queued for certificate preparation.`,
      `/citizen/requests/${req.tracking_number}`
    );

    AdminModel.logAudit(
      staffUser.id,
      staffUser.full_name || staffUser.fullName,
      'APPROVE_REQUEST',
      'document_requests',
      requestId,
      `Approved request ${req.tracking_number}`
    );

    return updated;
  }

  static rejectRequest(requestId, staffUser, reason) {
    if (!reason || reason.trim() === '') {
      throw new Error('A rejection reason or note is required for the citizen.');
    }

    const req = RequestModel.findById(requestId);
    if (!req) throw new Error('Request not found.');

    const updated = RequestModel.updateStatus(requestId, {
      status: 'REJECTED',
      rejectionReason: reason.trim(),
      reviewedBy: staffUser.id
    });

    NotificationService.send(
      req.user_id,
      'Request Needs Attention / Rejected',
      `Your request for ${req.document_name} (${req.tracking_number}) could not be processed. Reason: ${reason.trim()}`,
      `/citizen/requests/${req.tracking_number}`
    );

    AdminModel.logAudit(
      staffUser.id,
      staffUser.full_name || staffUser.fullName,
      'REJECT_REQUEST',
      'document_requests',
      requestId,
      `Rejected request ${req.tracking_number}. Reason: ${reason.trim()}`
    );

    return updated;
  }

  static async prepareDocumentCertificate(requestId, staffUser, baseUrl = 'http://localhost:3000') {
    const req = RequestModel.findById(requestId);
    if (!req) throw new Error('Request not found.');

    let certNumber = req.certificate_number;
    let verificationCode = req.verification_code;

    // Generate if not already generated
    if (!certNumber) {
      certNumber = this.generateCertificateNumber();
      verificationCode = this.generateVerificationCode();
    }

    const qrData = `${baseUrl}/verify/${verificationCode}`;
    const qrCodeImage = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 200,
      color: {
        dark: '#1e293b',
        light: '#ffffff'
      }
    });

    // Save issued document record
    if (!req.certificate_number) {
      RequestModel.saveIssuedDocument({
        requestId: req.id,
        certificateNumber: certNumber,
        verificationCode,
        qrData,
        qrCodeImage,
        issuedToName: req.citizen_name,
        documentName: req.document_name,
        validityStatus: 'VALID'
      });
    }

    const updated = RequestModel.updateStatus(requestId, {
      status: 'READY_FOR_PICKUP',
      preparedBy: staffUser.id
    });

    NotificationService.send(
      req.user_id,
      'Document Ready for Pickup',
      `Your official certificate for ${req.document_name} (${certNumber}) is ready for pickup at Barangay Central Hall.`,
      `/citizen/requests/${req.tracking_number}`
    );

    AdminModel.logAudit(
      staffUser.id,
      staffUser.full_name || staffUser.fullName,
      'PREPARE_DOCUMENT',
      'document_requests',
      requestId,
      `Generated certificate ${certNumber} with QR verification for ${req.tracking_number}`
    );

    return RequestModel.findById(requestId);
  }

  static releaseDocument(requestId, staffUser, paymentReceived = true) {
    const req = RequestModel.findById(requestId);
    if (!req) throw new Error('Request not found.');

    const updated = RequestModel.updateStatus(requestId, {
      status: 'RELEASED',
      releasedBy: staffUser.id,
      releasedAt: new Date().toISOString(),
      paymentStatus: paymentReceived ? 'PAID' : req.payment_status
    });

    NotificationService.send(
      req.user_id,
      'Document Officially Released',
      `Your document (${req.document_name}) has been officially released to you. You can verify its validity anytime online.`,
      `/citizen/requests/${req.tracking_number}`
    );

    AdminModel.logAudit(
      staffUser.id,
      staffUser.full_name || staffUser.fullName,
      'RELEASE_DOCUMENT',
      'document_requests',
      requestId,
      `Officially released document for ${req.tracking_number} (Certificate: ${req.certificate_number || 'N/A'})`
    );

    return updated;
  }

  static archiveDocument(requestId, user) {
    const req = RequestModel.findById(requestId);
    if (!req) throw new Error('Request not found.');

    const updated = RequestModel.updateStatus(requestId, {
      status: 'ARCHIVED',
      archivedAt: new Date().toISOString()
    });

    AdminModel.logAudit(
      user.id,
      user.full_name || user.fullName,
      'ARCHIVE_RECORD',
      'document_requests',
      requestId,
      `Archived record for ${req.tracking_number}`
    );

    return updated;
  }

  static getCitizenRequests(userId) {
    return RequestModel.findByUserId(userId);
  }

  static getRequestByTracking(trackingNumber) {
    const req = RequestModel.findByTrackingNumber(trackingNumber);
    if (!req) throw new Error('Request not found.');
    return req;
  }

  static getStaffQueue(filter = {}) {
    return RequestModel.findAll({ ...filter, isArchived: false });
  }

  static getArchivedRecords(filter = {}) {
    return RequestModel.findAll({ ...filter, isArchived: true });
  }

  static getHistoricalSearch(search = '', limit = 100) {
    return RequestModel.findAll({ search, limit });
  }
}

module.exports = RequestService;
