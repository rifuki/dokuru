export function DokuruEmblem({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="dokuru-shield" x1="18" y1="10" x2="76" y2="82" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7DD3FC" />
          <stop offset="0.55" stopColor="#38BDF8" />
          <stop offset="1" stopColor="#6366F1" />
        </linearGradient>
        <linearGradient id="dokuru-stack" x1="34" y1="34" x2="62" y2="62" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E0F2FE" />
          <stop offset="1" stopColor="#BAE6FD" />
        </linearGradient>
      </defs>

      <path
        d="M48 8L78 20V42C78 60 66.4 76.3 48 86C29.6 76.3 18 60 18 42V20L48 8Z"
        fill="url(#dokuru-shield)"
      />
      <path
        d="M48 15L71 24.4V42C71 55.4 62.6 67.8 48 75.9C33.4 67.8 25 55.4 25 42V24.4L48 15Z"
        fill="#06111F"
        fillOpacity="0.46"
        stroke="rgba(255,255,255,0.24)"
      />
      <rect x="31" y="34" width="34" height="8" rx="4" fill="url(#dokuru-stack)" />
      <rect x="35" y="47" width="26" height="8" rx="4" fill="url(#dokuru-stack)" fillOpacity="0.92" />
      <rect x="39" y="60" width="18" height="8" rx="4" fill="url(#dokuru-stack)" fillOpacity="0.82" />
      <circle cx="38" cy="38" r="1.8" fill="#06111F" />
      <circle cx="44" cy="38" r="1.8" fill="#06111F" />
      <circle cx="50" cy="38" r="1.8" fill="#06111F" />
      <circle cx="42" cy="51" r="1.8" fill="#06111F" />
      <circle cx="48" cy="51" r="1.8" fill="#06111F" />
      <circle cx="54" cy="51" r="1.8" fill="#06111F" />
      <circle cx="46" cy="64" r="1.8" fill="#06111F" />
      <circle cx="52" cy="64" r="1.8" fill="#06111F" />
    </svg>
  )
}
