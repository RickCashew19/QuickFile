/**
 * Formats a Content-Disposition header with RFC 5987 UTF-8 encoding and ASCII fallback.
 *
 * @param {'attachment' | 'inline'} dispositionType
 * @param {string} filename
 * @returns {string}
 */
function formatContentDisposition(dispositionType, filename) {
  const asciiFallback = String(filename).replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encodedName = encodeURIComponent(String(filename)).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${dispositionType}; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`;
}

module.exports = {
  formatContentDisposition,
};
