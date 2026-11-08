import { Icon } from '../../../components/shared/Icon';

export function RequestSpecsCard({ request = {} }) {
  return (
    <div className="qf-staff-card">
      <h2 className="qf-staff-card-title">
        <Icon name="file" size={18} /> Request Specifications
      </h2>
      <div className="qf-staff-grid-2">
        <div>
          <span className="qf-field-label">Stated Purpose</span>
          <span className="qf-field-value">{request.purpose}</span>
        </div>
        <div>
          <span className="qf-field-label">Number of Copies</span>
          <span className="qf-field-value">{request.copies || 1}</span>
        </div>
      </div>

      {request.form_data && Object.keys(request.form_data).length > 0 && (
        <div className="qf-staff-custom-fields">
          <span className="qf-field-label">Additional Form Fields</span>
          <div className="qf-custom-fields-table">
            {Object.entries(request.form_data).map(([key, val]) => (
              <div key={key} className="qf-custom-field-row">
                <span className="qf-custom-field-key">{key}:</span>
                <span className="qf-custom-field-val">{String(val)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
