import './Button.css';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled = false,
  iconLeft = null,
  iconRight = null,
  type = 'button',
  className = '',
  onClick,
  ...props
}) {
  const classes = [
    'qf-btn',
    `qf-btn--${variant}`,
    `qf-btn--${size}`,
    fullWidth ? 'qf-btn--full' : '',
    loading ? 'qf-btn--loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading ? (
        <>
          <span className="qf-btn__spinner" aria-hidden="true" />
          <span>Loading...</span>
        </>
      ) : (
        <>
          {iconLeft && <span className="qf-btn__icon-left">{iconLeft}</span>}
          <span>{children}</span>
          {iconRight && <span className="qf-btn__icon-right">{iconRight}</span>}
        </>
      )}
    </button>
  );
}
