import { Icon } from '../../../components/shared/Icon';

export function ApplicantInfoCard({ citizen = {}, citizenProfile = {} }) {
  const completeAddress = [
    citizenProfile.street_address,
    citizenProfile.barangay,
    citizenProfile.city,
    citizenProfile.province,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="qf-staff-card">
      <h2 className="qf-staff-card-title">
        <Icon name="user" size={18} /> Applicant Information
      </h2>
      <div className="qf-staff-grid-2">
        <div>
          <span className="qf-field-label">Full Name</span>
          <span className="qf-field-value">{citizen.full_name || 'N/A'}</span>
        </div>
        <div>
          <span className="qf-field-label">Email Address</span>
          <span className="qf-field-value">{citizen.email || 'N/A'}</span>
        </div>
        <div>
          <span className="qf-field-label">Contact Phone</span>
          <span className="qf-field-value">
            {citizenProfile.contact_number || citizen.phone || 'N/A'}
          </span>
        </div>
        <div>
          <span className="qf-field-label">Civil Status</span>
          <span className="qf-field-value" style={{ textTransform: 'capitalize' }}>
            {citizenProfile.civil_status || 'Not Specified'}
          </span>
        </div>
        <div>
          <span className="qf-field-label">Purok / Zone</span>
          <span className="qf-field-value">{citizenProfile.purok_zone || 'Not Specified'}</span>
        </div>
        <div>
          <span className="qf-field-label">Complete Address</span>
          <span className="qf-field-value">{completeAddress || 'Not Specified'}</span>
        </div>
      </div>
    </div>
  );
}
