const RequestModel = require('../request/request.model');
const AdminModel = require('../admin/admin.model');

class VerificationService {
  static verifyDocument(queryCode) {
    if (!queryCode || queryCode.trim() === '') {
      throw new Error('Please enter a verification code, certificate number, or tracking number.');
    }

    const trimmed = queryCode.trim();
    const doc = RequestModel.getIssuedDocumentByCode(trimmed);

    if (!doc) {
      return {
        isValid: false,
        found: false,
        searchedCode: trimmed,
        message: 'No official barangay record found matching this verification code or certificate number. The document may be unofficial or unissued.'
      };
    }

    let parsedFormData = {};
    try {
      parsedFormData = JSON.parse(doc.form_data || '{}');
    } catch (e) {
      parsedFormData = {};
    }

    return {
      isValid: doc.validity_status === 'VALID',
      found: true,
      searchedCode: trimmed,
      document: {
        certificateNumber: doc.certificate_number,
        verificationCode: doc.verification_code,
        trackingNumber: doc.tracking_number,
        documentName: doc.document_name,
        issuedToName: doc.issued_to_name,
        purpose: doc.purpose,
        validityStatus: doc.validity_status,
        issuedAt: doc.issued_at,
        releasedAt: doc.released_at,
        revokedAt: doc.revoked_at,
        revokedReason: doc.revoked_reason,
        residentDetails: {
          address: parsedFormData.completeAddress || 'Barangay Central',
          civilStatus: parsedFormData.civilStatus || 'N/A',
          contactNumber: parsedFormData.contactNumber || 'N/A'
        }
      }
    };
  }

  static getAllIssued(options = {}) {
    return RequestModel.getAllIssuedDocuments(options);
  }

  static revokeDocument(adminUser, issuedDocId, reason) {
    if (!reason || reason.trim() === '') {
      throw new Error('Please provide a reason for revoking the document.');
    }

    RequestModel.updateIssuedDocumentValidity(issuedDocId, 'REVOKED', reason.trim());

    AdminModel.logAudit(
      adminUser.id,
      adminUser.full_name || adminUser.fullName,
      'REVOKE_DOCUMENT',
      'issued_documents',
      issuedDocId,
      `Revoked document ID ${issuedDocId}. Reason: ${reason.trim()}`
    );

    return true;
  }

  static reinstateDocument(adminUser, issuedDocId) {
    RequestModel.updateIssuedDocumentValidity(issuedDocId, 'VALID', null);

    AdminModel.logAudit(
      adminUser.id,
      adminUser.full_name || adminUser.fullName,
      'REINSTATE_DOCUMENT',
      'issued_documents',
      issuedDocId,
      `Reinstated document ID ${issuedDocId} back to VALID status`
    );

    return true;
  }
}

module.exports = VerificationService;
