import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../../../services/apiClient';
import { Icon } from '../../../components/shared/Icon';
import { Button } from '../../../components/shared/Button';
import { Modal } from '../../../components/shared/Modal';
import { Alert } from '../../../components/shared/Alert';
import { Loader } from '../../../components/shared/Loader';

export function AttachmentListCard({ attachments = [] }) {
  const [downloadingName, setDownloadingName] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewType, setPreviewType] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState(null);

  // Active blob URLs tracking for cleanup
  const activeBlobUrlsRef = useRef(new Set());

  // Cleanup all allocated object URLs on unmount
  useEffect(() => {
    const urls = activeBlobUrlsRef.current;
    return () => {
      urls.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignore cleanup errors on unmount
        }
      });
      urls.clear();
    };
  }, []);

  if (!attachments || attachments.length === 0) {
    return null;
  }

  const handleDownload = async (att) => {
    const filename = att.stored_filename || att.path;
    if (!filename) return;

    setDownloadingName(filename);
    setError(null);
    try {
      const { blob } = await apiClient.download(`/files/attachments/${encodeURIComponent(filename)}`);
      const url = URL.createObjectURL(blob);
      activeBlobUrlsRef.current.add(url);

      const a = document.createElement('a');
      a.href = url;
      a.download = att.original_name || filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => {
        URL.revokeObjectURL(url);
        activeBlobUrlsRef.current.delete(url);
      }, 1000);
    } catch (err) {
      setError(err.message || 'Failed to download attachment.');
    } finally {
      setDownloadingName(null);
    }
  };

  const handlePreview = async (att) => {
    const filename = att.stored_filename || att.path;
    if (!filename) return;

    setLoadingPreview(true);
    setError(null);
    setPreviewTitle(att.original_name || 'Attachment Preview');
    setPreviewType(att.mime_type || '');

    try {
      const { blob } = await apiClient.download(`/files/attachments/${encodeURIComponent(filename)}`);
      const url = URL.createObjectURL(blob);
      activeBlobUrlsRef.current.add(url);
      setPreviewUrl(url);
    } catch (err) {
      setError(err.message || 'Failed to load preview.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleClosePreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      activeBlobUrlsRef.current.delete(previewUrl);
      setPreviewUrl(null);
    }
    setPreviewTitle('');
  };

  return (
    <div className="qf-staff-card">
      <h2 className="qf-staff-card-title">
        <Icon name="upload" size={18} /> Uploaded Requirements ({attachments.length})
      </h2>

      {error && <Alert variant="danger" onClose={() => setError(null)}>{error}</Alert>}

      <ul className="qf-staff-attachments-list">
        {attachments.map((att, i) => {
          const filename = att.stored_filename || att.path;
          const isDownloading = downloadingName === filename;
          const isImage = att.mime_type?.startsWith('image/');
          const isPdf = att.mime_type === 'application/pdf';

          return (
            <li key={i} className="qf-staff-attachment-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Icon name="file" size={16} />
                <span className="qf-attachment-name">{att.original_name || filename}</span>
                <span className="qf-attachment-meta">
                  ({Math.round((att.file_size || 0) / 1024)} KB)
                </span>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {(isImage || isPdf) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePreview(att)}
                    disabled={Boolean(downloadingName) || loadingPreview}
                  >
                    Preview
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleDownload(att)}
                  loading={isDownloading}
                  disabled={Boolean(downloadingName)}
                >
                  Download
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Preview Modal */}
      {previewUrl && (
        <Modal
          isOpen={Boolean(previewUrl)}
          onClose={handleClosePreview}
          title={previewTitle}
          size="lg"
          footer={
            <Button variant="secondary" onClick={handleClosePreview}>
              Close Preview
            </Button>
          }
        >
          <div style={{ textAlign: 'center', minHeight: '300px' }}>
            {previewType?.startsWith('image/') ? (
              <img
                src={previewUrl}
                alt={previewTitle}
                style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
              />
            ) : previewType === 'application/pdf' ? (
              <iframe
                src={previewUrl}
                title={previewTitle}
                style={{ width: '100%', height: '70vh', border: 'none' }}
              />
            ) : (
              <p>Preview not supported for this file type.</p>
            )}
          </div>
        </Modal>
      )}

      {loadingPreview && (
        <div style={{ marginTop: 'var(--space-2)' }}>
          <Loader size="sm" text="Fetching attachment stream..." />
        </div>
      )}
    </div>
  );
}
