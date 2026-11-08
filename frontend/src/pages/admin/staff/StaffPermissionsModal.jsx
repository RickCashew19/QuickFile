import { useState, useEffect } from 'react';
import { Modal } from '../../../components/shared/Modal';
import { Button } from '../../../components/shared/Button';
import { Alert } from '../../../components/shared/Alert';
import { STAFF_PERMISSIONS } from '../../../config/constants';

const PERMISSION_CONFIG = [
  { key: STAFF_PERMISSIONS.CAN_REVIEW_REQUESTS, label: 'Review Requests', desc: 'Accept, reject, review citizen filings' },
  { key: STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS, label: 'Prepare Documents', desc: 'Process walk-ins and draft certificates' },
  { key: STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS, label: 'Print Certificates', desc: 'Render and print official certificate forms' },
  { key: STAFF_PERMISSIONS.CAN_RELEASE_DOCUMENTS, label: 'Release Documents', desc: 'Record payments and release issued docs' },
  { key: STAFF_PERMISSIONS.CAN_VERIFY_QR, label: 'Verify QR Codes', desc: 'Use scanner or code search to inspect status' },
  { key: STAFF_PERMISSIONS.CAN_VIEW_REPORTS, label: 'View & Export Reports', desc: 'Access operational reports and downloads' },
  { key: STAFF_PERMISSIONS.CAN_ARCHIVE_RECORDS, label: 'Archive Records', desc: 'Close out and archive completed files' },
];

export function StaffPermissionsModal({ isOpen, onClose, onSave, staff, isSaving = false }) {
  const [permissions, setPermissions] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    if (staff?.permissions) {
      const initial = {};
      PERMISSION_CONFIG.forEach(({ key }) => {
        initial[key] = Boolean(staff.permissions[key]);
      });
      setPermissions(initial);
    } else {
      const initial = {};
      PERMISSION_CONFIG.forEach(({ key }) => {
        initial[key] = false;
      });
      setPermissions(initial);
    }
    setError(null);
  }, [staff, isOpen]);

  const handleToggle = (key) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await onSave(staff._id, permissions);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update staff permissions.');
    }
  };

  const footer = (
    <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
      <Button variant="secondary" onClick={onClose} disabled={isSaving}>
        Cancel
      </Button>
      <Button variant="primary" onClick={handleSubmit} loading={isSaving}>
        Update Permissions
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Permissions: ${staff?.full_name || 'Staff'}`}
      size="md"
      footer={footer}
      preventBackdropClose={true}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <p style={{ fontSize: 'var(--font-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
          Configure granular workflow capabilities granted to this staff account.
        </p>

        {error && <Alert variant="danger">{error}</Alert>}

        <div className="qf-perm-grid">
          {PERMISSION_CONFIG.map(({ key, label, desc }) => (
            <label key={key} className="qf-perm-item">
              <input
                type="checkbox"
                checked={Boolean(permissions[key])}
                onChange={() => handleToggle(key)}
                disabled={isSaving}
              />
              <div>
                <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--font-sm)', color: 'var(--color-text)' }}>
                  {label}
                </div>
                <div style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
                  {desc}
                </div>
              </div>
            </label>
          ))}
        </div>
      </form>
    </Modal>
  );
}
