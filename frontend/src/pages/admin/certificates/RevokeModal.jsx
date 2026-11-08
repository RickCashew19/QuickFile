import { useState, useEffect } from 'react';
import { Modal } from '../../../components/shared/Modal';
import { Button } from '../../../components/shared/Button';
import { Input } from '../../../components/shared/Input';
import { Alert } from '../../../components/shared/Alert';

export function RevokeModal({ isOpen, onClose, onRevoke, cert, isRevoking = false }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!reason.trim() || reason.trim().length < 5 || reason.trim().length > 200) {
      setError('Revocation reason must be between 5 and 200 characters.');
      return;
    }

    try {
      await onRevoke(cert._id, reason.trim());
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to revoke issued document.');
    }
  };

  const footer = (
    <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
      <Button variant="secondary" onClick={onClose} disabled={isRevoking}>
        Cancel
      </Button>
      <Button variant="danger" onClick={handleSubmit} loading={isRevoking}>
        Revoke Document
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Revoke Certificate: ${cert?.certificate_number}`}
      size="sm"
      footer={footer}
      preventBackdropClose={true}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <p style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
          Revoking this document will immediately flag it as invalid on QR code scans and notify the citizen.
        </p>

        {error && <Alert variant="danger">{error}</Alert>}

        <Input
          label="Revocation Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          autoFocus
          placeholder="E.g., Issued based on fraudulent requirements"
          helperText="Between 5 and 200 characters"
        />
      </form>
    </Modal>
  );
}
