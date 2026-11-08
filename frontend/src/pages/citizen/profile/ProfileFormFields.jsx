import { Input } from '../../../components/shared/Input';
import { ProfileFormSection } from './ProfileFormSection';

export function ProfileFormFields({ formData, onChange, errors, isEditing }) {
  const handleChange = (field) => (e) => {
    onChange(field, e.target.value);
  };

  return (
    <div className="qf-profile-fields">
      {/* 1. Personal Information */}
      <ProfileFormSection
        title="Personal Information"
        description="Your official name and basic demographic details as shown in government records."
      >
        <Input
          label="First Name"
          value={formData.first_name || ''}
          onChange={handleChange('first_name')}
          required
          disabled={!isEditing}
          error={errors.first_name}
        />
        <Input
          label="Middle Name"
          value={formData.middle_name || ''}
          onChange={handleChange('middle_name')}
          disabled={!isEditing}
        />
        <Input
          label="Last Name"
          value={formData.last_name || ''}
          onChange={handleChange('last_name')}
          required
          disabled={!isEditing}
          error={errors.last_name}
        />
        <Input
          label="Suffix (e.g., Jr., III)"
          value={formData.suffix || ''}
          onChange={handleChange('suffix')}
          disabled={!isEditing}
        />

        <Input
          label="Birthdate"
          type="date"
          value={formData.birthdate ? formData.birthdate.slice(0, 10) : ''}
          onChange={handleChange('birthdate')}
          required
          disabled={!isEditing}
          error={errors.birthdate}
        />

        <div className="qf-field-group">
          <label className="qf-field-label" htmlFor="profile-gender">
            Gender <span className="qf-required">*</span>
          </label>
          <select
            id="profile-gender"
            className="qf-select-control"
            value={formData.gender || ''}
            onChange={handleChange('gender')}
            disabled={!isEditing}
          >
            <option value="">Select Gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
          {errors.gender && <span className="qf-field-error">{errors.gender}</span>}
        </div>

        <div className="qf-field-group">
          <label className="qf-field-label" htmlFor="profile-civil-status">
            Civil Status
          </label>
          <select
            id="profile-civil-status"
            className="qf-select-control"
            value={formData.civil_status || 'single'}
            onChange={handleChange('civil_status')}
            disabled={!isEditing}
          >
            <option value="single">Single</option>
            <option value="married">Married</option>
            <option value="widowed">Widowed</option>
            <option value="separated">Separated</option>
          </select>
        </div>
      </ProfileFormSection>

      {/* 2. Contact & Address */}
      <ProfileFormSection
        title="Contact & Residency Address"
        description="Location information used for barangay residency verification and communications."
      >
        <Input
          label="Mobile Phone / Contact Number"
          value={formData.contact_number || ''}
          onChange={handleChange('contact_number')}
          placeholder="09123456789"
          disabled={!isEditing}
          error={errors.contact_number}
        />
        <Input
          label="Purok / Zone"
          value={formData.purok_zone || ''}
          onChange={handleChange('purok_zone')}
          placeholder="Purok 3"
          disabled={!isEditing}
        />
        <Input
          label="Street Address / House No."
          value={formData.street_address || ''}
          onChange={handleChange('street_address')}
          disabled={!isEditing}
        />
        <Input
          label="Barangay"
          value={formData.barangay || ''}
          onChange={handleChange('barangay')}
          disabled={!isEditing}
        />
        <Input
          label="City / Municipality"
          value={formData.city || ''}
          onChange={handleChange('city')}
          disabled={!isEditing}
        />
        <Input
          label="Province"
          value={formData.province || ''}
          onChange={handleChange('province')}
          disabled={!isEditing}
        />
      </ProfileFormSection>

      {/* 3. Additional Details & Identification */}
      <ProfileFormSection
        title="Additional Details & Identification"
        description="Identification credentials to support fast-track approval."
      >
        <Input
          label="Occupation"
          value={formData.occupation || ''}
          onChange={handleChange('occupation')}
          disabled={!isEditing}
        />

        <div className="qf-field-group">
          <label className="qf-field-label" htmlFor="profile-voter-status">
            Voter Registration Status
          </label>
          <select
            id="profile-voter-status"
            className="qf-select-control"
            value={formData.voter_status || 'unregistered'}
            onChange={handleChange('voter_status')}
            disabled={!isEditing}
          >
            <option value="registered">Registered Barangay Voter</option>
            <option value="unregistered">Not Registered / Out of District</option>
          </select>
        </div>

        <Input
          label="Emergency Contact Name"
          value={formData.emergency_contact_name || ''}
          onChange={handleChange('emergency_contact_name')}
          disabled={!isEditing}
        />
        <Input
          label="Emergency Contact Phone"
          value={formData.emergency_contact_number || ''}
          onChange={handleChange('emergency_contact_number')}
          disabled={!isEditing}
        />
        <Input
          label="Valid ID Type"
          value={formData.valid_id_type || ''}
          onChange={handleChange('valid_id_type')}
          placeholder="e.g., PhilSys National ID, Driver's License, UMID"
          disabled={!isEditing}
        />
        <Input
          label="Valid ID Number"
          value={formData.valid_id_number || ''}
          onChange={handleChange('valid_id_number')}
          disabled={!isEditing}
        />
      </ProfileFormSection>
    </div>
  );
}
