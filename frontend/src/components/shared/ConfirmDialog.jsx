import { Modal } from './Modal';
import { Button } from './Button';

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
  loading = false,
}) {
  const footer = (
    <>
      <Button variant="secondary" onClick={onClose} disabled={loading}>
        {cancelText}
      </Button>
      <Button
        variant={danger ? 'danger' : 'primary'}
        onClick={onConfirm}
        loading={loading}
      >
        {confirmText}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={footer}
      preventBackdropClose={loading}
    >
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-sm)' }}>
        {message}
      </p>
    </Modal>
  );
}
