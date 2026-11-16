/**
 * Accessible Inline SVG Icon Provider
 * Tailored cohesively to the QuickFile Brand Emblem (Photo 1):
 * - Smooth squircle / generous corner curves
 * - Bold, friendly pill stroke-caps and joins
 * - Cohesive 24x24 grid geometry with 2.3-2.6 line-weight
 * - Zero third-party runtime dependencies
 */
export function Icon({ name, size = 20, color = 'currentColor', className = '', ...props }) {
  const iconProps = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2.35,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: `qf-icon ${className}`.trim(),
    'aria-hidden': 'true',
    ...props,
  };

  switch (name) {
    // Official QuickFile Brand Emblem from Photo 1
    case 'logo':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`qf-icon qf-icon--logo ${className}`.trim()}
          aria-hidden="true"
          {...props}
        >
          <defs>
            <linearGradient id="qfIconLogoGrad" x1="12" y1="8" x2="88" y2="92" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
            <linearGradient id="qfIconLogoFold" x1="58" y1="8" x2="88" y2="38" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
              <stop offset="45%" stopColor="#dbeafe" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.45" />
            </linearGradient>
            <filter id="qfIconLogoGlow" x="0" y="4" width="100" height="96" filterUnits="userSpaceOnUse">
              <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#1d4ed8" floodOpacity="0.22" />
            </filter>
          </defs>
          <path
            d="M 26 8 H 58 L 88 38 V 76 C 88 85.941 79.941 94 70 94 H 26 C 16.059 94 8 85.941 8 76 V 26 C 8 16.059 16.059 8 26 8 Z"
            fill="url(#qfIconLogoGrad)"
            filter="url(#qfIconLogoGlow)"
          />
          <path
            d="M 58 8 V 26 C 58 32.627 63.373 38 70 38 H 88 Z"
            fill="url(#qfIconLogoFold)"
          />
          <path
            d="M 58 38 H 88"
            stroke="rgba(255, 255, 255, 0.3)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M 31 53 L 45 67 L 72 40"
            stroke="#ffffff"
            strokeWidth="11"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    // Signature Checkmark derived directly from center of Photo 1 Logo
    case 'check':
      return (
        <svg {...iconProps} strokeWidth={2.8}>
          <polyline points="4.5 12.5 9.5 17.5 19.5 6.5" />
        </svg>
      );

    case 'check-circle':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="9.5" />
          <path d="M8 12.5l2.8 2.8 5.4-5.6" strokeWidth={2.5} />
        </svg>
      );

    case 'close':
      return (
        <svg {...iconProps} strokeWidth={2.5}>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );

    // Document Card with top-right fold accent derived from Photo 1
    case 'file':
      return (
        <svg {...iconProps}>
          <path d="M14 2H6.5A2.5 2.5 0 0 0 4 4.5v15A2.5 2.5 0 0 0 6.5 22h11A2.5 2.5 0 0 0 20 19.5V8L14 2z" />
          <path d="M14 2v6h6" />
          <line x1="8" y1="13" x2="16" y2="13" strokeWidth={2.2} />
          <line x1="8" y1="17" x2="13" y2="17" strokeWidth={2.2} />
        </svg>
      );

    case 'copy':
      return (
        <svg {...iconProps}>
          <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
          <path d="M4 15.5c-1.1 0-2-.9-2-2V4.5C2 3.1 3.1 2 4.5 2H14c1.1 0 2 .9 2 2v2" />
        </svg>
      );

    case 'alert':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="9.5" />
          <line x1="12" y1="7.5" x2="12" y2="12.5" strokeWidth={2.6} />
          <circle cx="12" cy="16.5" r="1.1" fill={color} stroke="none" />
        </svg>
      );

    case 'info':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="9.5" />
          <circle cx="12" cy="7.5" r="1.1" fill={color} stroke="none" />
          <line x1="12" y1="11" x2="12" y2="16.5" strokeWidth={2.6} />
        </svg>
      );

    case 'user':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="7.5" r="4.25" />
          <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" strokeWidth={2.4} />
        </svg>
      );

    case 'lock':
      return (
        <svg {...iconProps}>
          <rect x="4" y="10.5" width="16" height="10.5" rx="3" strokeWidth={2.4} />
          <path d="M7.5 10.5V6.5a4.5 4.5 0 0 1 9 0v4" strokeWidth={2.4} />
          <circle cx="12" cy="15.5" r="1.2" fill={color} stroke="none" />
        </svg>
      );

    case 'mail':
      return (
        <svg {...iconProps}>
          <rect x="3" y="4.5" width="18" height="15" rx="3" strokeWidth={2.4} />
          <path d="M4 6.5l7.15 5.56a1.5 1.5 0 0 0 1.7 0L20 6.5" strokeWidth={2.4} />
        </svg>
      );

    case 'phone':
      return (
        <svg {...iconProps}>
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" strokeWidth={2.3} />
        </svg>
      );

    case 'search':
      return (
        <svg {...iconProps}>
          <circle cx="10.5" cy="10.5" r="7" strokeWidth={2.4} />
          <line x1="15.75" y1="15.75" x2="21" y2="21" strokeWidth={2.8} />
        </svg>
      );

    case 'download':
      return (
        <svg {...iconProps}>
          <path d="M20 15v3.5a2.5 2.5 0 0 1-2.5 2.5H6.5A2.5 2.5 0 0 1 4 18.5V15" strokeWidth={2.4} />
          <polyline points="7.5 10.5 12 15 16.5 10.5" strokeWidth={2.5} />
          <line x1="12" y1="15" x2="12" y2="3" strokeWidth={2.5} />
        </svg>
      );

    case 'upload':
      return (
        <svg {...iconProps}>
          <path d="M20 15v3.5a2.5 2.5 0 0 1-2.5 2.5H6.5A2.5 2.5 0 0 1 4 18.5V15" strokeWidth={2.4} />
          <polyline points="16.5 7.5 12 3 7.5 7.5" strokeWidth={2.5} />
          <line x1="12" y1="3" x2="12" y2="15" strokeWidth={2.5} />
        </svg>
      );

    case 'qr':
      return (
        <svg {...iconProps}>
          <rect x="3" y="3" width="7" height="7" rx="2" strokeWidth={2.3} />
          <rect x="14" y="3" width="7" height="7" rx="2" strokeWidth={2.3} />
          <rect x="3" y="14" width="7" height="7" rx="2" strokeWidth={2.3} />
          <circle cx="6.5" cy="6.5" r="1.5" fill={color} stroke="none" />
          <circle cx="17.5" cy="6.5" r="1.5" fill={color} stroke="none" />
          <circle cx="6.5" cy="17.5" r="1.5" fill={color} stroke="none" />
          <rect x="14" y="14" width="3" height="3" rx="1" fill={color} stroke="none" />
          <rect x="18" y="18" width="3" height="3" rx="1" fill={color} stroke="none" />
        </svg>
      );

    case 'eye':
      return (
        <svg {...iconProps}>
          <path d="M2 12s3.5-7.5 10-7.5 10 7.5 10 7.5-3.5 7.5-10 7.5S2 12 2 12z" strokeWidth={2.3} />
          <circle cx="12" cy="12" r="3.25" strokeWidth={2.3} />
        </svg>
      );

    case 'eye-off':
      return (
        <svg {...iconProps}>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-6.5 0-10-7.5-10-7.5a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7.5 10 7.5a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" strokeWidth={2.3} />
          <line x1="2" y1="2" x2="22" y2="22" strokeWidth={2.5} />
        </svg>
      );

    case 'trash':
      return (
        <svg {...iconProps}>
          <path d="M4 6h16" strokeWidth={2.4} />
          <path d="M19 6v13a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 19V6" strokeWidth={2.4} />
          <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" strokeWidth={2.4} />
          <line x1="10" y1="11" x2="10" y2="16" strokeWidth={2.2} />
          <line x1="14" y1="11" x2="14" y2="16" strokeWidth={2.2} />
        </svg>
      );

    case 'refresh':
      return (
        <svg {...iconProps}>
          <path d="M21 4v5h-5" strokeWidth={2.5} />
          <path d="M3 20v-5h5" strokeWidth={2.5} />
          <path d="M3.5 9a9 9 0 0 1 14.85-3.36L21 9M3 15l2.65 3.36A9 9 0 0 0 20.5 15" strokeWidth={2.3} />
        </svg>
      );

    case 'calendar':
      return (
        <svg {...iconProps}>
          <rect x="3" y="4.5" width="18" height="16.5" rx="3" strokeWidth={2.4} />
          <line x1="16" y1="2.5" x2="16" y2="6.5" strokeWidth={2.5} />
          <line x1="8" y1="2.5" x2="8" y2="6.5" strokeWidth={2.5} />
          <line x1="3" y1="10.5" x2="21" y2="10.5" strokeWidth={2.2} />
        </svg>
      );

    case 'chevron-left':
      return (
        <svg {...iconProps} strokeWidth={2.6}>
          <polyline points="15 18 9 12 15 6" />
        </svg>
      );

    case 'chevron-right':
      return (
        <svg {...iconProps} strokeWidth={2.6}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      );

    case 'chevron-down':
      return (
        <svg {...iconProps} strokeWidth={2.6}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      );

    case 'shield':
      return (
        <svg {...iconProps}>
          <path d="M12 22s8-4 8-10V5.5L12 2.5 4 5.5v6.5c0 6 8 10 8 10z" strokeWidth={2.4} />
        </svg>
      );

    case 'building':
      return (
        <svg {...iconProps}>
          <path d="M3 21h18" strokeWidth={2.4} />
          <path d="M5 21V8.5L12 4l7 4.5V21" strokeWidth={2.4} />
          <line x1="9" y1="11" x2="9" y2="14" strokeWidth={2.3} />
          <line x1="15" y1="11" x2="15" y2="14" strokeWidth={2.3} />
          <path d="M10 21v-3.5a2 2 0 0 1 4 0V21" strokeWidth={2.3} />
        </svg>
      );

    case 'arrow-right':
      return (
        <svg {...iconProps} strokeWidth={2.5}>
          <line x1="4" y1="12" x2="19" y2="12" />
          <polyline points="13 6 19 12 13 18" />
        </svg>
      );

    case 'logout':
      return (
        <svg {...iconProps}>
          <path d="M9 21H5.5A2.5 2.5 0 0 1 3 18.5v-13A2.5 2.5 0 0 1 5.5 3H9" strokeWidth={2.4} />
          <polyline points="16 17 21 12 16 7" strokeWidth={2.5} />
          <line x1="21" y1="12" x2="9" y2="12" strokeWidth={2.5} />
        </svg>
      );

    case 'settings':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="3.25" strokeWidth={2.4} />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" strokeWidth={2.2} />
        </svg>
      );

    case 'bell':
      return (
        <svg {...iconProps}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeWidth={2.4} />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeWidth={2.4} />
        </svg>
      );

    case 'help':
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="9.5" strokeWidth={2.4} />
          <path d="M9.25 9.25a3 3 0 0 1 5.5 1.5c0 1.75-2.25 2.25-2.25 3.75" strokeWidth={2.4} />
          <circle cx="12.25" cy="17.25" r="1.1" fill={color} stroke="none" />
        </svg>
      );

    case 'menu':
      return (
        <svg {...iconProps} strokeWidth={2.5}>
          <line x1="3.5" y1="12" x2="20.5" y2="12" />
          <line x1="3.5" y1="6" x2="20.5" y2="6" />
          <line x1="3.5" y1="18" x2="20.5" y2="18" />
        </svg>
      );

    default:
      return null;
  }
}
