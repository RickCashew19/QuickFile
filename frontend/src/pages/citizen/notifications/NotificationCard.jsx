import { Link } from 'react-router-dom';
import { Button } from '../../../components/shared/Button';
import { Icon } from '../../../components/shared/Icon';
import { formatDate } from '../../../utils/formatters';

export function NotificationCard({ notification, onMarkRead, onDelete }) {
  const isUnread = !notification.is_read;
  const trackingNumber = notification.metadata?.tracking_number;

  const getTypeIcon = (type) => {
    switch (type) {
      case 'success':
        return 'check';
      case 'warning':
        return 'alert';
      case 'danger':
        return 'close';
      default:
        return 'info';
    }
  };

  return (
    <div className={`qf-notif-card ${isUnread ? 'qf-notif-card--unread' : ''}`}>
      <div className={`qf-notif-card__icon qf-notif-icon--${notification.type || 'info'}`}>
        <Icon name={getTypeIcon(notification.type)} size={18} />
      </div>

      <div className="qf-notif-card__content">
        <div className="qf-notif-card__top">
          <div className="qf-notif-card__title-row">
            <h3 className="qf-notif-card__title">{notification.title}</h3>
            {isUnread && <span className="qf-notif-card__unread-dot" title="Unread notification" />}
          </div>
          <span className="qf-notif-card__time">{formatDate(notification.created_at)}</span>
        </div>

        <p className="qf-notif-card__message">{notification.message}</p>

        {trackingNumber && (
          <div className="qf-notif-card__meta-link">
            <Link
              to={`/citizen/requests/${encodeURIComponent(trackingNumber)}`}
              onClick={() => {
                if (isUnread && onMarkRead) {
                  onMarkRead(notification._id);
                }
              }}
            >
              <span className="qf-notif-card__tracking-badge">
                <Icon name="file" size={12} />
                <span>View Request {trackingNumber}</span>
              </span>
            </Link>
          </div>
        )}

        <div className="qf-notif-card__actions">
          {isUnread && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onMarkRead(notification._id)}
              iconLeft={<Icon name="check" size={14} />}
            >
              Mark Read
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(notification._id)}
            iconLeft={<Icon name="trash" size={14} />}
            aria-label="Delete notification"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
