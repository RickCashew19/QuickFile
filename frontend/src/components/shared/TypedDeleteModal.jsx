import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import { Alert } from './Alert';
import { Icon } from './Icon';

/**
 * Reusable Typed Deletion Confirmation Modal
 * Requires the user to explicitly type "DELETE" to prevent accidental data destruction.
 */
export function TypedDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Permanent Deletion',
  itemName = 'this item',
  warningMessage = 'This action is irreversible and will permanently delete all associated records.',
  isDeleting = false,
  expectedKeyword = 'DELETE',
}) {
  const [typedText, setTypedText] = useState('');

  // Reset input when opened or closed
  useEffect(() => {
    if (isOpen) {
      setTypedText('');
    }
  }, [isOpen]);

  const isConfirmed = typedText.trim() === expectedKeyword;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isConfirmed && !isDeleting) {
      onConfirm();
    }
  };

  const footer = (
    <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
      <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
        Cancel
      </Button>
      <Button
        variant="danger"
        onClick={onConfirm}
        disabled={!isConfirmed || isDeleting}
        loading={isDeleting}
        iconLeft={<Icon name="trash" size={16} />}
      >
        Delete Permanently
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={footer}
      preventBackdropClose={isDeleting}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Alert variant="danger">
          <strong>Warning:</strong> You are about to permanently delete <strong>{itemName}</strong>. {warningMessage}
        </Alert>

        <div>
          <p style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
            To confirm this destructive action, please type{' '}
            <strong style={{ color: 'var(--color-danger)', letterSpacing: '0.05em' }}>{expectedKeyword}</strong> below:
          </p>
          <Input
            id="typed-delete-input"
            aria-label={`Type ${expectedKeyword} to confirm`}
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            placeholder={`Type ${expectedKeyword} here`}
            autoFocus
            disabled={isDeleting}
            autoComplete="off"
          />
        </div>
      </form>
    </Modal>
  );
}
