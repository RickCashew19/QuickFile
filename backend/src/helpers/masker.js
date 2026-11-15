/**
 * Mask sensitive secrets for public display
 * Section D.5: Shows only the last 4 characters; fully hides secrets shorter than 9 characters.
 * 
 * @param {string} secret - Raw secret string
 * @returns {string} Masked string or empty string
 */
function maskSecret(secret) {
  if (!secret || typeof secret !== 'string') return '';
  const trimmed = secret.trim();
  if (trimmed.length === 0) return '';
  if (trimmed.length < 9) return '••••••••';
  return `••••••••${trimmed.slice(-4)}`;
}

module.exports = {
  maskSecret,
};
