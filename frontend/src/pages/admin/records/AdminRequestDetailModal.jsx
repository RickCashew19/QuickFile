import { Modal } from '../../../components/shared/Modal';
import { Button } from '../../../components/shared/Button';
import { StatusBadge } from '../../../components/shared/StatusBadge';
import { formatDate, formatCurrency } from '../../../utils/formatters';

export function AdminRequestDetailModal({ isOpen, onClose, request }) {
  if (!request) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Request Details: ${request.tracking_number}`}
      size="md"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Tracking Number
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'var(--font-bold)', color: 'var(--color-primary)' }}>
              {request.tracking_number}
            </div>
          </div>
          <StatusBadge status={request.status} />
        </div>

        <div className="qf-grid-2col">
          <div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>Citizen</div>
            <div style={{ fontWeight: 'var(--font-medium)' }}>{request.citizen_id?.full_name || request.citizen_name || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>Document Type</div>
            <div style={{ fontWeight: 'var(--font-medium)' }}>{request.document_type_id?.name || request.document_type_name || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>Purpose</div>
            <div>{request.purpose || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>Fee / Payment</div>
            <div style={{ fontWeight: 'var(--font-semibold)' }}>
              {formatCurrency(request.fee)} • {request.payment_status || 'unpaid'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>Submitted Date</div>
            <div>{formatDate(request.created_at)}</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>Copies</div>
            <div>{request.copies || 1} copy</div>
          </div>
        </div>

        {typeof request.processing_notes === 'string' && request.processing_notes.trim() && (
          <div>
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
              Internal Processing Notes
            </div>
            <pre
              style={{
                margin: 0,
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--color-surface-subtle)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--font-xs)',
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
              }}
            >
              {request.processing_notes}
            </pre>
          </div>
        )}
      </div>
    </Modal>
  );
}
