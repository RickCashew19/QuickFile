/**
 * Redacts sensitive path segments from URLs before they are written to logs.
 * Verification codes and request tracking numbers should not end up in access
 * or error logs, where anyone with log access could replay them.
 */
function redactSensitiveUrl(url) {
  return String(url || '')
    // Public/staff QR verification codes: /api/v1/verify/:code, /api/v1/staff/verify/:code
    .replace(/(\/api\/v1\/(?:staff\/)?verify\/)[^/?#]+/gi, '$1[REDACTED]')
    // Citizen request tracking numbers: /api/v1/citizen/requests/:trackingNumber/status
    .replace(/(\/api\/v1\/citizen\/requests\/)[^/?#]+(\/status)/gi, '$1[REDACTED]$2');
}

module.exports = { redactSensitiveUrl };
