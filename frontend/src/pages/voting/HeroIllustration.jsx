export function HeroIllustration({ className = '' }) {
  return (
    <svg
      viewBox="0 0 240 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Soft background glow */}
      <circle cx="150" cy="90" r="70" fill="#e0edff" opacity="0.6" />

      {/* Smartphone body */}
      <rect x="120" y="24" width="76" height="136" rx="14" fill="#1e3a8a" />
      <rect x="124" y="30" width="68" height="124" rx="10" fill="#ffffff" />
      {/* Screen speaker bar */}
      <rect x="146" y="34" width="24" height="3" rx="1.5" fill="#cbd5e1" />

      {/* Screen content mockup */}
      <rect x="132" y="44" width="52" height="12" rx="3" fill="#e0edff" />
      <rect x="132" y="60" width="52" height="6" rx="2" fill="#f1f5f9" />
      <rect x="132" y="70" width="38" height="6" rx="2" fill="#f1f5f9" />

      {/* Ballot box on screen */}
      <rect x="132" y="82" width="52" height="42" rx="6" fill="#eff6ff" stroke="#bfdbfe" />
      {/* Voted check badge */}
      <circle cx="158" cy="98" r="10" fill="#ef4444" />
      <path d="M154 98l3 3 5-5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Screen button */}
      <rect x="138" y="112" width="40" height="8" rx="4" fill="#1e3a8a" />

      {/* Floating stars & sparkles */}
      <path d="M110 40l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#f59e0b" />
      <path d="M205 95l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z" fill="#3b82f6" />
      <circle cx="196" cy="46" r="3" fill="#f43f5e" />

      {/* Friendly student character on left interacting with phone */}
      {/* Shadow */}
      <ellipse cx="88" cy="154" rx="28" ry="6" fill="#cbd5e1" opacity="0.5" />
      
      {/* Legs */}
      <path d="M82 115l-4 35" stroke="#1e3a8a" strokeWidth="6" strokeLinecap="round" />
      <path d="M94 115l4 35" stroke="#1e3a8a" strokeWidth="6" strokeLinecap="round" />
      {/* Shoes */}
      <ellipse cx="76" cy="152" rx="7" ry="3.5" fill="#0f172a" />
      <ellipse cx="100" cy="152" rx="7" ry="3.5" fill="#0f172a" />

      {/* Torso & Jacket */}
      <path d="M76 74h24l6 42H70l6-42z" fill="#3b82f6" />
      {/* Inner shirt */}
      <path d="M84 74h8l-2 16h-4l-2-16z" fill="#ffffff" />

      {/* Left arm */}
      <path d="M74 78l-8 20 6 2" stroke="#3b82f6" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="72" cy="101" r="3.5" fill="#fbcfe8" />

      {/* Right arm reaching to phone screen */}
      <path d="M98 78l18 10 10-4" stroke="#3b82f6" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="127" cy="84" r="4" fill="#fbcfe8" />

      {/* Head & Neck */}
      <rect x="85" y="65" width="6" height="10" fill="#fbcfe8" />
      <circle cx="88" cy="56" r="12" fill="#fbcfe8" />
      
      {/* Hair (friendly curly orange/brown hair from screenshot) */}
      <path d="M78 52c-2-8 6-12 14-12 8 0 13 5 12 12-2 3-5 5-8 5-5 0-9-1-12-3" fill="#ea580c" />
      <circle cx="82" cy="46" r="4" fill="#ea580c" />
      <circle cx="94" cy="45" r="4.5" fill="#ea580c" />
      
      {/* Cool sunglasses (just like the avatar) */}
      <rect x="84" y="53" width="5" height="4" rx="1" fill="#0f172a" />
      <rect x="91" y="53" width="5" height="4" rx="1" fill="#0f172a" />
      <line x1="88" y1="55" x2="92" y2="55" stroke="#0f172a" strokeWidth="1.5" />

      {/* Cheerful smile */}
      <path d="M86 62c1 1.5 3 1.5 4 0" stroke="#9a3412" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
