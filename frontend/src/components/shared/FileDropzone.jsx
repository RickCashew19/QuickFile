import { useRef, useState } from 'react';
import { Icon } from './Icon';
import { formatFileSize } from '../../utils/formatters';
import './FileDropzone.css';

export function FileDropzone({
  files = [],
  onChange,
  maxFiles = 3,
  maxSizeBytes = 5 * 1024 * 1024, // 5MB
  acceptedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'],
  disabled = false,
  error = null,
  label = 'Upload Supporting Attachments',
}) {
  const fileInputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationError, setValidationError] = useState(null);

  const handleFiles = (incomingFiles) => {
    setValidationError(null);
    const newFiles = [...files];

    for (const file of incomingFiles) {
      if (newFiles.length >= maxFiles) {
        setValidationError(`You can only upload a maximum of ${maxFiles} attachments.`);
        break;
      }

      if (!acceptedMimeTypes.includes(file.type)) {
        setValidationError(`Invalid file type "${file.name}". Only JPG, PNG, and PDF files are allowed.`);
        continue;
      }

      if (file.size > maxSizeBytes) {
        setValidationError(`"${file.name}" exceeds the maximum allowable file size of ${formatFileSize(maxSizeBytes)}.`);
        continue;
      }

      newFiles.push(file);
    }

    onChange(newFiles);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleRemove = (indexToRemove) => {
    const updated = files.filter((_, idx) => idx !== indexToRemove);
    onChange(updated);
  };

  const currentError = error || validationError;

  return (
    <div className="qf-dropzone-container">
      {label && (
        <span className="qf-field__label" style={{ display: 'block', marginBottom: 'var(--space-1)' }}>
          {label}
        </span>
      )}

      <div
        className={`qf-dropzone ${isDragOver ? 'qf-dropzone--drag-over' : ''} ${disabled ? 'qf-dropzone--disabled' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current && fileInputRef.current.click()}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current && fileInputRef.current.click();
          }
        }}
        role="button"
        aria-label="Click or drag and drop files here to upload"
      >
        <span className="qf-dropzone__icon">
          <Icon name="upload" size={32} />
        </span>
        <span className="qf-dropzone__prompt">
          Click to choose files or drag and drop here
        </span>
        <span className="qf-dropzone__hint">
          Up to {maxFiles} files (JPG, PNG, PDF up to {formatFileSize(maxSizeBytes)} each)
        </span>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedMimeTypes.join(',')}
          disabled={disabled}
          className="qf-dropzone__input"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFiles(Array.from(e.target.files));
              e.target.value = '';
            }
          }}
        />
      </div>

      {currentError && (
        <p className="qf-field__error" style={{ marginTop: 'var(--space-2)' }} role="alert">
          {currentError}
        </p>
      )}

      {files.length > 0 && (
        <ul className="qf-file-list" aria-label="Attached files">
          {files.map((file, idx) => (
            <li key={`${file.name}-${idx}`} className="qf-file-item">
              <div className="qf-file-item__info">
                <Icon name="file" size={18} />
                <span className="qf-file-item__name">{file.name}</span>
                <span className="qf-file-item__size">({formatFileSize(file.size)})</span>
              </div>
              <button
                type="button"
                className="qf-file-item__remove"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(idx);
                }}
                disabled={disabled}
                aria-label={`Remove ${file.name}`}
              >
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
