/**
 * QuickFile Request Workflow State Machine
 *
 * Implements role- and permission-gated transitions strictly aligned with:
 * 1. backend/src/config/constants.js lines 28-58 (ALLOWED_STATUS_TRANSITIONS)
 * 2. backend/src/modules/staff/staff.routes.js lines 61-108 (requirePermission guards)
 *
 * Backend Rule Mapping & Citations:
 * - pending: review (can_review_requests, line 64), reject (can_review_requests, line 76)
 * - under_review: approve (can_review_requests, line 70), reject (can_review_requests, line 76)
 * - approved: prepare (can_prepare_documents, line 82), reject (can_review_requests, line 76)
 * - in_preparation: issue (can_prepare_documents, line 88 - NOT can_print_documents)
 * - ready_for_pickup: print (can_print_documents, line 94 - link action), release (can_release_documents, line 100 - transition)
 * - released: print (can_print_documents, line 94 - link action), archive (can_archive_records, line 106 - transition)
 * - rejected & cancelled: archive (can_archive_records, line 106 - transition)
 * - archived: terminal state, no actions allowed
 *
 * Each action object contains:
 * - id: unique action string ('review' | 'approve' | 'reject' | 'prepare' | 'issue' | 'print' | 'release' | 'archive')
 * - label: human-readable action label
 * - kind: 'transition' (invokes API state transition) or 'link' (navigates to view/print page)
 * - variant: UI button theme variant ('primary' | 'secondary' | 'success' | 'danger')
 * - nextStatus: target status after transition (for kind: 'transition')
 * - href: target URL path (for kind: 'link')
 * - requiredPermission: staff permission key required (bypassed for role: 'admin')
 */

import { REQUEST_STATUSES, STAFF_PERMISSIONS, ROLES } from '../config/constants';

/**
 * Computes available workflow actions for a given request, user permissions, and role.
 *
 * @param {object} request - Request object containing at least a `status` field and `_id` / `id`
 * @param {object|Array} permissions - Staff permission flags map or array of granted strings
 * @param {string} [role='staff'] - User role: 'admin', 'staff', or 'citizen'
 * @returns {Array<{ id: string, label: string, kind: 'transition'|'link', variant: string, nextStatus?: string, href?: string, requiredPermission: string }>}
 */
