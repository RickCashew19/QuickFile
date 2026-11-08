import { getStatusMeta } from '../../utils/formatters';
import './StatusBadge.css';

export function StatusBadge({ status, className = '' }) {
  const meta = getStatusMeta(status);

  return (
    <span
      className={`qf-status-badge qf-status-badge--${meta.variant} ${className}`.trim()}
      title={meta.description || meta.label}
    >
      <span className="qf-status-badge__dot" aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}
