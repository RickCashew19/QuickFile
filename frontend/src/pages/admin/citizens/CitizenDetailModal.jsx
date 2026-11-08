import { Modal } from '../../../components/shared/Modal';
import { Button } from '../../../components/shared/Button';
import { formatDate } from '../../../utils/formatters';

export function CitizenDetailModal({ isOpen, onClose, citizen }) {
  if (!citizen) return null;
  const p = citizen.profile || {};

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Resident Profile: ${citizen.full_name}`}
      size="md"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div className="qf-citizen-detail-grid">
          <div className="qf-detail-field">
            <span className="qf-detail-label">Full Name</span>
            <span className="qf-detail-value">{citizen.full_name}</span>
          </div>

          <div className="qf-detail-field">
            <span className="qf-detail-label">Email Address</span>
            <span className="qf-detail-value">{citizen.email}</span>
          </div>

          <div className="qf-detail-field">
            <span className="qf-detail-label">Contact Phone</span>
            <span className="qf-detail-value">{citizen.phone || p.contact_number || '—'}</span>
          </div>

          <div className="qf-detail-field">
            <span className="qf-detail-label">Purok / Zone</span>
            <span className="qf-detail-value">{p.purok_zone || '—'}</span>
          </div>

          <div className="qf-detail-field">
            <span className="qf-detail-label">Civil Status</span>
            <span className="qf-detail-value">{p.civil_status || '—'}</span>
          </div>

          <div className="qf-detail-field">
            <span className="qf-detail-label">Voter Status</span>
            <span className="qf-detail-value">
              {p.is_registered_voter === true
                ? 'Registered Barangay Voter'
                : p.is_registered_voter === false
                ? 'Non-Registered'
                : 'Not Indicated'}
            </span>
          </div>

          <div className="qf-detail-field">
            <span className="qf-detail-label">Registered Date</span>
            <span className="qf-detail-value">{formatDate(citizen.created_at)}</span>
          </div>

          <div className="qf-detail-field">
            <span className="qf-detail-label">Total Requests</span>
            <span className="qf-detail-value" style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-primary)' }}>
              {citizen.request_count || 0} filings
            </span>
          </div>
        </div>

        {p.address && (
          <div className="qf-detail-field">
            <span className="qf-detail-label">Residential Address</span>
            <span className="qf-detail-value">{p.address}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