export function getAvailableActions(request, permissions = {}, role = 'staff', issuedDocument = null) {
  if (!request || !request.status) {
    return [];
  }

  const isAdmin = role === ROLES.ADMIN || role === 'admin';
  const hasPerm = (permKey) => {
    if (isAdmin) return true;
    if (!permissions) return false;
    if (Array.isArray(permissions)) {
      return permissions.includes(permKey);
    }
    return Boolean(permissions[permKey]);
  };

  const status = String(request.status).toLowerCase();
  const requestId = request._id || request.id || '';
  const actions = [];

  const issuedDoc = issuedDocument || request.issued_document || request.issuedDocument;
  const hasCustomTemplate = Boolean(
    issuedDoc &&
    issuedDoc.template_version !== null &&
    issuedDoc.template_version !== undefined
  );

  switch (status) {
    case REQUEST_STATUSES.PENDING:
      if (hasPerm(STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS)) {
        actions.push({
          id: 'review',
          label: 'Start Review',
          kind: 'transition',
          variant: 'primary',
          nextStatus: REQUEST_STATUSES.UNDER_REVIEW,
          requiredPermission: STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS,
        });
        actions.push({
          id: 'reject',
          label: 'Reject Request',
          kind: 'transition',
          variant: 'danger',
          nextStatus: REQUEST_STATUSES.REJECTED,
          requiredPermission: STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS,
        });
      }
      break;

    case REQUEST_STATUSES.UNDER_REVIEW:
      if (hasPerm(STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS)) {
        actions.push({
          id: 'approve',
          label: 'Approve Application',
          kind: 'transition',
          variant: 'success',
          nextStatus: REQUEST_STATUSES.APPROVED,
          requiredPermission: STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS,
        });
        actions.push({
          id: 'reject',
          label: 'Reject Request',
          kind: 'transition',
          variant: 'danger',
          nextStatus: REQUEST_STATUSES.REJECTED,
          requiredPermission: STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS,
        });
      }
      break;

    case REQUEST_STATUSES.APPROVED:
      if (hasPerm(STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS)) {
        actions.push({
          id: 'prepare',
          label: 'Prepare Document',
          kind: 'transition',
          variant: 'primary',
          nextStatus: REQUEST_STATUSES.IN_PREPARATION,
          requiredPermission: STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS,
        });
      }
      if (hasPerm(STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS)) {
        actions.push({
          id: 'reject',
          label: 'Reject Request',
          kind: 'transition',
          variant: 'danger',
          nextStatus: REQUEST_STATUSES.REJECTED,
          requiredPermission: STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS,
        });
      }
      break;

    case REQUEST_STATUSES.IN_PREPARATION:
      // staff.routes.js:88 POST /requests/:id/issue uses requirePermission('can_prepare_documents')
      if (hasPerm(STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS)) {
        actions.push({
          id: 'issue',
          label: 'Issue & Generate Certificate',
          kind: 'transition',
          variant: 'primary',
          nextStatus: REQUEST_STATUSES.READY_FOR_PICKUP,
          requiredPermission: STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS,
        });
      }
      break;

    case REQUEST_STATUSES.READY_FOR_PICKUP:
      // staff.routes.js:94 GET /requests/:id/print-data uses requirePermission('can_print_documents')
      if (hasPerm(STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS)) {
        actions.push({
          id: 'print',
          label: 'Print Certificate',
          kind: 'link',
          variant: 'secondary',
          href: requestId ? `/staff/requests/${requestId}/print` : '#',
          requiredPermission: STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS,
        });
        if (hasCustomTemplate) {
          actions.push({
            id: 'download_docx',
            label: 'Download certificate (DOCX)',
            kind: 'download',
            variant: 'secondary',
            hint: 'Open in Word to print',
            requiredPermission: STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS,
          });
        }
      }
      // staff.routes.js:100 POST /requests/:id/release uses requirePermission('can_release_documents')
      if (hasPerm(STAFF_PERMISSIONS.CAN_RELEASE_DOCUMENTS)) {
        actions.push({
          id: 'release',
          label: 'Release Document',
          kind: 'transition',
          variant: 'success',
          nextStatus: REQUEST_STATUSES.RELEASED,
          requiredPermission: STAFF_PERMISSIONS.CAN_RELEASE_DOCUMENTS,
        });
      }
      break;

    case REQUEST_STATUSES.RELEASED:
      if (hasPerm(STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS)) {
        actions.push({
          id: 'print',
          label: 'Print Certificate',
          kind: 'link',
          variant: 'secondary',
          href: requestId ? `/staff/requests/${requestId}/print` : '#',
          requiredPermission: STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS,
        });
        if (hasCustomTemplate) {
          actions.push({
            id: 'download_docx',
            label: 'Download certificate (DOCX)',
            kind: 'download',
            variant: 'secondary',
            hint: 'Open in Word to print',
            requiredPermission: STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS,
          });
        }
      }
      // staff.routes.js:106 POST /requests/:id/archive uses requirePermission('can_archive_records')
      if (hasPerm(STAFF_PERMISSIONS.CAN_ARCHIVE_RECORDS)) {
        actions.push({
          id: 'archive',
          label: 'Archive Record',
          kind: 'transition',
          variant: 'secondary',
          nextStatus: REQUEST_STATUSES.ARCHIVED,
          requiredPermission: STAFF_PERMISSIONS.CAN_ARCHIVE_RECORDS,
        });
      }
      break;

    case REQUEST_STATUSES.REJECTED:
    case REQUEST_STATUSES.CANCELLED:
      if (hasPerm(STAFF_PERMISSIONS.CAN_ARCHIVE_RECORDS)) {
        actions.push({
          id: 'archive',
          label: 'Archive Record',
          kind: 'transition',
          variant: 'secondary',
          nextStatus: REQUEST_STATUSES.ARCHIVED,
          requiredPermission: STAFF_PERMISSIONS.CAN_ARCHIVE_RECORDS,
        });
      }
      break;

    case REQUEST_STATUSES.ARCHIVED:
    default:
      // Terminal states have no workflow transitions.
      break;
  }

  // Provide dual support: standard Array methods plus convenience helpers
  Object.defineProperty(actions, 'includes', {
    value: function (actionId) {
      return this.some((act) => (typeof act === 'object' && act !== null ? act.id === actionId : act === actionId));
    },
    configurable: true,
    writable: true,
  });

  return actions;
}
