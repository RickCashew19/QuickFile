/**
 * HTML-escape user-supplied strings to prevent HTML injection in emails and HTML contexts.
 * Escapes &, <, >, ", and ' characters per OWASP recommendations.
 *
 * @param {*} value - The input value to escape
 * @returns {string} - Escaped string, or empty string if null/undefined
 */
function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { escapeHtml };
