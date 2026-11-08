/**
 * Allowed portal route prefixes for safe application redirects
 */
export const ALLOWED_PORTAL_PREFIXES = ['/citizen', '/staff', '/admin', '/verify'];

/**
 * Validates and returns a safe internal redirect path.
 * Protects against Open Redirect (CWE-601) vulnerabilities.
 *
 * Rejects:
 * - Non-string inputs
 * - Strings containing control characters (0x00 - 0x1F, 0x7F)
 * - Schemes (http:, https:, javascript:, data:, vbscript:)
 * - Protocol-relative paths (starting with //)
 * - Backslash bypass attempts (starting with /\ or containing \)
 * - URL-encoded bypasses (e.g., %2f%2f, %5c)
 * - Paths that do not match a known portal prefix
 *
 * @param {string|object} targetPath - The path string or location object to validate
 * @param {string|null} fallback - Value to return if invalid (default: null)
 * @returns {string|null} The sanitized, validated relative path with query/hash preserved
 */
export function getSafeRedirect(targetPath, fallback = null) {
  if (!targetPath) return fallback;

  let pathString = '';
  if (typeof targetPath === 'string') {
    pathString = targetPath.trim();
  } else if (typeof targetPath === 'object' && targetPath.pathname) {
    pathString = `${targetPath.pathname}${targetPath.search || ''}${targetPath.hash || ''}`.trim();
  } else {
    return fallback;
  }

  // 1. Must not contain control characters
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(pathString)) {
    return fallback;
  }

  // 2. Reject explicit schemes (e.g. javascript:, https:, http:, data:)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(pathString)) {
    return fallback;
  }

  // 3. Must start with a single "/" and not "//" or "/\"
  if (!pathString.startsWith('/') || pathString.startsWith('//') || pathString.startsWith('/\\')) {
    return fallback;
  }

  // 4. Must not contain any backslash anywhere
  if (pathString.includes('\\')) {
    return fallback;
  }

  // 5. Check encoded bypasses by inspecting decoded URI
  try {
    const decoded = decodeURIComponent(pathString);
    if (
      decoded.startsWith('//') ||
      decoded.startsWith('/\\') ||
      decoded.includes('\\') ||
      decoded.includes('/../') ||
      decoded.endsWith('/..') ||
      /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)
    ) {
      return fallback;
    }
  } catch {
    // Malformed URI encoding (e.g. invalid % sequences)
    return fallback;
  }

  // 6. Must match one of the known portal prefixes
  const matchesPrefix = ALLOWED_PORTAL_PREFIXES.some(
    (prefix) =>
      pathString === prefix ||
      pathString.startsWith(`${prefix}/`) ||
      pathString.startsWith(`${prefix}?`) ||
      pathString.startsWith(`${prefix}#`)
  );

  if (!matchesPrefix) {
    return fallback;
  }

  return pathString;
}
