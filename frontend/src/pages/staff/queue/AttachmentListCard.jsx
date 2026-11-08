import { useAttachmentBlob } from '../../../hooks/useAttachmentBlob';
import { Icon } from '../../../components/shared/Icon';
import { Button } from '../../../components/shared/Button';
import { Modal } from '../../../components/shared/Modal';
import { Alert } from '../../../components/shared/Alert';
import { Loader } from '../../../components/shared/Loader';

/**
 * Renders attached supporting documents with authenticated download and image preview.
 * Delegated to useAttachmentBlob hook for lifecycle cleanup and URL revocation.
 * Follows design tokens with zero lucide-react or hardcoded non-standard styles.
 */
export function AttachmentListCard({ attachments = [] }) {
  const {
    downloadAttachment,
    previewAttachment,
    previewUrl,
    previewName,
    closePreview,
    downloadingName,
    loadingPreview,
    error,
    clearError,
  } = useAttachmentBlob();

  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <div className="qf-staff-card">
      <h2 className="qf-staff-card-title">
        <Icon name="upload" size={18} /> Uploaded Requirements ({attachments.length})
      </h2>

      {error && (
        <Alert variant="danger" onClose={clearError}>
          {error}
        </Alert>
      )}

      <ul className="qf-staff-attachments-list">
        {attachments.map((att, i) => {
          const filename = att.stored_filename || att.path;
          const isDownloading = downloadingName === filename;
          const isImage = att.mime_type?.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(att.original_name || '');
          const isPdf = att.mime_type === 'application/pdf' || /\.pdf$/i.test(att.original_name || '');

          return (
            <li key={att._id || filename || i} className="qf-staff-attachment-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Icon name={isImage ? 'image' : 'file'} size={16} />
                <span className="qf-attachment-name">{att.original_name || filename}</span>
                <span className="qf-attachment-meta">
                  ({Math.round((att.file_size || 0) / 1024)} KB)
                </span>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {isImage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => previewAttachment(att)}
                    disabled={Boolean(downloadingName) || loadingPreview}
                  >
                    Preview
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => (isPdf ? previewAttachment(att) : downloadAttachment(att))}
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

      {/* Image Preview Modal */}
      {previewUrl && (
        <Modal
          isOpen={Boolean(previewUrl)}
          onClose={closePreview}
          title={previewName || 'Attachment Preview'}
          size="lg"
          footer={
            <Button variant="secondary" onClick={closePreview}>
              Close Preview
            </Button>
          }
        >
          <div style={{ textAlign: 'center', minHeight: '240px' }}>
            <img
              src={previewUrl}
              alt={previewName || 'Attachment image preview'}
              style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
            />
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
