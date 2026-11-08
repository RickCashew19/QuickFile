import { Link } from 'react-router-dom';
import { Icon } from '../../../components/shared/Icon';
import { StatusBadge } from '../../../components/shared/StatusBadge';
import { formatCurrency, formatDate } from '../../../utils/formatters';

export function PaymentIssuanceCard({ request = {}, issuedDocument = null }) {
  return (
    <div className="qf-staff-card">
      <h2 className="qf-staff-card-title">
        <Icon name="check" size={18} /> Payment & Document Issuance
      </h2>
      <div className="qf-staff-grid-2">
        <div>
          <span className="qf-field-label">Assessed Fee</span>
          <span className="qf-field-value" style={{ fontWeight: 600 }}>
            {formatCurrency(request.fee || 0)}
          </span>
        </div>
        <div>
          <span className="qf-field-label">Payment Status</span>
          <span className="qf-field-value">
            <span
              className={`qf-badge qf-badge--${
                request.payment_status === 'paid'
                  ? 'success'
                  : request.payment_status === 'waived'
                  ? 'info'
                  : 'warning'
              }`}
            >
              {request.payment_status?.toUpperCase() || 'UNPAID'}
            </span>
          </span>
        </div>
        <div>
          <span className="qf-field-label">Official Receipt (OR) / Reference</span>
          <span className="qf-field-value">{request.payment_reference || 'None Recorded'}</span>
        </div>
        <div>
          <span className="qf-field-label">Fee Waiver Reason</span>
          <span className="qf-field-value">{request.waiver_reason || 'None (Standard Assessment)'}</span>
        </div>
      </div>

      {issuedDocument && (
        <div style={{ marginTop: 'var(--space-3)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Official Certificate Record
            </span>
            <Link
              to={`/staff/requests/${request._id}/print`}
              className="qf-btn qf-btn--secondary qf-btn--sm"
            >
              Open Print Preview &rarr;
            </Link>
          </div>
          <div className="qf-staff-grid-2">
            <div>
              <span className="qf-field-label">Certificate Number</span>
              <span className="qf-field-value font-mono" style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                {issuedDocument.certificate_number}
              </span>
            </div>
            <div>
              <span className="qf-field-label">Verification Code</span>
              <span className="qf-field-value font-mono">{issuedDocument.verification_code}</span>
            </div>
            <div>
              <span className="qf-field-label">Issued At</span>
              <span className="qf-field-value">{formatDate(issuedDocument.issued_at)}</span>
            </div>
            <div>
              <span className="qf-field-label">Validity Status</span>
              <span className="qf-field-value">
                <StatusBadge status={issuedDocument.validity_status || 'valid'} />
              </span>
            </div>
            {issuedDocument.expires_at && (
              <div>
                <span className="qf-field-label">Valid Until (Expiry)</span>
                <span className="qf-field-value">{formatDate(issuedDocument.expires_at)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
