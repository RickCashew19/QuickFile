/**
 * Strict email address validation utility.
 * Enforces RFC 5321 length limits (max 254 characters) and standard format rules.
 */

// Strict RFC 5322-compatible email regex for web application inputs
const STRICT_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Validates an email address against strict format rules and 254-character RFC limit.
 *
 * @param {unknown} email - The email candidate to validate
 * @returns {boolean} - true if valid, false otherwise
 */
function isValidEmail(email) {
  if (typeof email !== 'string') {
    return false;
  }
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) {
    return false;
  }
  // Disallow consecutive dots in local part or domain
  if (trimmed.includes('..')) {
    return false;
  }
  // Local part cannot start or end with a dot, and cannot exceed 64 characters
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return false;
  }
  const localPart = trimmed.slice(0, atIndex);
  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.length > 64) {
    return false;
  }
  return STRICT_EMAIL_REGEX.test(trimmed);
}

module.exports = {
  isValidEmail,
  STRICT_EMAIL_REGEX,
};
