import { useState, useEffect } from 'react';
import { Modal } from '../../../components/shared/Modal';
import { Button } from '../../../components/shared/Button';
import { Input } from '../../../components/shared/Input';
import { Alert } from '../../../components/shared/Alert';
import { Icon } from '../../../components/shared/Icon';

export function DocTypeFormModal({ isOpen, onClose, onSave, docType = null, isSaving = false }) {
  const isEditing = Boolean(docType);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    fee: 0,
    processing_days: 1,
    is_active: true,
  });
  const [requirements, setRequirements] = useState([]);
  const [newReq, setNewReq] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (docType) {
      setFormData({
        name: docType.name || '',
        code: docType.code || '',
        description: docType.description || '',
        fee: docType.fee !== undefined ? docType.fee : 0,
        processing_days: docType.processing_days !== undefined ? docType.processing_days : 1,
        is_active: docType.is_active !== undefined ? docType.is_active : true,
      });
      setRequirements(Array.isArray(docType.requirements) ? [...docType.requirements] : []);
    } else {
      setFormData({
        name: '',
        code: '',
        description: '',
        fee: 0,
        processing_days: 1,
        is_active: true,
      });
      setRequirements([]);
    }
    setNewReq('');
    setError(null);
  }, [docType, isOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleAddRequirement = (e) => {
    e.preventDefault();
    if (newReq.trim()) {
      setRequirements((prev) => [...prev, newReq.trim()]);
      setNewReq('');
    }
  };

  const handleRemoveRequirement = (idx) => {
    setRequirements((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('Document name is required.');
      return;
    }
    if (!formData.code.trim()) {
      setError('Document code is required.');
      return;
    }

    try {
      await onSave({
        ...formData,
        fee: Number(formData.fee) || 0,
        processing_days: Math.max(1, parseInt(formData.processing_days, 10) || 1),
        requirements,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save document type.');
    }
  };

  const footer = (
    <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
      <Button variant="secondary" onClick={onClose} disabled={isSaving}>
        Cancel
      </Button>
      <Button variant="primary" onClick={handleSubmit} loading={isSaving}>
        {isEditing ? 'Save Changes' : 'Create Document Type'}
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edit: ${docType?.name}` : 'Create Document Type'}
      size="md"
      footer={footer}
      preventBackdropClose={isSaving}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {error && <Alert variant="danger">{error}</Alert>}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-3)' }}>
          <Input
            label="Document Name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            placeholder="Barangay Clearance"
          />
          <Input
            label="Code"
            name="code"
            value={formData.code}
            onChange={handleChange}
            required
            placeholder="BC"
            style={{ textTransform: 'uppercase' }}
          />
        </div>

        <Input
          label="Description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Brief description of the document purpose"
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <Input
            label="Standard Fee (PHP)"
            name="fee"
            type="number"
            min="0"
            step="1"
            value={formData.fee}
            onChange={handleChange}
            required
          />
          <Input
            label="Processing Time (Days)"
            name="processing_days"
            type="number"
            min="1"
            max="30"
            value={formData.processing_days}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label className="qf-field__label" style={{ marginBottom: 'var(--space-1)', display: 'block' }}>
            Document Requirements Checklist
          </label>
          <div className="qf-tag-input-container">
            {requirements.map((req, idx) => (
              <span key={idx} className="qf-tag-pill">
                <span>{req}</span>
                <button
                  type="button"
                  className="qf-tag-remove-btn"
                  onClick={() => handleRemoveRequirement(idx)}
                  aria-label={`Remove requirement ${req}`}
                >
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
            <div style={{ display: 'flex', flex: 1, gap: 'var(--space-1)' }}>
              <input
                type="text"
                value={newReq}
                onChange={(e) => setNewReq(e.target.value)}
                placeholder="Add requirement (e.g. Valid ID, Cedula)..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddRequirement(e);
                  }
                }}
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: 'var(--font-sm)',
                  flex: 1,
                  minWidth: '160px',
                }}
              />
              <Button type="button" size="sm" variant="ghost" onClick={handleAddRequirement}>
                Add
              </Button>
            </div>
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', marginTop: 'var(--space-2)' }}>
          <input
            type="checkbox"
            name="is_active"
            checked={formData.is_active}
            onChange={handleChange}
            style={{ width: 18, height: 18 }}
          />
          <span style={{ fontSize: 'var(--font-sm)', fontWeight: 'var(--font-medium)' }}>
            Active (Available for citizen requests in the service catalog)
          </span>
        </label>
      </form>
    </Modal>
  );
}
