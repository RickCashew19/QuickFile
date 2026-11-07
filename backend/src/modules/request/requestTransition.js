const { ALLOWED_STATUS_TRANSITIONS, REQUEST_STATUSES } = require('../../config/constants');
const { DocumentRequest, AuditLog } = require('../../models');
const { sendNotification } = require('../notification/notification.service');

/**
 * Single, central service function for executing all document request status transitions
 * Section 2B.A & Fix 4: Strictly enforces allowed state transition graph,
 * executes atomic findOneAndUpdate with expected current status in query filter,
 * returns 409 Conflict if modified concurrently, records audit log, and notifies citizen.
 */
async function transitionRequestStatus({
  request,
  requestId: passedRequestId,
  expectedStatus: passedExpectedStatus,
  newStatus,
  actorUser,
  rejectionReason = '',
  processingNotes = '',
  extraUpdates = {},
  ipAddress = '',
  userAgent = '',
}) {
  const reqId = passedRequestId || (request ? request._id : null);
  const expectedStatus = passedExpectedStatus || (request ? request.status : null);

  if (!reqId) {
    const error = new Error('Request ID is required for status transition.');
    error.statusCode = 400;
    throw error;
  }

  // 1. Verify that transition is legal from expected current status
  const allowedNextStatuses = ALLOWED_STATUS_TRANSITIONS[expectedStatus] || [];
  if (!allowedNextStatuses.includes(newStatus)) {
    const error = new Error(
      `Invalid status transition from "${expectedStatus}" to "${newStatus}". Allowed next statuses: [${allowedNextStatuses.join(', ')}].`
    );
    error.statusCode = 400;
    throw error;
  }

  // 2. Prepare atomic update fields with actor and stage timestamps
  const now = new Date();
  const updateFields = {
    status: newStatus,
    ...extraUpdates,
  };

  if (processingNotes) {
    updateFields.processing_notes = processingNotes;
  }

  switch (newStatus) {
    case REQUEST_STATUSES.UNDER_REVIEW:
      updateFields.reviewed_by = actorUser._id;
      updateFields.reviewed_at = now;
      break;

    case REQUEST_STATUSES.APPROVED:
      updateFields.approved_by = actorUser._id;
      updateFields.approved_at = now;
      break;

    case REQUEST_STATUSES.IN_PREPARATION:
      updateFields.prepared_by = actorUser._id;
      updateFields.prepared_at = now;
      break;

    case REQUEST_STATUSES.READY_FOR_PICKUP:
      updateFields.ready_at = now;
      break;

    case REQUEST_STATUSES.RELEASED:
      updateFields.released_by = actorUser._id;
      updateFields.released_at = now;
      break;

    case REQUEST_STATUSES.REJECTED:
      updateFields.rejection_reason = rejectionReason || 'Request rejected by barangay office.';
      updateFields.rejected_at = now;
      break;

    case REQUEST_STATUSES.CANCELLED:
      updateFields.cancelled_at = now;
      if (rejectionReason) {
        updateFields.cancellation_reason = rejectionReason;
      }
      break;

    case REQUEST_STATUSES.ARCHIVED:
      updateFields.archived_at = now;
      break;

    default:
      break;
  }

  // 3. Execute atomic update conditioned on current expected status with runValidators: true
  const updatedRequest = await DocumentRequest.findOneAndUpdate(
    { _id: reqId, status: expectedStatus },
    { $set: updateFields },
    { new: true, runValidators: true }
  );

  if (!updatedRequest) {
    // If not updated, verify whether request exists or was modified concurrently
    const exists = await DocumentRequest.findById(reqId);
    if (!exists) {
      const error = new Error('Document request not found.');
      error.statusCode = 404;
      throw error;
    }

    const conflictErr = new Error('Status changed or request was modified by another user. Please refresh.');
    conflictErr.statusCode = 409;
    throw conflictErr;
  }

  // Mutate passed-in document object if present so calling context reflects updated state
  if (request) {
    request.status = updatedRequest.status;
    request.reviewed_by = updatedRequest.reviewed_by;
    request.reviewed_at = updatedRequest.reviewed_at;
    request.approved_by = updatedRequest.approved_by;
    request.approved_at = updatedRequest.approved_at;
    request.prepared_by = updatedRequest.prepared_by;
    request.prepared_at = updatedRequest.prepared_at;
    request.ready_at = updatedRequest.ready_at;
    request.released_by = updatedRequest.released_by;
    request.released_at = updatedRequest.released_at;
    request.rejected_at = updatedRequest.rejected_at;
    request.rejection_reason = updatedRequest.rejection_reason;
    request.cancelled_at = updatedRequest.cancelled_at;
    request.cancellation_reason = updatedRequest.cancellation_reason;
    request.archived_at = updatedRequest.archived_at;
  }

  // 4. Immutable Audit Log entry
  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'REQUEST_STATUS_CHANGE',
    module: 'REQUEST',
    target_id: updatedRequest._id.toString(),
    target_type: 'DocumentRequest',
    details: {
      tracking_number: updatedRequest.tracking_number,
      from_status: expectedStatus,
      to_status: newStatus,
      rejection_reason: rejectionReason || undefined,
    },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  // 5. In-app notification to citizen
  const readableStatus = newStatus.replace(/_/g, ' ').toUpperCase();
  await sendNotification({
    user_id: updatedRequest.citizen_id,
    title: 'Document Request Status Update',
    message: `Your document request (${updatedRequest.tracking_number}) has been updated to "${readableStatus}".`,
    type: newStatus === REQUEST_STATUSES.REJECTED ? 'danger' : 'info',
    metadata: {
      tracking_number: updatedRequest.tracking_number,
      status: newStatus,
    },
  }).catch((err) => {
    console.warn(`[Notification] Failed to send status notification to user ${updatedRequest.citizen_id}:`, err.message);
  });

  return updatedRequest;
}

module.exports = {
  transitionRequestStatus,
};
