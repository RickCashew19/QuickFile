/**
 * Utility for flexible Philippine phone number parsing, validation, and normalization.
 * Follows the robustness principle: accepts any standard user format, standardizes storage.
 *
 * Supported formats:
 * - Local 11 digits: '09171234567', '0917 123 4567', '0917-123-4567'
 * - International 12/13 digits: '+639171234567', '+63 917 123 4567', '639171234567'
 * - Local 10 digits (without leading zero): '9171234567', '917 123 4567'
 */

function normalizePhilippinePhone(input) {
  if (!input || typeof input !== 'string') {
    return { isValid: false, local: '', display: '', intl: '', e164: '' };
  }

  // 1. Strip all non-digit characters
  let digits = input.replace(/\D/g, '');

  // 2. Map local representations to 12-digit international format (639XXXXXXXXX)
  if (digits.startsWith('09') && digits.length === 11) {
    digits = '63' + digits.substring(1);
  } else if (digits.startsWith('9') && digits.length === 10) {
    digits = '63' + digits;
  }

  // 3. Strict Philippine mobile validation (starts with 639 and is exactly 12 digits)
  const isValid = /^639\d{9}$/.test(digits);

  if (!isValid) {
    return { isValid: false, local: '', display: '', intl: '', e164: '' };
  }

  const localPart = digits.substring(2); // '9171234567'
  const local = '0' + localPart;         // '09171234567'
  const display = `0${localPart.substring(0, 3)} ${localPart.substring(3, 6)} ${localPart.substring(6)}`; // '0917 123 4567'

  return {
    isValid: true,
    local,
    display,
    intl: digits,                         // '639171234567' (PhilSMS format)
    e164: '+' + digits,                   // '+639171234567'
  };
}

module.exports = {
  normalizePhilippinePhone,
};
