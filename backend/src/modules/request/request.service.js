const crypto = require('crypto');
const {
  DocumentRequest,
  DocumentType,
  AuditLog,
} = require('../../models');
const {
  REQUEST_STATUSES,
  PAYMENT_STATUSES,
} = require('../../config/constants');
const { saveValidatedFile, deleteUploadedFile } = require('../../utils/fileUpload');
const { sendNotification } = require('../notification/notification.service');
const { transitionRequestStatus } = require('./requestTransition');

/**
 * Generates a unique, non-guessable tracking number: QF-YYYYMMDD-XXXXXX
 */
async function generateTrackingNumber() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 chars
    const candidate = `QF-${dateStr}-${randomHex}`;

    const exists = await DocumentRequest.findOne({ tracking_number: candidate });
    if (!exists) {
      return candidate;
    }
  }

  throw new Error('Failed to generate a unique tracking number after multiple attempts.');
}

/**
 * Creates a new document request
 * Server determines fee and payment_status strictly from the active DocumentType
 */
async function createRequest({
  citizenUser,
  documentTypeId,
  purpose,
  copies,
  formData = {},
  files = [],
  ipAddress,
  userAgent,
}) {
  if (!documentTypeId || !purpose) {
    const error = new Error('Validation error: document_type_id and purpose are required.');
    error.statusCode = 400;
    throw error;
  }

  // 1. Validate DocumentType exists and is currently active
  const docType = await DocumentType.findById(documentTypeId);
  if (!docType || !docType.is_active) {
    const error = new Error('Selected document type is invalid or currently inactive.');
    error.statusCode = 400;
    throw error;
  }

  // 2. Validate and clamp copies (1 to 10)
  const copiesCount = Math.min(10, Math.max(1, parseInt(copies, 10) || 1));

  // 3. Server computes fee and payment_status (never trust client)
  const fee = (docType.fee || 0) * copiesCount;
  const paymentStatus = fee === 0 ? PAYMENT_STATUSES.FREE : PAYMENT_STATUSES.UNPAID;

  // 4. Validate & parse form_data if passed as JSON string
  let parsedFormData = formData;
  if (typeof formData === 'string') {
    try {
      parsedFormData = JSON.parse(formData);
    } catch {
      parsedFormData = {};
    }
  }

  // 5. Process and validate file uploads with rollback on error
  const savedAttachments = [];
  try {
    for (const file of files) {
      const saved = saveValidatedFile(file);
      savedAttachments.push(saved);
    }
  } catch (fileErr) {
    // Rollback: clean up any files that were already saved before error
    for (const att of savedAttachments) {
      deleteUploadedFile(att.stored_filename);
    }
    throw fileErr;
  }

  // 6. Generate unique tracking number
  const trackingNumber = await generateTrackingNumber();

  // 7. Maintain consistency between primary attachment and attachments array
  const primaryAttachment = savedAttachments[0] || null;
  const attachmentName = primaryAttachment ? primaryAttachment.original_name : '';
  const attachmentPath = primaryAttachment ? primaryAttachment.stored_filename : '';

  // 8. Create DocumentRequest record
  let newRequest;
  try {
    newRequest = await DocumentRequest.create({
      tracking_number: trackingNumber,
      citizen_id: citizenUser._id,
      document_type_id: docType._id,
      purpose: String(purpose).trim(),
      copies: copiesCount,
      status: REQUEST_STATUSES.PENDING,
      fee,
      payment_status: paymentStatus,
      form_data: parsedFormData,
      attachment_name: attachmentName,
      attachment_path: attachmentPath,
      attachments: savedAttachments,
    });
  } catch (createErr) {
    // Rollback saved files if database insertion fails
    for (const att of savedAttachments) {
      deleteUploadedFile(att.stored_filename);
    }
    throw createErr;
  }

  // 9. Send in-app notification to citizen
  await sendNotification({
    user_id: citizenUser._id,
    title: 'Document Request Submitted',
    message: `Your request for ${docType.name} has been submitted (Tracking #: ${trackingNumber}).`,
    type: 'success',
    metadata: {
      tracking_number: trackingNumber,
      document_type: docType.name,
    },
  }).catch((err) => {
    console.warn(`[Notification] Failed to send submission notification:`, err.message);
  });

  // 10. Audit log entry
  await AuditLog.create({
    user_id: citizenUser._id,
    actor_name: citizenUser.full_name,
    action: 'DOCUMENT_REQUEST_CREATE',
    module: 'REQUEST',
    target_id: newRequest._id.toString(),
    target_type: 'DocumentRequest',
    details: {
      tracking_number: trackingNumber,
      document_type: docType.name,
      copies: copiesCount,
      fee,
      attachments_count: savedAttachments.length,
    },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  return newRequest.populate('document_type_id');
}

/**
 * List requests for the authenticated citizen (paginated with optional status filter)
 */
async function listCitizenRequests(citizenId, { page = 1, limit = 10, status }) {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10)); // Capped at 50
  const skip = (safePage - 1) * safeLimit;

  const query = { citizen_id: citizenId };
  if (status && Object.values(REQUEST_STATUSES).includes(status)) {
    query.status = status;
  }

  const [requests, total] = await Promise.all([
    DocumentRequest.find(query)
      .populate('document_type_id')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    DocumentRequest.countDocuments(query),
  ]);

  return {
    requests,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      total_pages: Math.ceil(total / safeLimit) || 1,
    },
  };
}

