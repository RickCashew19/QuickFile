import { Icon } from './Icon';
import './Alert.css';

export function Alert({
  variant = 'info',
  title = null,
  children,
  onDismiss = null,
  onClose = null,
  className = '',
}) {
  const handleDismiss = onDismiss || onClose;
  const getIconName = () => {
    switch (variant) {
      case 'success':
        return 'check';
      case 'warning':
        return 'alert';
      case 'danger':
        return 'alert';
      case 'info':
      default:
        return 'info';
    }
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`qf-alert qf-alert--${variant} ${className}`.trim()}
    >
      <span className="qf-alert__icon">
        <Icon name={getIconName()} size={18} />
      </span>

      <div className="qf-alert__content">
        {title && <div className="qf-alert__title">{title}</div>}
        <div>{children}</div>
      </div>

      {handleDismiss && (
        <button
          type="button"
          onClick={handleDismiss}
          className="qf-alert__close"
          aria-label="Dismiss alert"
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
