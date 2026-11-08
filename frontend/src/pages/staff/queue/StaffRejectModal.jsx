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

        <div className="qf-input-group">
          <label htmlFor="rejection-reason" className="qf-input-label">
            Rejection Reason <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <textarea
            id="rejection-reason"
            className="qf-input"
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
          />
          {validationError && (
            <span className="qf-input-error" role="alert">
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
