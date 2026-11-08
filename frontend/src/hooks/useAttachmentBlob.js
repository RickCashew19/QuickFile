import { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient } from '../services/apiClient';

/**
 * Custom hook for securely streaming, downloading, and previewing document attachments.
 * - Calls `const { blob } = await apiClient.download(path)`
 * - Automatically tracks all created object URLs and revokes them on unmount to prevent leaks
 * - Images preview inline; PDFs trigger download
 */
export function useAttachmentBlob() {
  const [downloadingName, setDownloadingName] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewName, setPreviewName] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState(null);

  // Active blob URLs tracking for cleanup
  const activeBlobUrlsRef = useRef(new Set());

  // Revoke all allocated object URLs on component unmount
  useEffect(() => {
    const urls = activeBlobUrlsRef.current;
    return () => {
      urls.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignore revocation errors on unmount
        }
      });
      urls.clear();
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const closePreview = useCallback(() => {
    if (previewUrl) {
      try {
        URL.revokeObjectURL(previewUrl);
      } catch {
        // Ignore revocation error
      }
      activeBlobUrlsRef.current.delete(previewUrl);
      setPreviewUrl(null);
    }
    setPreviewName('');
  }, [previewUrl]);

  /**
   * Downloads an attachment blob and triggers the browser save dialog.
   * @param {object} attachment - Attachment record with stored_filename/path and original_name
   */
  const downloadAttachment = useCallback(async (attachment) => {
    if (!attachment) return;
    const filename = attachment.stored_filename || attachment.path;
    if (!filename) return;

    setDownloadingName(filename);
    setError(null);

    try {
      const downloadPath = `/files/attachments/${encodeURIComponent(filename)}`;
      const { blob } = await apiClient.download(downloadPath);

      const url = URL.createObjectURL(blob);
      activeBlobUrlsRef.current.add(url);

      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.original_name || filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Clean up single download URL shortly after click
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignore revocation error
        }
        activeBlobUrlsRef.current.delete(url);
      }, 1000);
    } catch (err) {
      setError(err.message || 'Failed to download attachment.');
    } finally {
      setDownloadingName(null);
    }
  }, []);

  /**
   * Previews an attachment:
   * - Images are loaded into previewUrl for inline modal display.
   * - PDFs are downloaded directly per policy.
   * @param {object} attachment
   */
  const previewAttachment = useCallback(
    async (attachment) => {
      if (!attachment) return;
      const filename = attachment.stored_filename || attachment.path;
      if (!filename) return;

      const isPdf = attachment.mime_type === 'application/pdf' || /\.pdf$/i.test(attachment.original_name || filename);

      // PDFs trigger direct download per policy
      if (isPdf) {
        return downloadAttachment(attachment);
      }

      setLoadingPreview(true);
      setError(null);
      setPreviewName(attachment.original_name || filename);

      try {
        const downloadPath = `/files/attachments/${encodeURIComponent(filename)}`;
        const { blob } = await apiClient.download(downloadPath);

        // Revoke any previous preview URL
        if (previewUrl) {
          try {
            URL.revokeObjectURL(previewUrl);
          } catch {
            // Ignore
          }
          activeBlobUrlsRef.current.delete(previewUrl);
        }

        const url = URL.createObjectURL(blob);
        activeBlobUrlsRef.current.add(url);
        setPreviewUrl(url);
      } catch (err) {
        setError(err.message || 'Failed to load attachment preview.');
      } finally {
        setLoadingPreview(false);
      }
    },
    [previewUrl, downloadAttachment]
  );

  return {
    downloadAttachment,
    previewAttachment,
    previewUrl,
    previewName,
    closePreview,
    downloadingName,
    loadingPreview,
    error,
    clearError,
  };
}
