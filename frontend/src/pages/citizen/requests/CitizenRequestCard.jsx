import { useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../../../components/shared/StatusBadge';
import { Button } from '../../../components/shared/Button';
import { Icon } from '../../../components/shared/Icon';
import { formatDate, formatCurrency } from '../../../utils/formatters';

export function CitizenRequestCard({ item }) {
  const [copied, setCopied] = useState(false);

  const docName = item.document_type?.name || item.document_type_name || 'Document Request';
  const trackingNumber = item.tracking_number;

  const handleCopyTrackingNumber = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(trackingNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const isPending = item.status === 'pending';

  return (
    <div className="qf-history-card">
      <div className="qf-history-card__header">
        <div className="qf-history-card__tracking">
          <Link
            to={`/citizen/requests/${encodeURIComponent(trackingNumber)}`}
            className="qf-history-card__number"
          >
            {trackingNumber}
          </Link>
          <button
            type="button"
            className="qf-copy-btn"
            onClick={handleCopyTrackingNumber}
            title="Copy tracking number"
            aria-label={`Copy tracking number ${trackingNumber}`}
          >
            <Icon name={copied ? 'check' : 'copy'} size={14} />
            <span className="qf-copy-text">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <StatusBadge status={item.status} />
      </div>

      <div className="qf-history-card__body">
        <h3 className="qf-history-card__doc">{docName}</h3>

        <div className="qf-history-card__meta">
          <div>
            <span className="qf-history-card__meta-label">Submitted:</span>
            <span>{formatDate(item.created_at)}</span>
          </div>
          <div>
            <span className="qf-history-card__meta-label">Copies:</span>
            <span>{item.copies || 1}</span>
          </div>
          <div>
            <span className="qf-history-card__meta-label">Fee:</span>
            <span className="qf-history-card__fee">{formatCurrency(item.fee)}</span>
            <span className={`qf-pay-status-pill qf-pay-${item.payment_status || 'unpaid'}`}>
              {item.payment_status || 'unpaid'}
            </span>
          </div>
        </div>
      </div>

      <div className="qf-history-card__footer">
        {isPending && (
          <Link to={`/citizen/requests/${encodeURIComponent(trackingNumber)}/edit`}>
            <Button variant="secondary" size="sm" iconLeft={<Icon name="edit" size={14} />}>
              Edit
            </Button>
          </Link>
        )}
        <Link to={`/citizen/requests/${encodeURIComponent(trackingNumber)}`}>
          <Button variant="primary" size="sm" iconRight={<Icon name="arrowRight" size={14} />}>
            View Details
          </Button>
        </Link>
      </div>
    </div>
  );
}
