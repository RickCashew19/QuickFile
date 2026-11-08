import { REQUEST_STATUSES, STAFF_PERMISSIONS, ROLES } from '../config/constants';

/**
 * Pure function determining available actions for a document request based on
 * its lifecycle status, the user's role, and granted granular permissions.
 *
 * @param {Object} request - Request object containing at least a `status` field
 * @param {Object|Array} permissions - Staff user permissions map or array
 * @param {string} role - 'admin', 'staff', or 'citizen'
 * @returns {string[]} Array of action keys:
 *   ['review', 'approve', 'reject', 'prepare', 'issue', 'print', 'release', 'archive']
 */
export function getAvailableActions(request, permissions = {}, role = 'staff') {
  if (!request || !request.status) return [];

  const status = request.status;
  const isAdmin = role === ROLES.ADMIN || role === 'admin';

  const hasPerm = (permKey) => {
    if (isAdmin) return true;
    if (!permissions) return false;
    if (Array.isArray(permissions)) {
      return permissions.includes(permKey);
    }
    return Boolean(permissions[permKey]);
  };

  const actions = [];

  switch (status) {
    case REQUEST_STATUSES.PENDING:
      if (hasPerm(STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS)) {
        actions.push('review');
        actions.push('reject');
      }
      break;

    case REQUEST_STATUSES.UNDER_REVIEW:
      if (hasPerm(STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS)) {
        actions.push('approve');
        actions.push('reject');
      }
      break;

    case REQUEST_STATUSES.APPROVED:
      if (hasPerm(STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS)) {
        actions.push('prepare');
      }
      if (hasPerm(STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS)) {
        actions.push('reject');
      }
      break;

    case REQUEST_STATUSES.IN_PREPARATION:
      if (hasPerm(STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS)) {
        actions.push('issue');
      }
      break;

    case REQUEST_STATUSES.READY_FOR_PICKUP:
      if (hasPerm(STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS)) {
        actions.push('print');
      }
      if (hasPerm(STAFF_PERMISSIONS.CAN_RELEASE_DOCUMENTS)) {
        actions.push('release');
      }
      break;

    case REQUEST_STATUSES.RELEASED:
      if (hasPerm(STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS)) {
        actions.push('print');
      }
      if (hasPerm(STAFF_PERMISSIONS.CAN_ARCHIVE_RECORDS)) {
        actions.push('archive');
      }
      break;

    case REQUEST_STATUSES.REJECTED:
    case REQUEST_STATUSES.CANCELLED:
      if (hasPerm(STAFF_PERMISSIONS.CAN_ARCHIVE_RECORDS)) {
        actions.push('archive');
      }
      break;

    case REQUEST_STATUSES.ARCHIVED:
    default:
      // Terminal state: no further staff transitions allowed
      break;
  }

  return actions;
}
