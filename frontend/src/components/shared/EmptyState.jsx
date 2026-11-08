import { Icon } from './Icon';
import './EmptyState.css';

export function EmptyState({
  icon = 'file',
  title = 'No items found',
  description = 'There is currently no data to display.',
  action = null,
  className = '',
}) {
  return (
    <div className={`qf-empty-state ${className}`.trim()}>
      <div className="qf-empty-state__icon">
        <Icon name={icon} size={28} />
      </div>
      <h3 className="qf-empty-state__title">{title}</h3>
      <p className="qf-empty-state__description">{description}</p>
      {action && <div className="qf-empty-state__action">{action}</div>}
    </div>
  );
}
