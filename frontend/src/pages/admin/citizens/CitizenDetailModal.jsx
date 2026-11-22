import { useEffect, useState } from 'react';
import { Modal } from '../../../components/shared/Modal';
import { Button } from '../../../components/shared/Button';
import { Select } from '../../../components/shared/Select';
import { Alert } from '../../../components/shared/Alert';
import { adminService } from '../../../api/adminService';
import { formatDate } from '../../../utils/formatters';

const VOTER_LABELS = {
  registered: 'Registered Barangay Voter',
  unregistered: 'Non-Registered',
};

/**
 * Voter status is barangay-managed: only an admin can change it. Kept in its
 * own component so the modal itself stays free of state when no resident is
 * selected.
 */
function VoterStatusEditor({ citizen, onUpdated }) {
  const current = citizen.profile?.voter_status || '';
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setValue(current);
    setError(null);
  }, [current, citizen._id]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminService.updateCitizenVoterStatus(citizen._id, value);
      if (onUpdated) await onUpdated();
    } catch (err) {
      setError(err.message || 'Failed to update voter status.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px' }}>
          <Select
            label="Voter Registration Status"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            options={[
              { value: 'registered', label: 'Registered Barangay Voter' },
              { value: 'unregistered', label: 'Not Registered / Out of District' },
            ]}
            disabled={saving}
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={!value || value === current}
          loading={saving}
        >
          Save Voter Status
        </Button>
      </div>
      <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--font-xs)', color: 'var(--color-text-muted)' }}>
        Managed by the barangay. Changes are recorded in the audit log.
      </p>
      {error && (
        <div style={{ marginTop: 'var(--space-2)' }}>
          <Alert variant="danger">{error}</Alert>
        </div>
      )}
    </div>
  );
}

export function CitizenDetailModal({ isOpen, onClose, citizen, onUpdated }) {
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
            <span className="qf-detail-value">{VOTER_LABELS[p.voter_status] || 'Not Indicated'}</span>
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

        <VoterStatusEditor citizen={citizen} onUpdated={onUpdated} />
      </div>
    </Modal>
  );
}
