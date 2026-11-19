/**
 * Reusable password policy helpers for account creation and password resets.
 * Keeps validation logic out of services/controllers and never logs the password.
 */

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72; // bcrypt truncates beyond 72 bytes

// Small, practical denylist of commonly compromised passwords. A full breached-password
// corpus is intentionally avoided (no new dependency / large data file); this blocks the
// most frequent trivial choices while preserving the project's existing 8-72 char policy.
const COMMON_PASSWORDS = new Set([
  'password', 'password123', 'password1', 'passw0rd', 'p@ssw0rd', 'p@ssword',
  '12345678', '123456789', '1234567890', 'qwerty123', 'qwertyui', 'abc12345',
  'abc123456', 'letmein', 'welcome1', 'welcome123', 'admin123', 'admin1234',
  'iloveyou', '11111111', '00000000', '654321', '123123', 'qwerty', 'monkey',
  'dragon', 'sunshine', 'princess', 'football', 'baseball', 'trustno1',
  'password1234', 'changeme', 'secret123', 'test1234', 'user1234',
  'barangay123', 'quickfile123',
]);

/**
 * Normalizes a password for denylist comparison (lowercase, remove whitespace).
 * Returns an empty string for non-strings so callers treat them as invalid.
 */
function normalizeForComparison(password) {
  if (typeof password !== 'string') return '';
  return password.toLowerCase().replace(/\s+/g, '');
}

function isCommonlyCompromisedPassword(password) {
  const normalized = normalizeForComparison(password);
  if (!normalized) return false;
  return COMMON_PASSWORDS.has(normalized);
}

/**
 * Validates a new password against the project policy.
 * @returns {{ valid: boolean, message: string|null }}
 */
function validatePasswordPolicy(password) {
  if (typeof password !== 'string' || password.length === 0) {
    return { valid: false, message: 'A new password is required.' };
  }
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return {
      valid: false,
      message: `Validation error: Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
    };
  }
  if (isCommonlyCompromisedPassword(password)) {
    return {
      valid: false,
      message: 'This password is too common. Please choose a stronger, unique password.',
    };
  }
  return { valid: true, message: null };
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  isCommonlyCompromisedPassword,
  validatePasswordPolicy,
};
