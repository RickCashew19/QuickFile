/**
 * Frontend utility for Philippine mobile number formatting, input cleansing, and normalization.
 */

/**
 * Strips letters and forbidden characters from user keystrokes in phone inputs,
 * preserving only digits, leading '+', spaces, and hyphens.
 *
 * @param {string} input
 * @returns {string}
 */
export function cleanPhoneInput(input) {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trimStart();
  const startsWithPlus = trimmed.startsWith('+');
  const allowed = input.replace(/[^\d\s-]/g, '');
  return startsWithPlus && !allowed.startsWith('+') ? '+' + allowed : allowed;
}

/**
 * Normalizes any valid Philippine mobile phone format into standardized outputs.
 * Accepts:
 * - 09171234567, 0917 123 4567, 0917-123-4567
 * - +63 917 123 4567, +639171234567, 639171234567
 * - 9171234567, 917 123 4567
 *
 * @param {string} input
 * @returns {{ isValid: boolean, local: string, display: string, intl: string, e164: string }}
 */
export function normalizePhilippinePhone(input) {
  if (!input || typeof input !== 'string') {
    return { isValid: false, local: '', display: '', intl: '', e164: '' };
  }

  // Strip all non-digit characters
  let digits = input.replace(/\D/g, '');

  // Convert local variations to 12-digit international format (639XXXXXXXXX)
  if (digits.startsWith('09') && digits.length === 11) {
    digits = '63' + digits.substring(1);
  } else if (digits.startsWith('9') && digits.length === 10) {
    digits = '63' + digits;
  }

  // Validate strict Philippine mobile pattern (639 followed by 9 digits)
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
    intl: digits,                         // '639171234567' (for SMS gateway)
    e164: '+' + digits,                   // '+639171234567'
  };
}

/**
 * Formats a phone string into standard display representation '09XX XXX XXXX'.
 *
 * @param {string} input
 * @returns {string}
 */
export function formatPhoneDisplay(input) {
  const norm = normalizePhilippinePhone(input);
  return norm.isValid ? norm.display : (input || '');
}