/**
 * Get request by tracking number (strictly owner only; returns 404 for another citizen's request)
 */
async function getCitizenRequest(citizenId, trackingNumber) {
  const request = await DocumentRequest.findOne({
    tracking_number: trackingNumber.trim(),
    citizen_id: citizenId,
  }).populate('document_type_id');

  if (!request) {
    const error = new Error('Document request not found.');
    error.statusCode = 404;
    throw error;
  }

  return request;
}

/**
 * Lightweight status check for high-frequency polling
 */
async function getCitizenRequestStatus(citizenId, trackingNumber) {
  const request = await DocumentRequest.findOne(
    {
      tracking_number: trackingNumber.trim(),
      citizen_id: citizenId,
    },
    'tracking_number status payment_status fee updated_at'
  ).lean();

  if (!request) {
    const error = new Error('Document request not found.');
    error.statusCode = 404;
    throw error;
  }

  return {
    tracking_number: request.tracking_number,
    status: request.status,
    payment_status: request.payment_status,
    fee: request.fee,
    updated_at: request.updated_at,
  };
}

/**
 * Update request (allowed strictly while status is PENDING and by owner only)
 */
async function updateCitizenRequest({
  citizenId,
  trackingNumber,
  purpose,
  copies,
  formData,
  files = [],
  replaceAttachments = false,
  actorUser,
  ipAddress,
  userAgent,
}) {
  const request = await DocumentRequest.findOne({
    tracking_number: trackingNumber.trim(),
    citizen_id: citizenId,
  });

  if (!request) {
    const error = new Error('Document request not found.');
    error.statusCode = 404;
    throw error;
  }

  if (request.status !== REQUEST_STATUSES.PENDING) {
    const error = new Error(`Request cannot be edited because its current status is "${request.status}". Only pending requests can be edited.`);
    error.statusCode = 400;
    throw error;
  }

  // Recalculate fee if copies are modified
  if (copies !== undefined) {
    const docType = await DocumentType.findById(request.document_type_id);
    const copiesCount = Math.min(10, Math.max(1, parseInt(copies, 10) || request.copies));
    request.copies = copiesCount;
    request.fee = (docType?.fee || 0) * copiesCount;
    if (request.fee === 0) {
      request.payment_status = PAYMENT_STATUSES.FREE;
    }
  }

  if (purpose !== undefined && typeof purpose === 'string') {
    request.purpose = purpose.trim();
  }

  if (formData !== undefined) {
    let parsedFormData = formData;
    if (typeof formData === 'string') {
      try {
        parsedFormData = JSON.parse(formData);
      } catch {
        parsedFormData = request.form_data;
      }
    }
    request.form_data = parsedFormData;
  }

  // Process attachments
  if (files.length > 0 || replaceAttachments) {
    const newlySaved = [];
    try {
      for (const file of files) {
        newlySaved.push(saveValidatedFile(file));
      }

      if (replaceAttachments) {
        // Clean up previous files from disk
        for (const oldAtt of request.attachments) {
          deleteUploadedFile(oldAtt.stored_filename);
        }
        request.attachments = newlySaved;
      } else {
        const totalCount = request.attachments.length + newlySaved.length;
        if (totalCount > 3) {
          const error = new Error(`Total attachments exceed the maximum of 3 files (current: ${request.attachments.length}, new: ${newlySaved.length}).`);
          error.statusCode = 400;
          throw error;
        }
        request.attachments = [...request.attachments, ...newlySaved];
      }

      // Maintain consistency
      const primary = request.attachments[0] || null;
      request.attachment_name = primary ? primary.original_name : '';
      request.attachment_path = primary ? primary.stored_filename : '';
    } catch (attErr) {
      // Rollback newly saved files
      for (const att of newlySaved) {
        deleteUploadedFile(att.stored_filename);
      }
      throw attErr;
    }
  }

  await request.save();

  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'DOCUMENT_REQUEST_UPDATE',
    module: 'REQUEST',
    target_id: request._id.toString(),
    target_type: 'DocumentRequest',
    details: {
      tracking_number: request.tracking_number,
      copies: request.copies,
      fee: request.fee,
    },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  return request.populate('document_type_id');
}

/**
 * Cancel request (allowed strictly while status is PENDING and by owner only)
 */
async function cancelCitizenRequest({
  citizenId,
  trackingNumber,
  cancellationReason = 'Cancelled by applicant',
  actorUser,
  ipAddress,
  userAgent,
}) {
  const request = await DocumentRequest.findOne({
    tracking_number: trackingNumber.trim(),
    citizen_id: citizenId,
  });

  if (!request) {
    const error = new Error('Document request not found.');
    error.statusCode = 404;
    throw error;
  }

  if (request.status !== REQUEST_STATUSES.PENDING) {
    const error = new Error(`Request cannot be cancelled because its current status is "${request.status}". Only pending requests can be cancelled.`);
    error.statusCode = 400;
    throw error;
  }

  return transitionRequestStatus({
    request,
    newStatus: REQUEST_STATUSES.CANCELLED,
    actorUser,
    rejectionReason: cancellationReason,
    ipAddress,
    userAgent,
  });
}

module.exports = {
  generateTrackingNumber,
  createRequest,
  listCitizenRequests,
  getCitizenRequest,
  getCitizenRequestStatus,
  updateCitizenRequest,
  cancelCitizenRequest,
};
