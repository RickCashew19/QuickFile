import { useState, useEffect } from 'react';
import { Modal } from '../../../components/shared/Modal';
import { Button } from '../../../components/shared/Button';
import { Input } from '../../../components/shared/Input';
import { Alert } from '../../../components/shared/Alert';
import { cleanPhoneInput, normalizePhilippinePhone } from '../../../utils/phoneUtil';

export function StaffFormModal({ isOpen, onClose, onSave, staff = null, isSaving = false }) {
  const isEditing = Boolean(staff);

  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    phone: '',
    employee_id: '',
    position: '',
    department: '',
    password: '',
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    if (staff) {
      setFormData({
        email: staff.email || '',
        full_name: staff.full_name || '',
        phone: staff.phone || staff.detail?.contact_number || '',
        employee_id: staff.detail?.employee_id || '',
        position: staff.detail?.position || 'Barangay Staff',
        department: staff.detail?.department || 'General Services',
        password: '',
      });
    } else {
      setFormData({
        email: '',
        full_name: '',
        phone: '',
        employee_id: '',
        position: 'Barangay Staff',
        department: 'General Services',
        password: '',
      });
    }
    setError(null);
  }, [staff, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    const sanitized = name === 'phone' ? cleanPhoneInput(value) : value;
    setFormData((prev) => ({ ...prev, [name]: sanitized }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!formData.full_name.trim() || formData.full_name.trim().length < 2) {
      setError('Full name must be at least 2 characters.');
      return;
    }

    let normalizedPhone = '';
    if (formData.phone && formData.phone.trim()) {
      const norm = normalizePhilippinePhone(formData.phone);
      if (!norm.isValid) {
        setError('Please enter a valid Philippine mobile number (e.g., 0917 123 4567 or +639171234567).');
        return;
      }
      normalizedPhone = norm.local;
    }

    if (!isEditing) {
      if (!formData.email.trim() || !formData.email.includes('@')) {
        setError('Valid email address is required.');
        return;
      }
      if (!formData.password || formData.password.length < 8) {
        setError('Initial password must be at least 8 characters with letters and numbers.');
        return;
      }
    }

    try {
      await onSave({
        ...formData,
        phone: normalizedPhone || formData.phone,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save staff member.');
    }
  };

  const footer = (
    <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', width: '100%' }}>
      <Button variant="secondary" onClick={onClose} disabled={isSaving}>
        Cancel
      </Button>
      <Button variant="primary" onClick={handleSubmit} loading={isSaving}>
        {isEditing ? 'Save Changes' : 'Provision Account'}
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Staff Account' : 'Provision Staff Account'}
      size="md"
      footer={footer}
      preventBackdropClose={true}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {error && <Alert variant="danger">{error}</Alert>}

        <Input
          label="Full Name"
          name="full_name"
          value={formData.full_name}
          onChange={handleChange}
          required
          placeholder="Juan Dela Cruz"
        />

        {!isEditing && (
          <Input
            label="Email Address"
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            placeholder="staff@quickfile.gov.ph"
          />
        )}

        <div className="qf-grid-2col">
          <Input
            label="Employee ID"
            name="employee_id"
            value={formData.employee_id}
            onChange={handleChange}
            placeholder="EMP-2026-001"
          />
          <Input
            label="Contact Phone"
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            placeholder="0917 123 4567"
            helpText="Accepts 11-digit local (09XX) or international (+639XX) formats."
          />
        </div>

        <div className="qf-grid-2col">
          <Input
            label="Position"
            name="position"
            value={formData.position}
            onChange={handleChange}
            placeholder="Desk Officer"
          />
          <Input
            label="Department"
            name="department"
            value={formData.department}
            onChange={handleChange}
            placeholder="General Services"
          />
        </div>

        {!isEditing && (
          <Input
            label="Initial Password"
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
            placeholder="At least 8 chars with letter & digit"
          />
        )}
      </form>
    </Modal>
  );
}
