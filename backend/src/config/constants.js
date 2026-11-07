/**
 * System-Wide Constants & Enumerations
 * Follows snake_case values for consistent database storage and API responses
 */

const ROLES = Object.freeze({
  ADMIN: 'admin',
  STAFF: 'staff',
  CITIZEN: 'citizen',
});

const REQUEST_STATUSES = Object.freeze({
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

const VALIDITY_STATUSES = Object.freeze({
  VALID: 'valid',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
});

// Requirement 6: Added 'waived' payment status
const PAYMENT_STATUSES = Object.freeze({
  FREE: 'free',
  UNPAID: 'unpaid',
  PAID: 'paid',
  WAIVED: 'waived',
});

const VERIFICATION_STATUSES = Object.freeze({
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
});

const VOTER_STATUSES = Object.freeze({
  REGISTERED: 'registered',
  UNREGISTERED: 'unregistered',
});

const NOTIFICATION_CHANNELS = Object.freeze({
  SYSTEM: 'system',
  EMAIL: 'email',
  SMS: 'sms',
});

const STAFF_PERMISSIONS = Object.freeze([
  'can_review_requests',
  'can_prepare_documents',
  'can_print_documents',
  'can_release_documents',
  'can_verify_qr',
  'can_view_reports',
  'can_archive_records',
]);

// Requirement 1: Super Admin Key lockout limits
const SUPER_ADMIN_LOCKOUT = Object.freeze({
  MAX_ATTEMPTS: 5,
  LOCKOUT_MINUTES: 15,
});

// Requirement 1: Strictly allowlisted CUSTOM_* variables writable to .env
// SU_ADMIN_KEY and DEFAULT_* keys are strictly forbidden from modification via API
const ALLOWED_CUSTOM_ENV_KEYS = Object.freeze([
  'CUSTOM_GOOGLE_CLIENT_ID',
  'CUSTOM_GOOGLE_CLIENT_SECRET',
  'CUSTOM_SMS_GATEWAY_URL',
  'CUSTOM_SMS_API_TOKEN',
  'CUSTOM_SMS_SENDER_ID',
  'CUSTOM_SMTP_HOST',
  'CUSTOM_SMTP_PORT',
  'CUSTOM_SMTP_SECURE',
  'CUSTOM_SMTP_USER',
  'CUSTOM_SMTP_PASS',
  'CUSTOM_SMTP_FROM_NAME',
  'CUSTOM_SMTP_FROM_EMAIL',
  'CUSTOM_RECAPTCHA_SITE_KEY',
  'CUSTOM_RECAPTCHA_SECRET_KEY',
  'CUSTOM_REST_API_SECRET_KEY',
]);

module.exports = {
  ROLES,
  REQUEST_STATUSES,
  VALIDITY_STATUSES,
  PAYMENT_STATUSES,
  VERIFICATION_STATUSES,
  VOTER_STATUSES,
  NOTIFICATION_CHANNELS,
  STAFF_PERMISSIONS,
  SUPER_ADMIN_LOCKOUT,
  ALLOWED_CUSTOM_ENV_KEYS,
};
