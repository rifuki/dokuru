
/**
 * Dokuru brand mark: container stack logo
 */
export const DokuruMark = ({ className = "h-7 w-7" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 32"
    className={className}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#2496ED" />
        <stop offset="100%" stopColor="#14B8A6" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="28" height="28" rx="7" fill="#1f1f1f" stroke="url(#g)" strokeWidth="1.5" />
    <g fill="url(#g)">
      <rect x="6" y="17" width="4" height="4" rx="0.6" />
      <rect x="11" y="17" width="4" height="4" rx="0.6" />
      <rect x="16" y="17" width="4" height="4" rx="0.6" />
      <rect x="21" y="17" width="4" height="4" rx="0.6" />
      <rect x="11" y="12" width="4" height="4" rx="0.6" opacity="0.7" />
      <rect x="16" y="12" width="4" height="4" rx="0.6" opacity="0.7" />
      <rect x="16" y="7" width="4" height="4" rx="0.6" opacity="0.5" />
    </g>
  </svg>
);

export default DokuruMark;
