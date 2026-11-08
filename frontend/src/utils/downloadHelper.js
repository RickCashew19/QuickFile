/**
 * Extracts filename from Content-Disposition header
 */
export function extractFilenameFromHeader(header, fallbackName = 'download') {
  if (!header || typeof header !== 'string') return fallbackName;

  // Try RFC 5987 syntax: filename*=UTF-8''encoded_name
  const rfcMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (rfcMatch && rfcMatch[1]) {
    try {
      return decodeURIComponent(rfcMatch[1]);
    } catch {
      return rfcMatch[1];
    }
  }

  // Standard quoted syntax: filename="sample.pdf"
  const quotedMatch = header.match(/filename="([^"]+)"/i);
  if (quotedMatch && quotedMatch[1]) {
    return quotedMatch[1];
  }

  // Bare syntax: filename=sample.pdf
  const bareMatch = header.match(/filename=([^;]+)/i);
  if (bareMatch && bareMatch[1]) {
    return bareMatch[1].trim();
  }

  return fallbackName;
}

/**
 * Triggers browser download of a binary Blob safely without opening popup windows
 */
export function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.style.display = 'none';
  link.href = url;
  link.setAttribute('download', filename);

  document.body.appendChild(link);
  link.click();

  // Clean up resource
  setTimeout(() => {
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }, 100);
}
