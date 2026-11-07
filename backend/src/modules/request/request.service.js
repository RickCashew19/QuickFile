const crypto = require('crypto');
const { DocumentRequest, DocumentType, AuditLog } = require('../../models');
const { REQUEST_STATUSES, PAYMENT_STATUSES } = require('../../config/constants');
const { saveValidatedFile, deleteUploadedFile } = require('../../utils/fileUpload');
const { validateAndParseFormData } = require('../../utils/formDataValidator');
const { sendNotification } = require('../notification/notification.service');
const { transitionRequestStatus } = require('./requestTransition');

/**
 * Generates an 8-character unique alphanumeric tracking number
 * Format: QF-YYYYMMDD-XXXXXX
 */
async function generateTrackingNumber() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let isUnique = false;
  let trackingNumber = '';

  while (!isUnique) {
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    trackingNumber = `QF-${dateStr}-${randomHex}`;

    const existing = await DocumentRequest.findOne({ tracking_number: trackingNumber });
    if (!existing) {
      isUnique = true;
    }
  }

  return trackingNumber;
}

/**
 * Validates copies is an integer between 1 and 10. Defaults to 1 when omitted.
 */
function validateCopies(copies) {
  if (copies === undefined || copies === null || copies === '') {
    return 1;
  }
  const copiesNum = Number(copies);
  if (!Number.isInteger(copiesNum) || copiesNum < 1 || copiesNum > 10) {
    const error = new Error('Number of copies must be an integer between 1 and 10.');
    error.statusCode = 400;
    throw error;
  }
  return copiesNum;
}

/**
 * Validates purpose string length (max 500 chars)
 */
function validatePurpose(purpose) {
  if (typeof purpose !== 'string' || !purpose.trim()) {
    const error = new Error('Purpose is required and must be a non-empty string.');
    error.statusCode = 400;
    throw error;
  }
  const trimmed = purpose.trim();
  if (trimmed.length > 500) {
    const error = new Error('Purpose cannot exceed 500 characters.');
    error.statusCode = 400;
    throw error;
  }
  return trimmed;
}

/**
 * Create a new citizen document request
 * Server determines unit_fee, fee and payment_status strictly from the active DocumentType
 */
