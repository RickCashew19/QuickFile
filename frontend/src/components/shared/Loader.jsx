import './Loader.css';

export function Loader({ size = 'md', text = null, label = null, className = '', fullPage = false }) {
  const displayText = text || label;
  const containerClass = `qf-loader-container ${fullPage ? 'qf-loader-container--fullpage' : ''} ${className}`.trim();

  return (
    <div
      role="status"
      aria-live="polite"
      className={containerClass}
    >
      <span className={`qf-loader qf-loader--${size}`} aria-hidden="true" />
      {displayText && <span className="qf-loader__text">{displayText}</span>}
      <span className="sr-only">{displayText || 'Loading content...'}</span>
    </div>
  );
}
