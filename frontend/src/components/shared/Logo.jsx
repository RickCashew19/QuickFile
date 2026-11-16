import './Logo.css';

/**
 * QuickFile Brand Logo Component
 * Derived directly from the official Photo 1 emblem:
 * A rich royal blue squircle document with folded translucent dog-ear flap
 * and bold rounded white checkmark.
 */
export function Logo({
  size = 36,
  className = '',
  useImage = false,
  showText = false,
  title = 'QuickFile',
  subtitle = '',
  alt = 'QuickFile Logo',
  ...props
}) {
  const mark = useImage ? (
    <img
      src="/logo.jpg"
      alt={alt}
      width={size}
      height={size}
      className="qf-logo__img"
    />
  ) : (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="qf-logo__svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="qfLogoGrad" x1="12" y1="8" x2="88" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id="qfLogoFold" x1="58" y1="8" x2="88" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="45%" stopColor="#dbeafe" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.45" />
        </linearGradient>
        <filter id="qfLogoShadow" x="0" y="4" width="100" height="96" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#1d4ed8" floodOpacity="0.22" />
        </filter>
      </defs>

      {/* Main Document Body */}
      <path
        d="M 26 8 H 58 L 88 38 V 76 C 88 85.941 79.941 94 70 94 H 26 C 16.059 94 8 85.941 8 76 V 26 C 8 16.059 16.059 8 26 8 Z"
        fill="url(#qfLogoGrad)"
        filter="url(#qfLogoShadow)"
      />

      {/* Translucent Glass Dog-Ear Fold */}
      <path
        d="M 58 8 V 26 C 58 32.627 63.373 38 70 38 H 88 Z"
        fill="url(#qfLogoFold)"
      />
      <path
        d="M 58 38 H 88"
        stroke="rgba(255, 255, 255, 0.3)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Center Bold Rounded Checkmark */}
      <path
        d="M 31 53 L 45 67 L 72 40"
        stroke="#ffffff"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (!showText) {
    return (
      <span className={`qf-logo__mark ${className}`.trim()} style={{ width: size, height: size }} {...props}>
        {mark}
      </span>
    );
  }

  return (
    <div className={`qf-logo ${className}`.trim()} {...props}>
      <span className="qf-logo__mark" style={{ width: size, height: size }}>
        {mark}
      </span>
      <div className="qf-logo__text">
        <span className="qf-logo__title">{title}</span>
        {subtitle && <span className="qf-logo__subtitle">{subtitle}</span>}
      </div>
    </div>
  );
}
