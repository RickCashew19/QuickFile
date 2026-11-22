import { useEffect, useState } from 'react';
import { Button } from './Button';
import { Select } from './Select';
import { Alert } from './Alert';
import './VoterStatusEditor.css';

/**
 * Reusable editor for a resident's barangay-managed voter registration status.
 * Role-agnostic: callers supply the save function (admin or staff service) and
 * the backend still enforces the appropriate role/permission.
 */
export function VoterStatusEditor({ currentStatus = '', onSave, onUpdated, disabled = false }) {
  const [value, setValue] = useState(currentStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setValue(currentStatus || '');
    setError(null);
  }, [currentStatus]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(value);
      if (onUpdated) await onUpdated();
    } catch (err) {
      setError(err.message || 'Failed to update voter status.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="qf-voter-editor">
      <div className="qf-voter-editor__row">
        <div className="qf-voter-editor__field">
          <Select
            label="Voter Registration Status"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            options={[
              { value: 'registered', label: 'Registered Barangay Voter' },
              { value: 'unregistered', label: 'Not Registered / Out of District' },
            ]}
            disabled={disabled || saving}
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={disabled || saving || !value || value === currentStatus}
          loading={saving}
        >
          Save Voter Status
        </Button>
      </div>
      <p className="qf-voter-editor__hint">
        Managed by the barangay. Changes are recorded in the audit log.
      </p>
      {error && (
        <div className="qf-voter-editor__error">
          <Alert variant="danger">{error}</Alert>
        </div>
      )}
    </div>
  );
}
