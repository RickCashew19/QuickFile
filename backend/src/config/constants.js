/**
 * System-Wide Constants & Enumerations
 * Follows snake_case values for consistent database storage and API responses
 */

const ROLES = Object.freeze({
  ADMIN: 'admin',
  STAFF: 'staff',
  CITIZEN: 'citizen',
});

// Requirement 1: Updated request statuses (removed 'processing' and 'completed')
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

// Requirement 6: Issued document validity statuses
const VALIDITY_STATUSES = Object.freeze({
  VALID: 'valid',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
});

const PAYMENT_STATUSES = Object.freeze({
  FREE: 'free',
  UNPAID: 'unpaid',
  PAID: 'paid',
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

// Requirement 2: Cleaned staff permissions (settings are admin-only)
const STAFF_PERMISSIONS = Object.freeze([
  'can_review_requests',
  'can_prepare_documents',
  'can_print_documents',
  'can_release_documents',
  'can_verify_qr',
  'can_view_reports',
  'can_archive_records',
]);

const SUPER_ADMIN_PIN = Object.freeze({
  MIN_LENGTH: 6,
  MAX_LENGTH: 8,
  MAX_ATTEMPTS: 5,
  LOCKOUT_MINUTES: 15,
});

// Allowlisted .env keys for Super Admin PIN update endpoint
const ALLOWED_ENV_SETTING_KEYS = Object.freeze([
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
  SUPER_ADMIN_PIN,
  ALLOWED_ENV_SETTING_KEYS,
};
