import { Button } from '../../../components/shared/Button';
import { VALIDITY_STATUSES } from '../../../config/constants';
import { formatDate } from '../../../utils/formatters';

export function StaffVerificationResult({ result, onReset }) {
  if (!result) return null;

  const isRevoked = result.validity_status === VALIDITY_STATUSES.REVOKED;
  const isExpired = result.validity_status === VALIDITY_STATUSES.EXPIRED;

  let statusVariant = 'success';
  if (isRevoked) statusVariant = 'danger';
  else if (isExpired) statusVariant = 'warning';

  return (
    <div className="qf-verify-result-card">
      <div className={`qf-verify-status-banner qf-verify-status-banner--${statusVariant}`}>
        <div className="qf-verify-status-text">
          <span className="qf-verify-status-label">DOCUMENT VALIDITY STATUS</span>
          <h2 className="qf-verify-status-title">
            {result.validity_status?.toUpperCase() || 'UNKNOWN'}
          </h2>
        </div>
        <Button variant="secondary" size="sm" onClick={onReset}>
          Scan Another Document
        </Button>
      </div>

      <div className="qf-verify-details-grid">
        <div className="qf-verify-detail-item">
          <span className="qf-field-label">Document Title</span>
          <span className="qf-field-value">{result.document_name}</span>
        </div>

        <div className="qf-verify-detail-item">
          <span className="qf-field-label">Issued To (Resident)</span>
          <span className="qf-field-value">{result.issued_to_name}</span>
        </div>

        <div className="qf-verify-detail-item">
          <span className="qf-field-label">Certificate Number</span>
          <span className="qf-field-value font-mono">{result.certificate_number}</span>
        </div>

        <div className="qf-verify-detail-item">
          <span className="qf-field-label">Verification Code</span>
          <span className="qf-field-value font-mono">{result.verification_code}</span>
        </div>

        <div className="qf-verify-detail-item">
          <span className="qf-field-label">Date Issued</span>
          <span className="qf-field-value">{formatDate(result.issued_at)}</span>
        </div>

        <div className="qf-verify-detail-item">
          <span className="qf-field-label">Expiration</span>
          <span className="qf-field-value">
            {result.expires_at ? formatDate(result.expires_at) : 'No expiration (Permanent)'}
          </span>
        </div>

        <div className="qf-verify-detail-item">
          <span className="qf-field-label">Issuing Staff Member</span>
          <span className="qf-field-value">{result.issuing_staff_name}</span>
        </div>

        <div className="qf-verify-detail-item">
          <span className="qf-field-label">Original Tracking No.</span>
          <span className="qf-field-value font-mono">{result.tracking_number || 'N/A'}</span>
        </div>
      </div>

      {isRevoked && (
        <div className="qf-verify-revocation-alert">
          <strong>REVOCATION NOTICE:</strong> This certificate was officially revoked on{' '}
          {formatDate(result.revoked_at)}. Reason: {result.revoked_reason || 'Discrepancy in records'}
        </div>
      )}

      {result.status_history && (
        <div className="qf-verify-timeline-section">
          <h3 className="qf-staff-card-title">Audit Transition Timeline</h3>
          <div className="qf-verify-timeline-pills">
            {result.status_history.created_at && (
              <div className="qf-timeline-pill">
                <span>Created: {formatDate(result.status_history.created_at)}</span>
              </div>
            )}
            {result.status_history.approved_at && (
              <div className="qf-timeline-pill">
                <span>Approved: {formatDate(result.status_history.approved_at)}</span>
              </div>
            )}
            {result.status_history.ready_at && (
              <div className="qf-timeline-pill">
                <span>Ready: {formatDate(result.status_history.ready_at)}</span>
              </div>
            )}
            {result.status_history.released_at && (
              <div className="qf-timeline-pill">
                <span>Released: {formatDate(result.status_history.released_at)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
