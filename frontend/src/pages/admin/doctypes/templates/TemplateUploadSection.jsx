import { useState, useRef } from 'react';
import { adminService } from '../../../../services/adminService';
import { Button } from '../../../../components/shared/Button';
import { Icon } from '../../../../components/shared/Icon';
import { Alert } from '../../../../components/shared/Alert';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

/**
 * Upload Form for DOCX Certificate Templates
 * Enforces client constraints (.docx extension only, <=2 MB) and forwards server validation reports.
 */
export function TemplateUploadSection({
  docTypeId,
  documentTypeId,
  onUploadSuccess,
  onTemplateUploaded,
  onReport,
  setValidationReport,
}) {
  const targetDocTypeId = docTypeId || documentTypeId;
  const notifySuccess = onUploadSuccess || onTemplateUploaded || (() => {});
  const notifyReport = onReport || setValidationReport || (() => {});
  const [selectedFile, setSelectedFile] = useState(null);
  const [clientError, setClientError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    setClientError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    // Client Check 1: Extension must be .docx
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setClientError('Invalid file type. Only Microsoft Word (.docx) template files are allowed.');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Client Check 2: Max 2 MB size limit
    if (file.size > MAX_FILE_SIZE) {
      setClientError(`File size exceeds the 2 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB).`);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setClientError('Please select a valid .docx template file to upload.');
      return;
    }

    setUploading(true);
    setClientError(null);
    try {
      const res = await adminService.uploadDocumentTemplate(targetDocTypeId, selectedFile);
      if (res?.validation) {
        notifyReport(res.validation);
      }
      notifySuccess(res);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      // Server report may arrive on HTTP 400 inside ApiError.data (or ApiError.data.validation)
      const report = err.data?.validation || (err.data?.errors ? err.data : null) || err.code?.validation;
      if (report) {
        notifyReport(report);
      } else {
        setClientError(err.message || 'Template upload failed.');
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="qf-template-upload-section" style={{ padding: 'var(--space-3)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-bg)' }}>
      <h3 style={{ fontSize: 'var(--font-sm)', fontWeight: 'var(--font-semibold)', margin: '0 0 var(--space-2) 0', color: 'var(--color-text)' }}>
        Upload New Template Version (.docx)
      </h3>
      <p style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)', margin: '0 0 var(--space-3) 0' }}>
        Select a valid Microsoft Word .docx template (max 2 MB). New versions are saved in an inactive state until activated.
      </p>

      {clientError && <Alert variant="danger" onClose={() => setClientError(null)}>{clientError}</Alert>}

      <form onSubmit={handleUpload} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileChange}
          disabled={uploading}
          aria-label="Select DOCX Template File"
          style={{ fontSize: 'var(--font-sm)' }}
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={uploading}
          disabled={!selectedFile || uploading}
          iconLeft={<Icon name="upload" size={14} />}
        >
          {uploading ? 'Validating & Uploading...' : 'Upload & Validate Template'}
        </Button>
      </form>
    </div>
  );
}
