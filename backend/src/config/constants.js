/**
 * System-Wide Constants & Enumerations
 * Follows snake_case values for consistent database storage and API responses
 */

// Section A: Standardized API Version Prefix
const API_PREFIX = '/api/v1';

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

// Section 2B: Strict Workflow State Transitions
const ALLOWED_STATUS_TRANSITIONS = Object.freeze({
  [REQUEST_STATUSES.PENDING]: Object.freeze([
    REQUEST_STATUSES.UNDER_REVIEW,
    REQUEST_STATUSES.REJECTED,
    REQUEST_STATUSES.CANCELLED,
  ]),
  [REQUEST_STATUSES.UNDER_REVIEW]: Object.freeze([
    REQUEST_STATUSES.APPROVED,
    REQUEST_STATUSES.REJECTED,
  ]),
  [REQUEST_STATUSES.APPROVED]: Object.freeze([
    REQUEST_STATUSES.IN_PREPARATION,
    REQUEST_STATUSES.REJECTED,
  ]),
  [REQUEST_STATUSES.IN_PREPARATION]: Object.freeze([
    REQUEST_STATUSES.READY_FOR_PICKUP,
  ]),
  [REQUEST_STATUSES.READY_FOR_PICKUP]: Object.freeze([
    REQUEST_STATUSES.RELEASED,
  ]),
  [REQUEST_STATUSES.RELEASED]: Object.freeze([
    REQUEST_STATUSES.ARCHIVED,
  ]),
  [REQUEST_STATUSES.REJECTED]: Object.freeze([
    REQUEST_STATUSES.ARCHIVED,
  ]),
  [REQUEST_STATUSES.CANCELLED]: Object.freeze([
    REQUEST_STATUSES.ARCHIVED,
  ]),
  [REQUEST_STATUSES.ARCHIVED]: Object.freeze([]),
});

const VALIDITY_STATUSES = Object.freeze({
  VALID: 'valid',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
});

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

const SUPER_ADMIN_LOCKOUT = Object.freeze({
  MAX_ATTEMPTS: 5,
  LOCKOUT_MINUTES: 15,
});

// Section: Centrally Configured Rate Limit Constants (15-minute window)
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const AUTH_LIMIT_MAX = 15; // Failed authentication attempts before 429
const POLLING_LIMIT_MAX = 600; // Lightweight status polling per user (40 polls/min)
const USER_API_LIMIT_MAX = 300; // General authenticated requests per user
const EXPORT_LIMIT_MAX = 10; // Report export operations per user
const PUBLIC_LIMIT_MAX = 60; // Unauthenticated public requests per IP

// Strictly allowlisted CUSTOM_* variables writable to .env
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
  API_PREFIX,
  ROLES,
  REQUEST_STATUSES,
  ALLOWED_STATUS_TRANSITIONS,
  VALIDITY_STATUSES,
  PAYMENT_STATUSES,
  VERIFICATION_STATUSES,
  VOTER_STATUSES,
  NOTIFICATION_CHANNELS,
  STAFF_PERMISSIONS,
  SUPER_ADMIN_LOCKOUT,
  ALLOWED_CUSTOM_ENV_KEYS,
  RATE_LIMIT_WINDOW_MS,
  AUTH_LIMIT_MAX,
  POLLING_LIMIT_MAX,
  USER_API_LIMIT_MAX,
  EXPORT_LIMIT_MAX,
  PUBLIC_LIMIT_MAX,
};
