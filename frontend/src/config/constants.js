/**
 * Application Constants and Enum Mappings
 */

const envApiUrl = import.meta.env.VITE_API_URL;

function resolveApiBaseUrl() {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    // When accessing via network IP (e.g. 10.x.x.x, 192.168.x.x) on phones/other devices,
    // dynamically point API requests to the host machine's port 5000 so other devices can connect
    if (!isLocalhost) {
      if (envApiUrl && envApiUrl.includes('localhost')) {
        return envApiUrl.replace('localhost', hostname);
      }
      if (envApiUrl && envApiUrl.includes('127.0.0.1')) {
        return envApiUrl.replace('127.0.0.1', hostname);
      }
      if (!envApiUrl) {
        return `${window.location.protocol}//${hostname}:5000/api/v1`;
      }
    }
  }
  return envApiUrl || 'http://localhost:5000/api/v1';
}

export const API_BASE_URL = resolveApiBaseUrl();

export const ROLES = Object.freeze({
  CITIZEN: 'citizen',
  STAFF: 'staff',
  ADMIN: 'admin',
});

export const STAFF_PERMISSIONS = Object.freeze({
  CAN_REVIEW_REQUESTS: 'can_review_requests',
  CAN_PREPARE_DOCUMENTS: 'can_prepare_documents',
  CAN_PRINT_DOCUMENTS: 'can_print_documents',
  CAN_RELEASE_DOCUMENTS: 'can_release_documents',
  CAN_VERIFY_QR: 'can_verify_qr',
  CAN_VIEW_REPORTS: 'can_view_reports',
  CAN_ARCHIVE_RECORDS: 'can_archive_records',
});

export const REQUEST_STATUSES = Object.freeze({
  PENDING: 'pending',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  IN_PREPARATION: 'in_preparation',
  READY_FOR_PICKUP: 'ready_for_pickup',
  RELEASED: 'released',
  REJECTED: 'rejected',
  ARCHIVED: 'archived',
  CANCELLED: 'cancelled',
});

export const STATUS_METADATA = Object.freeze({
  [REQUEST_STATUSES.PENDING]: {
    label: 'Pending',
    variant: 'warning',
    description: 'Submitted and awaiting initial verification by staff.',
  },
  [REQUEST_STATUSES.UNDER_REVIEW]: {
    label: 'Under Review',
    variant: 'info',
    description: 'Currently being examined by barangay staff.',
  },
  [REQUEST_STATUSES.APPROVED]: {
    label: 'Approved',
    variant: 'info',
    description: 'Approved and queued for document preparation.',
  },
  [REQUEST_STATUSES.IN_PREPARATION]: {
    label: 'In Preparation',
    variant: 'primary',
    description: 'Certificate is being encoded and prepared.',
  },
  [REQUEST_STATUSES.READY_FOR_PICKUP]: {
    label: 'Ready for Pickup',
    variant: 'success',
    description: 'Ready to be claimed at the barangay hall.',
  },
  [REQUEST_STATUSES.RELEASED]: {
    label: 'Released',
    variant: 'success',
    description: 'Claimed and officially released to resident.',
  },
  [REQUEST_STATUSES.REJECTED]: {
    label: 'Rejected',
    variant: 'danger',
    description: 'Returned due to invalid requirements or discrepancy.',
  },
  [REQUEST_STATUSES.ARCHIVED]: {
    label: 'Archived',
    variant: 'neutral',
    description: 'Stored in long-term barangay records.',
  },
  [REQUEST_STATUSES.CANCELLED]: {
    label: 'Cancelled',
    variant: 'neutral',
    description: 'Cancelled by resident prior to review.',
  },
});

export const PAYMENT_STATUSES = Object.freeze({
  UNPAID: 'unpaid',
  PAID: 'paid',
  WAIVED: 'waived',
  FREE: 'free',
});

export const VALIDITY_STATUSES = Object.freeze({
  VALID: 'valid',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
});

