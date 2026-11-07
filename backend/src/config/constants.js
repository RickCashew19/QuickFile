/**
 * System-wide Constants & Enums
 */
const ROLES = Object.freeze({
  ADMIN: 'admin',
  STAFF: 'staff',
  CITIZEN: 'citizen',
});

const USER_STATUSES = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
});

const REQUEST_STATUSES = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  READY_FOR_PICKUP: 'ready_for_pickup',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

const PAYMENT_STATUSES = Object.freeze({
  FREE: 'free',
  UNPAID: 'unpaid',
  PAID: 'paid',
});

const NOTIFICATION_CHANNELS = Object.freeze({
  SYSTEM: 'system',
  EMAIL: 'email',
  SMS: 'sms',
});

const STAFF_PERMISSIONS = Object.freeze([
  'can_review_requests',
  'can_approve_requests',
  'can_issue_documents',
  'can_manage_residents',
  'can_view_reports',
  'can_manage_settings',
]);

const SUPER_ADMIN_PIN = Object.freeze({
  MIN_LENGTH: 6,
  MAX_LENGTH: 8,
  MAX_ATTEMPTS: 5,
  LOCKOUT_MINUTES: 15,
});

/**
 * List of keys that the Super Admin PIN endpoint is permitted to modify in .env
 * Prevents arbitrary injection into .env (e.g. PORT, MONGO_URI, JWT_SECRET cannot be changed via API)
 */
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
  USER_STATUSES,
  REQUEST_STATUSES,
  PAYMENT_STATUSES,
  NOTIFICATION_CHANNELS,
  STAFF_PERMISSIONS,
  SUPER_ADMIN_PIN,
  ALLOWED_ENV_SETTING_KEYS,
};