async function createRequest({
  citizenUser,
  documentTypeId,
  purpose,
  copies,
  formData = {},
  files = [],
  created_by_staff_id = null,
  actorUser = null,
  ipAddress,
  userAgent,
}) {
  if (!documentTypeId || typeof documentTypeId !== 'string') {
    const error = new Error('Validation error: document_type_id must be a valid string ID.');
    error.statusCode = 400;
    throw error;
  }

  const validPurpose = validatePurpose(purpose);
  const copiesCount = validateCopies(copies);

  // 1. Validate DocumentType exists and is active
  const docType = await DocumentType.findById(documentTypeId);
  if (!docType || !docType.is_active) {
    const error = new Error('Selected document type is invalid or currently inactive.');
    error.statusCode = 400;
    throw error;
  }

  // 2. Server computes unit_fee, fee and payment_status
  const unitFee = Number((docType.fee || 0).toFixed(2));
  const fee = Number((unitFee * copiesCount).toFixed(2));
  const paymentStatus = fee === 0 ? PAYMENT_STATUSES.FREE : PAYMENT_STATUSES.UNPAID;

  // 3. Strict form_data validation
  const parsedFormData = validateAndParseFormData(formData);

  // 4. Process and validate file uploads with rollback on error
  const savedAttachments = [];
  try {
    for (const file of files) {
      const saved = saveValidatedFile(file);
      savedAttachments.push(saved);
    }
  } catch (fileErr) {
    for (const att of savedAttachments) {
      deleteUploadedFile(att.stored_filename);
    }
    throw fileErr;
  }

  // 5. Generate unique tracking number
  const trackingNumber = await generateTrackingNumber();

  const primaryAttachment = savedAttachments[0] || null;
  const attachmentName = primaryAttachment ? primaryAttachment.original_name : '';
  const attachmentPath = primaryAttachment ? primaryAttachment.stored_filename : '';

  // 6. Create DocumentRequest record
  let newRequest;
  try {
    newRequest = await DocumentRequest.create({
      tracking_number: trackingNumber,
      citizen_id: citizenUser._id,
      document_type_id: docType._id,
      created_by_staff_id,
      purpose: validPurpose,
      copies: copiesCount,
      status: REQUEST_STATUSES.PENDING,
      unit_fee: unitFee,
      fee,
      payment_status: paymentStatus,
      form_data: parsedFormData,
      attachment_name: attachmentName,
      attachment_path: attachmentPath,
      attachments: savedAttachments,
    });
  } catch (createErr) {
    for (const att of savedAttachments) {
      deleteUploadedFile(att.stored_filename);
    }
    throw createErr;
  }

  // 7. In-app notification (Item 12: phrasing differs for walk-in filed by staff)
  const notificationMessage = created_by_staff_id
    ? `Your request for ${docType.name} was filed for you at the barangay hall (Tracking #: ${trackingNumber}).`
    : `Your request for ${docType.name} has been submitted (Tracking #: ${trackingNumber}).`;

  await sendNotification({
    user_id: citizenUser._id,
    title: 'Document Request Submitted',
    message: notificationMessage,
    type: 'success',
    metadata: {
      tracking_number: trackingNumber,
      document_type: docType.name,
    },
  }).catch((err) => {
    console.warn('[Notification] Failed to send submission notification:', err.message);
  });

  // 8. Audit log entry (Item 12: For walk-in, the actor is the staff member)
  const auditActorId = actorUser && actorUser._id ? actorUser._id : citizenUser._id;
  const auditActorName = actorUser && actorUser.full_name ? actorUser.full_name : citizenUser.full_name;

  await AuditLog.create({
    user_id: auditActorId,
    actor_name: auditActorName,
    action: created_by_staff_id ? 'DOCUMENT_REQUEST_WALK_IN_CREATE' : 'DOCUMENT_REQUEST_CREATE',
    module: 'REQUEST',
    target_id: newRequest._id.toString(),
    target_type: 'DocumentRequest',
    details: {
      tracking_number: trackingNumber,
      citizen_id: citizenUser._id.toString(),
      citizen_name: citizenUser.full_name,
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
  const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
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
      .limit(safeLimit),
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
 * Item 8: Re-prices from stored unit_fee; deletes replaced files only AFTER update succeeds;
 * cleans up newly saved files on ANY failure.
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
  const existing = await DocumentRequest.findOne({
    tracking_number: trackingNumber.trim(),
    citizen_id: citizenId,
  });

  if (!existing) {
    const error = new Error('Document request not found.');
    error.statusCode = 404;
    throw error;
  }

  if (existing.status !== REQUEST_STATUSES.PENDING) {
    const error = new Error(
      `Request cannot be edited because its current status is "${existing.status}". Only pending requests can be edited.`
    );
    error.statusCode = 400;
    throw error;
  }

  const newlySaved = [];
  let oldAttachmentsToDelete = [];

  try {
    const updateFields = {};

    // Recalculate fee if copies are modified (Item 8: from stored unit_fee, never today's docType fee)
    if (copies !== undefined) {
      const copiesCount = validateCopies(copies);
      const unitFee = Number((existing.unit_fee ?? 0).toFixed(2));
      const fee = Number((unitFee * copiesCount).toFixed(2));
      updateFields.unit_fee = unitFee;
      updateFields.copies = copiesCount;
      updateFields.fee = fee;
      updateFields.payment_status = fee === 0 ? PAYMENT_STATUSES.FREE : PAYMENT_STATUSES.UNPAID;
    }

    if (purpose !== undefined) {
      updateFields.purpose = validatePurpose(purpose);
    }

    if (formData !== undefined) {
      updateFields.form_data = validateAndParseFormData(formData);
    }

    // Process attachments
    if (files.length > 0 || replaceAttachments) {
      for (const file of files) {
        newlySaved.push(saveValidatedFile(file));
      }

      if (replaceAttachments) {
        oldAttachmentsToDelete = [...existing.attachments];
        updateFields.attachments = newlySaved;
      } else {
        const totalCount = existing.attachments.length + newlySaved.length;
        if (totalCount > 3) {
          const error = new Error(
            `Total attachments exceed the maximum of 3 files (current: ${existing.attachments.length}, new: ${newlySaved.length}).`
          );
          error.statusCode = 400;
          throw error;
        }
        updateFields.attachments = [...existing.attachments, ...newlySaved];
      }

      const primary = (updateFields.attachments || [])[0] || null;
      updateFields.attachment_name = primary ? primary.original_name : '';
      updateFields.attachment_path = primary ? primary.stored_filename : '';
    }

    // Atomic update conditioned on pending status with runValidators: true
    const updated = await DocumentRequest.findOneAndUpdate(
      { _id: existing._id, status: REQUEST_STATUSES.PENDING },
      { $set: updateFields },
      { new: true, runValidators: true }
    ).populate('document_type_id');

    if (!updated) {
      const error = new Error('Status changed or request was modified by another user. Please refresh.');
      error.statusCode = 409;
      throw error;
    }

    // Only AFTER update succeeds, delete old replaced attachments from disk
    for (const oldAtt of oldAttachmentsToDelete) {
      deleteUploadedFile(oldAtt.stored_filename);
    }

    await AuditLog.create({
      user_id: actorUser._id,
      actor_name: actorUser.full_name,
      action: 'DOCUMENT_REQUEST_UPDATE',
      module: 'REQUEST',
      target_id: updated._id.toString(),
      target_type: 'DocumentRequest',
      details: {
        tracking_number: updated.tracking_number,
        copies: updated.copies,
        fee: updated.fee,
      },
      ip_address: ipAddress || '',
      user_agent: userAgent || '',
    });

    return updated;
  } catch (err) {
    // Clean up newly saved files if ANY step fails (including 409 or validation errors)
    for (const att of newlySaved) {
      deleteUploadedFile(att.stored_filename);
    }
    throw err;
  }
}

/**
 * Cancel request (allowed strictly while status is PENDING and by owner only)
 * Item 9: Validates cancellation_reason (trimmed, max 500)
 */
async function cancelCitizenRequest({
  citizenId,
  trackingNumber,
  cancellationReason = 'Cancelled by applicant',
  actorUser,
  ipAddress,
  userAgent,
}) {
  const existing = await DocumentRequest.findOne({
    tracking_number: trackingNumber.trim(),
    citizen_id: citizenId,
  });

  if (!existing) {
    const error = new Error('Document request not found.');
    error.statusCode = 404;
    throw error;
  }

  if (existing.status !== REQUEST_STATUSES.PENDING) {
    const error = new Error(
      `Request cannot be cancelled because its current status is "${existing.status}". Only pending requests can be cancelled.`
    );
    error.statusCode = 400;
    throw error;
  }

  const validReason =
    cancellationReason !== undefined && cancellationReason !== null
      ? String(cancellationReason).trim()
      : 'Cancelled by applicant';

  if (!validReason) {
    const error = new Error('Cancellation reason cannot be empty.');
    error.statusCode = 400;
    throw error;
  }

  if (validReason.length > 500) {
    const error = new Error('Cancellation reason cannot exceed 500 characters.');
    error.statusCode = 400;
    throw error;
  }

  return transitionRequestStatus({
    requestId: existing._id,
    expectedStatus: REQUEST_STATUSES.PENDING,
    newStatus: REQUEST_STATUSES.CANCELLED,
    actorUser,
    rejectionReason: validReason,
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
