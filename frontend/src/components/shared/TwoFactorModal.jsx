import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import { Alert } from './Alert';
import { Icon } from './Icon';

/**
 * Two-Factor Authentication (2FA) Modal for Sensitive Security Settings
 * Enforces email verification code entry before applying API key modifications.
 */
export function TwoFactorModal({
  isOpen,
  onClose,
  onConfirm,
  emailMasked = 'administrator email',
  isSubmitting = false,
  errorMessage = null,
}) {
  const [code, setCode] = useState('');
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes (600s)

  useEffect(() => {
    if (isOpen) {
      setCode('');
      setTimeLeft(600);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, timeLeft]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  const handleSubmit = (e) => {
    e?.preventDefault();
    const cleanCode = code.replace(/\D/g, '').trim();
    if (cleanCode.length !== 6 || isSubmitting) return;
    onConfirm(cleanCode);
  };

  const handleClose = () => {
    setCode('');
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
        disabled={code.replace(/\D/g, '').length !== 6 || isSubmitting || timeLeft <= 0}
        loading={isSubmitting}
        iconLeft={<Icon name="shield" size={16} />}
      >
        Verify & Activate API Key
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Two-Factor Authentication (2FA)"
      size="sm"
      footer={footer}
      preventBackdropClose={true}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <p style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
          A 6-digit verification code has been dispatched to <strong>{emailMasked}</strong>. Enter the code to authorize and activate this API key.
        </p>

        {errorMessage && (
          <Alert variant="danger">
            {errorMessage}
          </Alert>
        )}

        <div>
          <Input
            id="two-factor-code-input"
            label="6-Digit Verification Code"
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 6);
              setCode(val);
            }}
            placeholder="000000"
            required
            autoFocus
            autoComplete="one-time-code"
            helperText={
              timeLeft > 0
                ? `Code expires in ${formattedTime}`
                : 'Code expired. Please cancel and initiate a new request.'
            }
          />
        </div>

        <div style={{ background: 'var(--color-bg-secondary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
          <p style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)', margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Icon name="alert" size={14} />
            <span>Maximum 3 verification attempts permitted before code invalidation.</span>
          </p>
        </div>
      </form>
    </Modal>
  );
}
