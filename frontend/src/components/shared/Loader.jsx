import './Loader.css';

export function Loader({ size = 'md', text = null, className = '' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`qf-loader-container ${className}`.trim()}
    >
      <span className={`qf-loader qf-loader--${size}`} aria-hidden="true" />
      {text && <span className="qf-loader__text">{text}</span>}
      <span className="sr-only">Loading content...</span>
    </div>
  );
}
