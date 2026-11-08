import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import { Alert } from './Alert';
import { Icon } from './Icon';

/**
 * Super Admin Authorization Key Modal
 * Enforces hardware-like step-up authentication on every sensitive settings modification or reset.
 * Strictly zeroes and clears key state from memory immediately after submission or dismissal.
 */
export function SuperAdminKeyModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Super Admin Authorization',
  description = 'Modifying or resetting environment integration parameters requires your Super Admin Key.',
  actionLabel = 'Authorize & Save',
  isSubmitting = false,
  errorMessage = null,
}) {
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  // Clear key whenever the modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setKey('');
      setShowKey(false);
    } else {
      setKey('');
    }
  }, [isOpen]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!key.trim() || isSubmitting) return;

    const providedKey = key.trim();
    // Zero out local component state immediately
    setKey('');

    // Deliver key to caller for immediate one-time network transmission
    onConfirm(providedKey);
  };

  const handleClose = () => {
    setKey('');
    setShowKey(false);
    onClose();
  };

  const footer = (
    <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
      <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
        Cancel
      </Button>
      <Button
        variant="primary"
        onClick={handleSubmit}
        disabled={!key.trim() || isSubmitting}
        loading={isSubmitting}
        iconLeft={<Icon name="shield" size={16} />}
      >
        {actionLabel}
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      size="sm"
      footer={footer}
      preventBackdropClose={true}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <p style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
          {description}
        </p>

        {errorMessage && (
          <Alert variant="danger">
            {errorMessage}
          </Alert>
        )}

        <div>
          <Input
            id="super-admin-key-input"
            label="Super Admin Key"
            type={showKey ? 'text' : 'password'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Enter authorization key"
            required
            autoFocus
            disabled={isSubmitting}
            autoComplete="off"
            suffix={
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 'var(--space-1)',
                  cursor: 'pointer',
                  color: 'var(--color-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                }}
                aria-label={showKey ? 'Hide key' : 'Show key'}
              >
                <Icon name={showKey ? 'eye-off' : 'eye'} size={18} />
              </button>
            }
          />
        </div>
      </form>
    </Modal>
  );
}
