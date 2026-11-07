const { ALLOWED_STATUS_TRANSITIONS, REQUEST_STATUSES } = require('../../config/constants');
const { AuditLog } = require('../../models');
const { sendNotification } = require('../notification/notification.service');

/**
 * Single, central service function for executing all document request status transitions
 * Section 2B.A: Strictly enforces allowed state transition graph, updates handler stamps,
 * generates audit log, and notifies citizen.
 */
async function transitionRequestStatus({
  request,
  newStatus,
  actorUser,
  rejectionReason = '',
  processingNotes = '',
  ipAddress = '',
  userAgent = '',
}) {
  const currentStatus = request.status;
  const allowedNextStatuses = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];

  if (!allowedNextStatuses.includes(newStatus)) {
    const error = new Error(
      `Invalid status transition from "${currentStatus}" to "${newStatus}". Allowed next statuses: [${allowedNextStatuses.join(', ')}].`
    );
    error.statusCode = 400;
    throw error;
  }

  const now = new Date();
  request.status = newStatus;

  if (processingNotes) {
    request.processing_notes = processingNotes;
  }

  // Update workflow audit timestamps and actor stamps based on target state
  switch (newStatus) {
    case REQUEST_STATUSES.UNDER_REVIEW:
      request.reviewed_by = actorUser._id;
      request.reviewed_at = now;
      break;

    case REQUEST_STATUSES.APPROVED:
      request.approved_by = actorUser._id;
      request.approved_at = now;
      break;

    case REQUEST_STATUSES.IN_PREPARATION:
      request.prepared_by = actorUser._id;
      request.prepared_at = now;
      break;

    case REQUEST_STATUSES.RELEASED:
      request.released_by = actorUser._id;
      request.released_at = now;
      break;

    case REQUEST_STATUSES.REJECTED:
      request.rejection_reason = rejectionReason || 'Request rejected by barangay office.';
      break;

    case REQUEST_STATUSES.CANCELLED:
      request.cancelled_at = now;
      if (rejectionReason) {
        request.rejection_reason = rejectionReason;
      }
      break;

    case REQUEST_STATUSES.ARCHIVED:
      request.archived_at = now;
      break;

    default:
      break;
  }

  await request.save();

  // Immutable Audit Log entry
  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'REQUEST_STATUS_CHANGE',
    module: 'REQUEST',
    target_id: request._id.toString(),
    target_type: 'DocumentRequest',
    details: {
      tracking_number: request.tracking_number,
      from_status: currentStatus,
      to_status: newStatus,
      rejection_reason: rejectionReason || undefined,
    },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  // Notify citizen in-app
  const readableStatus = newStatus.replace(/_/g, ' ').toUpperCase();
  await sendNotification({
    user_id: request.citizen_id,
    title: 'Document Request Status Update',
    message: `Your document request (${request.tracking_number}) has been updated to "${readableStatus}".`,
    type: newStatus === REQUEST_STATUSES.REJECTED ? 'danger' : 'info',
    metadata: {
      tracking_number: request.tracking_number,
      status: newStatus,
    },
  }).catch((err) => {
    console.warn(`[Notification] Failed to send status notification to user ${request.citizen_id}:`, err.message);
  });

  return request;
}

module.exports = {
  transitionRequestStatus,
};
