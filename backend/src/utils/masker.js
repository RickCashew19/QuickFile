/**
 * Mask sensitive secrets for public display
 * Never exposes the raw secret string to the client
 * 
 * @param {string} secret - Raw secret string
 * @returns {string} Masked string or empty string
 */
function maskSecret(secret) {
  if (!secret || typeof secret !== 'string') return '';
  const trimmed = secret.trim();
  if (trimmed.length === 0) return '';
  if (trimmed.length <= 6) return '••••••••';
  return `${trimmed.slice(0, 3)}••••••••${trimmed.slice(-3)}`;
}

module.exports = {
  maskSecret,
};
