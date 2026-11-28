import { useState } from 'react';
import { Modal } from '../../../components/shared/Modal';
import { Button } from '../../../components/shared/Button';

export function StaffRejectModal({ isOpen, onClose, onConfirm, loading = false }) {
  const [reason, setReason] = useState('');
  const [validationError, setValidationError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setValidationError('Please provide a specific reason for rejection (at least 5 characters).');
      return;
    }
    setValidationError('');
    onConfirm(trimmed);
  };

  const handleClose = () => {
    setReason('');
    setValidationError('');
    onClose();
  };

  const footer = (
    <>
      <Button variant="secondary" onClick={handleClose} disabled={loading}>
        Cancel
      </Button>
      <Button variant="danger" onClick={handleSubmit} loading={loading}>
        Confirm Rejection
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Reject Document Request"
      size="md"
      footer={footer}
      preventBackdropClose={true}
    >
      <form onSubmit={handleSubmit} className="qf-reject-form">
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)' }}>
          Please specify the reason this request cannot be processed. The resident will be notified
          via email and within their portal.
        </p>

        <div className="qf-field" style={{ marginBottom: 0 }}>
          <label htmlFor="rejection-reason" className="qf-field__label">
            Rejection Reason <span className="qf-field__required">*</span>
          </label>
          <textarea
            id="rejection-reason"
            className="qf-field__input"
            rows={4}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (validationError) setValidationError('');
            }}
            placeholder="e.g. Incomplete proof of residency; signature mismatch on uploaded ID."
            disabled={loading}
            maxLength={500}
            required
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? 'rejection-reason-error' : undefined}
            style={{ resize: 'none', minHeight: '96px', lineHeight: 1.5 }}
          />
          {validationError && (
            <span id="rejection-reason-error" className="qf-field__error" role="alert">
              {validationError}
            </span>
          )}
          <span style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-muted)', alignSelf: 'flex-end' }}>
            {reason.length}/500
          </span>
        </div>
      </form>
    </Modal>
  );
}
