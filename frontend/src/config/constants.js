/**
 * Application Constants and Enum Mappings
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

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
