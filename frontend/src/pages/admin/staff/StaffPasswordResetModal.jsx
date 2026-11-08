import { useState, useEffect } from 'react';
import { Modal } from '../../../components/shared/Modal';
import { Button } from '../../../components/shared/Button';
import { Input } from '../../../components/shared/Input';
import { Alert } from '../../../components/shared/Alert';

export function StaffPasswordResetModal({ isOpen, onClose, onReset, staff, isResetting = false }) {
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setNewPassword('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const regex = /^(?=.*[a-zA-Z])(?=.*\d).{8,72}$/;
    if (!newPassword || !regex.test(newPassword)) {
      setError('Password must be 8-72 characters and contain both letters and numbers.');
      return;
    }

    try {
      await onReset(staff._id, newPassword);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to reset staff password.');
    }
  };

  const footer = (
    <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
      <Button variant="secondary" onClick={onClose} disabled={isResetting}>
        Cancel
      </Button>
      <Button variant="danger" onClick={handleSubmit} loading={isResetting}>
        Reset Password
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Reset Password: ${staff?.full_name || 'Staff'}`}
      size="sm"
      footer={footer}
      preventBackdropClose={isResetting}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <p style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
          Enter a new temporary password for <strong>{staff?.email}</strong>. Active sessions will be invalidated immediately.
        </p>

        {error && <Alert variant="danger">{error}</Alert>}

        <Input
          label="New Password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          autoFocus
          placeholder="Letters & numbers, min 8 chars"
        />
      </form>
    </Modal>
  );
}
