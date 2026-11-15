export function UserAvatar({ size = 72, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 72 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Background circle */}
      <circle cx="36" cy="36" r="36" fill="#fef3c7" />

      {/* Body & Jacket */}
      <path d="M18 68c0-12 8-16 18-16s18 4 18 16" fill="#1e3a8a" />
      <path d="M30 52l6 8 6-8" fill="#ffffff" />

      {/* Neck */}
      <rect x="33" y="44" width="6" height="10" fill="#fed7aa" />

      {/* Head */}
      <circle cx="36" cy="34" r="14" fill="#fed7aa" />

      {/* Curly orange hair */}
      <path
        d="M24 28c-3-10 6-16 16-16s16 6 12 16c-2 4-6 6-10 6-6 0-11-2-14-6"
        fill="#ea580c"
      />
      <circle cx="28" cy="20" r="5" fill="#ea580c" />
      <circle cx="36" cy="18" r="6" fill="#ea580c" />
      <circle cx="44" cy="21" r="5" fill="#ea580c" />

      {/* Cool sunglasses */}
      <rect x="30" y="32" width="6" height="5" rx="1.5" fill="#0f172a" />
      <rect x="38" y="32" width="6" height="5" rx="1.5" fill="#0f172a" />
      <line x1="36" y1="34" x2="38" y2="34" stroke="#0f172a" strokeWidth="2" />

      {/* Smile */}
      <path d="M33 42c1.5 2 4.5 2 6 0" stroke="#9a3412" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
