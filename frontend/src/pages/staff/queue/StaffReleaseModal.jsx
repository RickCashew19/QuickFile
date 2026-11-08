import { useState } from 'react';
import { Modal } from '../../../components/shared/Modal';
import { Button } from '../../../components/shared/Button';
import { Input } from '../../../components/shared/Input';
import { Select } from '../../../components/shared/Select';
import { PAYMENT_STATUSES } from '../../../config/constants';
import { formatCurrency } from '../../../utils/formatters';

export function StaffReleaseModal({
  isOpen,
  onClose,
  onConfirm,
  request,
  loading = false,
}) {
  const fee = request?.fee || 0;
  const isFeeBearing = fee > 0;

  const [paymentStatus, setPaymentStatus] = useState(PAYMENT_STATUSES.PAID);
  const [paymentReference, setPaymentReference] = useState('');
  const [waiverReason, setWaiverReason] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isFeeBearing) {
      if (paymentStatus === PAYMENT_STATUSES.WAIVED && !waiverReason.trim()) {
        setError('Please state the specific reason for fee waiver.');
        return;
      }
      onConfirm({
        payment_status: paymentStatus,
        payment_reference: paymentReference.trim(),
        waiver_reason: waiverReason.trim(),
      });
    } else {
      onConfirm({
        payment_status: PAYMENT_STATUSES.FREE,
      });
    }
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  const footer = (
    <>
      <Button variant="secondary" onClick={handleClose} disabled={loading}>
        Cancel
      </Button>
      <Button variant="primary" onClick={handleSubmit} loading={loading}>
        Confirm & Release
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Release Official Document"
      size="md"
      footer={footer}
      preventBackdropClose={true}
    >
      <form onSubmit={handleSubmit} className="qf-release-form">
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)' }}>
          Confirm handover of <strong>{request?.document_type_id?.name || 'document'}</strong> to{' '}
          <strong>{request?.citizen_id?.full_name || 'resident'}</strong>.
        </p>

        {isFeeBearing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ background: 'var(--color-surface-hover)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
              <strong>Document Fee:</strong> {formatCurrency(fee)}
            </div>

            <Select
              label="Payment Confirmation *"
              name="payment_status"
              value={paymentStatus}
              options={[
                { value: PAYMENT_STATUSES.PAID, label: 'Collected / Paid' },
                { value: PAYMENT_STATUSES.WAIVED, label: 'Exempted / Waived' },
              ]}
              onChange={(e) => {
                setPaymentStatus(e.target.value);
                setError('');
              }}
              disabled={loading}
            />

            {paymentStatus === PAYMENT_STATUSES.PAID ? (
              <Input
                label="Official Receipt / Reference No. (Optional)"
                name="payment_reference"
                value={paymentReference}
                placeholder="e.g. OR-84729"
                onChange={(e) => setPaymentReference(e.target.value)}
                disabled={loading}
              />
            ) : (
              <Input
                label="Waiver Reason *"
                name="waiver_reason"
                value={waiverReason}
                placeholder="e.g. Senior citizen ordinance, First Time Jobseeker RA 11261"
                onChange={(e) => {
                  setWaiverReason(e.target.value);
                  if (error) setError('');
                }}
                error={error}
                required
                disabled={loading}
              />
            )}
          </div>
        ) : (
          <p style={{ color: 'var(--color-success)', fontWeight: 500 }}>
            This document is marked as standard free issuance. No payment is required.
          </p>
        )}
      </form>
    </Modal>
  );
}
