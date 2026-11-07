const { IssuedDocument, DocumentRequest, User, AuditLog } = require('../../models');
const { VALIDITY_STATUSES } = require('../../config/constants');

/**
 * Public document verification (Zero PII, minimal fields only)
 */
async function verifyPublicCode(code) {
  if (!code || typeof code !== 'string') {
    const error = new Error('Verification code is required.');
    error.statusCode = 400;
    throw error;
  }

  const cleanCode = code.trim().toUpperCase();

  // Reject tracking numbers explicitly (format: QF-...)
  if (cleanCode.startsWith('QF-')) {
    const error = new Error('Invalid verification code. Tracking numbers cannot be verified here.');
    error.statusCode = 404;
    throw error;
  }

  const issuedDoc = await IssuedDocument.findOne({ verification_code: cleanCode });
  if (!issuedDoc) {
    const error = new Error('Verification record not found. The certificate code is invalid or does not exist.');
    error.statusCode = 404;
    throw error;
  }

  // Determine dynamic validity status (check expiration against current time)
  let effectiveStatus = issuedDoc.validity_status;
  if (
    issuedDoc.expires_at &&
    new Date() > new Date(issuedDoc.expires_at) &&
    issuedDoc.validity_status === VALIDITY_STATUSES.VALID
  ) {
    effectiveStatus = VALIDITY_STATUSES.EXPIRED;
  }

  return {
    validity_status: effectiveStatus,
    document_name: issuedDoc.document_name,
    certificate_number: issuedDoc.certificate_number,
    issued_at: issuedDoc.issued_at,
    expires_at: issuedDoc.expires_at,
  };
}

/**
 * Staff document verification (Full audit details + logs verification scan)
 */
async function verifyStaffCode(code, staffUser, ipAddress, userAgent) {
  if (!code || typeof code !== 'string') {
    const error = new Error('Verification code is required.');
    error.statusCode = 400;
    throw error;
  }

  const cleanCode = code.trim().toUpperCase();

  const issuedDoc = await IssuedDocument.findOne({ verification_code: cleanCode })
    .populate('request_id')
    .populate('issued_by', 'full_name email');

  if (!issuedDoc) {
    const error = new Error('Verification record not found.');
    error.statusCode = 404;
    throw error;
  }

  let effectiveStatus = issuedDoc.validity_status;
  if (
    issuedDoc.expires_at &&
    new Date() > new Date(issuedDoc.expires_at) &&
    issuedDoc.validity_status === VALIDITY_STATUSES.VALID
  ) {
    effectiveStatus = VALIDITY_STATUSES.EXPIRED;
  }

  const parentRequest = issuedDoc.request_id;
  const issuingStaff = issuedDoc.issued_by;

  // Log verification scan to immutable audit log
  await AuditLog.create({
    user_id: staffUser._id,
    actor_name: staffUser.full_name,
    action: 'VERIFY_QR_SCAN',
    module: 'VERIFICATION',
    target_id: issuedDoc._id.toString(),
    target_type: 'IssuedDocument',
    details: {
      certificate_number: issuedDoc.certificate_number,
      verification_code: issuedDoc.verification_code,
      status: effectiveStatus,
    },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  return {
    certificate_number: issuedDoc.certificate_number,
    verification_code: issuedDoc.verification_code,
    validity_status: effectiveStatus,
    revoked_reason: issuedDoc.revoked_reason || '',
    revoked_at: issuedDoc.revoked_at || null,
    document_name: issuedDoc.document_name,
    issued_to_name: issuedDoc.issued_to_name,
    issued_at: issuedDoc.issued_at,
    expires_at: issuedDoc.expires_at,
    tracking_number: parentRequest ? parentRequest.tracking_number : null,
    request_id: issuedDoc.request_id ? issuedDoc.request_id._id : null,
    request_status: parentRequest ? parentRequest.status : null,
    issuing_staff_name: issuingStaff ? issuingStaff.full_name : 'Barangay Staff',
    status_history: {
      created_at: parentRequest?.created_at || null,
      reviewed_at: parentRequest?.reviewed_at || null,
      approved_at: parentRequest?.approved_at || null,
      prepared_at: parentRequest?.prepared_at || null,
      ready_at: parentRequest?.ready_at || null,
      released_at: parentRequest?.released_at || null,
    },
  };
}

module.exports = {
  verifyPublicCode,
  verifyStaffCode,
};

