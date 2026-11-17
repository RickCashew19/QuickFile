const { ALLOWED_STATUS_TRANSITIONS, REQUEST_STATUSES, ROLES } = require('../config/constants');
const { DocumentRequest, AuditLog, CitizenProfile, User } = require('../models');
const { sendNotification } = require('../services/notification.service');
const { sendSms } = require('./sms');
const { sendMail } = require('./mailer');
const { escapeHtml } = require('./escapeHtml');
const requestLockService = require('../services/requestLock.service');

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
  skipExternalEmail = false,
  ipAddress = '',
  userAgent = '',
}) {
  const reqDoc = request;
  const reqId = passedRequestId || (reqDoc ? reqDoc._id : null);
  const expectedStatus = passedExpectedStatus || (reqDoc ? reqDoc.status : null);

  if (!reqId || !expectedStatus) {
    const error = new Error('requestId and expectedStatus are required to execute a status transition.');
    error.statusCode = 400;
    throw error;
  }

  // 1. Concurrency control: staff workflow actions honor request locks. A citizen
  //    cancelling their own pending request must not be blocked by a staff lock.
  if (actorUser && actorUser.role !== ROLES.CITIZEN) {
    await requestLockService.assertLockHeld(reqId, actorUser, { ipAddress, userAgent });
  }

  // 2. Validate status transition graph
  const allowedNextStatuses = ALLOWED_STATUS_TRANSITIONS[expectedStatus] || [];
  if (!allowedNextStatuses.includes(newStatus)) {
    const error = new Error(
      `Invalid status transition: Cannot move request from "${expectedStatus}" to "${newStatus}". Allowed transitions: [${allowedNextStatuses.join(', ')}].`
    );
    error.statusCode = 400;
    throw error;
  }

  // Check if a lock was currently held prior to state transition (for audit log)
  const priorDoc = await DocumentRequest.findById(reqId).select('lock tracking_number');

  // 3. Build atomic update operations
  const updateFields = {
    status: newStatus,
    ...extraUpdates,
    // Concurrency control: Automatically release the lock when an action completes work or reaches a terminal state
    lock: {
      locked_by: null,
      locked_by_name: null,
      locked_at: null,
      expires_at: null,
    },
  };

  // Specific timestamp & actor recording per transition stage
  if (newStatus === REQUEST_STATUSES.UNDER_REVIEW) {
    updateFields.reviewed_by = actorUser._id;
    updateFields.reviewed_at = new Date();
  } else if (newStatus === REQUEST_STATUSES.APPROVED) {
    updateFields.approved_by = actorUser._id;
    updateFields.approved_at = new Date();
  } else if (newStatus === REQUEST_STATUSES.READY_FOR_PICKUP) {
    updateFields.ready_at = new Date();
  } else if (newStatus === REQUEST_STATUSES.RELEASED) {
    updateFields.released_by = actorUser._id;
    updateFields.released_at = new Date();
  } else if (newStatus === REQUEST_STATUSES.REJECTED) {
    updateFields.rejected_by = actorUser._id;
    updateFields.rejected_at = new Date();
    updateFields.rejection_reason = rejectionReason.trim();
  } else if (newStatus === REQUEST_STATUSES.CANCELLED) {
    updateFields.cancelled_at = new Date();
    updateFields.cancellation_reason = rejectionReason ? rejectionReason.trim() : 'Cancelled by citizen';
  } else if (newStatus === REQUEST_STATUSES.ARCHIVED) {
    updateFields.archived_by = actorUser._id;
    updateFields.archived_at = new Date();
  }

  if (processingNotes && typeof processingNotes === 'string') {
    updateFields.processing_notes = processingNotes.trim();
  }

  // 4. Concurrency-safe atomic findOneAndUpdate with expected status filter and version increment
  const updatedRequest = await DocumentRequest.findOneAndUpdate(
    { _id: reqId, status: expectedStatus },
    { $set: updateFields, $inc: { __v: 1 } },
    { new: true, runValidators: true }
  );

  // If null, someone modified the record concurrently
  if (!updatedRequest) {
    const currentDoc = await DocumentRequest.findById(reqId);
    const actualCurrentStatus = currentDoc ? currentDoc.status : 'not found';
    const conflictError = new Error(
      `Conflict: The request was updated by another process (current status: "${actualCurrentStatus}"). Please refresh the page.`
    );
    conflictError.statusCode = 409;
    throw conflictError;
  }

  // Synchronize in-memory request document if passed by caller
  if (reqDoc) {
    for (const key of Object.keys(updateFields)) {
      reqDoc[key] = updatedRequest[key];
    }
    reqDoc.status = updatedRequest.status;
  }

  // 4. Record audit log for status transition
  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name || 'System',
    action: `STATUS_CHANGE_TO_${newStatus.toUpperCase()}`,
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

  // Concurrency control: Record audit log for automatic lock release if held prior to action
  if (priorDoc && priorDoc.lock && priorDoc.lock.locked_by) {
    await AuditLog.create({
      user_id: actorUser._id,
      actor_name: actorUser.full_name || 'Staff Member',
      action: 'LOCK_RELEASED',
      module: 'REQUEST_LOCK',
      target_id: updatedRequest._id.toString(),
      target_type: 'DocumentRequest',
      details: {
        tracking_number: updatedRequest.tracking_number,
        released_holder_id: priorDoc.lock.locked_by,
        released_holder_name: priorDoc.lock.locked_by_name,
        trigger: `TRANSITION_TO_${newStatus.toUpperCase()}`,
      },
      ip_address: ipAddress || '',
      user_agent: userAgent || '',
    }).catch(() => null);
  }

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

  // 6. External notifications (Email & SMS) to citizen
  (async () => {
    try {
      const [citizenUser, citizenProfile] = await Promise.all([
        User.findById(updatedRequest.citizen_id).lean(),
        CitizenProfile.findOne({ user_id: updatedRequest.citizen_id }).lean(),
      ]);

      const citizenName = citizenProfile?.first_name || citizenUser?.full_name || 'Citizen';

      // Send SMS if contact number exists
      if (citizenProfile?.contact_number) {
        let smsMessage = `QuickFile: Hello ${citizenName}, your document request (${updatedRequest.tracking_number}) status is now ${readableStatus}.`;
        if (newStatus === REQUEST_STATUSES.READY_FOR_PICKUP) {
          smsMessage = `QuickFile: Hello ${citizenName}, your document request (${updatedRequest.tracking_number}) is now READY FOR PICKUP at the Barangay Hall. Please bring a valid ID.`;
        } else if (newStatus === REQUEST_STATUSES.REJECTED) {
          smsMessage = `QuickFile: Hello ${citizenName}, your document request (${updatedRequest.tracking_number}) was REJECTED.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`;
        }

        sendSms({
          recipient: citizenProfile.contact_number,
          message: smsMessage,
        }).catch((err) => {
          console.warn(`[SMS] Failed to send status SMS to ${citizenProfile.contact_number}:`, err.message);
        });
      }

      // Send the generic status email unless the caller sends a richer,
      // transition-specific email (e.g. rejection reason or certificate number).
      if (!skipExternalEmail && citizenUser?.email) {
        const emailSubject = `QuickFile: Document Request Update (${updatedRequest.tracking_number}) - ${readableStatus}`;
        const emailText = `Hello ${citizenName},\n\nYour document request (${updatedRequest.tracking_number}) has been updated to "${readableStatus}".\n${rejectionReason ? `\nReason: ${rejectionReason}\n` : ''}\nThank you,\nBarangay Office`;
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #1e40af; margin-top: 0;">Document Request Update</h2>
            <p>Hello <strong>${escapeHtml(citizenName)}</strong>,</p>
            <p>Your document request <strong>${escapeHtml(updatedRequest.tracking_number)}</strong> has been updated to:</p>
            <p style="font-size: 18px; font-weight: bold; color: ${newStatus === REQUEST_STATUSES.REJECTED ? '#dc2626' : '#2563eb'};">
              ${readableStatus}
            </p>
            ${rejectionReason ? `<p><strong>Reason:</strong> ${escapeHtml(rejectionReason)}</p>` : ''}
            <p style="color: #64748b; font-size: 13px;">If you have questions, please contact the Barangay Hall.</p>
          </div>
        `;

        sendMail({
          to: citizenUser.email,
          subject: emailSubject,
          text: emailText,
          html: emailHtml,
        }).catch((err) => {
          console.warn(`[Mailer] Failed to send status email to ${citizenUser.email}:`, err.message);
        });
      }
    } catch (err) {
      console.warn('[Notification] Failed to dispatch external notifications:', err.message);
    }
  })();

  return updatedRequest;
}

module.exports = {
  transitionRequestStatus,
};
