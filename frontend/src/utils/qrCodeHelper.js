/**
 * QR Code and Certificate Verification String Extraction Helper
 * Safely parses raw text or URLs scanned from QR codes or entered manually.
 */

export class QrExtractionError extends Error {
  constructor(message, isTrackingNumber = false) {
    super(message);
    this.name = 'QrExtractionError';
    this.isTrackingNumber = isTrackingNumber;
  }
}

/**
 * Extracts and normalizes the verification code from raw QR text or URL input
 *
 * @param {string} rawInput - The string decoded by QR scanner or entered by user
 * @returns {string} - Clean, uppercase certificate verification code
 * @throws {QrExtractionError}
 */
export function extractVerificationCode(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') {
    throw new QrExtractionError('No verification code was provided.');
  }

  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new QrExtractionError('No verification code was provided.');
  }

  let candidate = trimmed;

  // If input is an absolute or relative URL, extract the path component
  try {
    // Handle full URLs like https://quickfile.gov.ph/verify/CERT-1234?src=qr
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsedUrl = new URL(trimmed);
      const segments = parsedUrl.pathname.split('/').filter(Boolean);
      // The code should be the last non-empty segment of the pathname
      if (segments.length > 0) {
        candidate = segments[segments.length - 1];
      }
    } else if (trimmed.includes('/')) {
      // Relative path or slash-delimited input like "/verify/CERT-1234/"
      const segments = trimmed.split('?')[0].split('/').filter(Boolean);
      if (segments.length > 0) {
        candidate = segments[segments.length - 1];
      }
    }
  } catch {
    // Fall back to candidate string if URL parsing fails
  }

  // Remove any remaining query string or hash if present in bare inputs
  candidate = candidate.split('?')[0].split('#')[0].trim().toUpperCase();

  if (!candidate) {
    throw new QrExtractionError('Invalid verification code format. Please check the code and try again.');
  }

  // Explicitly check for Citizen Tracking Numbers
  if (candidate.startsWith('QF-') || trimmed.toUpperCase().includes('/REQUESTS/QF-')) {
    throw new QrExtractionError(
      'The code entered is a Request Tracking Number (QF-...). Tracking numbers are private to residents. Please log in to your Citizen Portal to view request status.',
      true
    );
  }

  // Basic sanity check: code must be alphanumeric with optional hyphens/underscores
  const codePattern = /^[A-Z0-9_-]{3,64}$/;
  if (!codePattern.test(candidate)) {
    throw new QrExtractionError('Invalid verification code format. Please check the code and try again.');
  }

  return candidate;
}
