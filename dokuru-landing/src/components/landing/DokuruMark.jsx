import React from "react";

/**
 * Dokuru brand mark: a layered hex stack with a Docker-blue accent line,
 * evoking container isolation layers.
 */
export const DokuruMark = ({ className = "h-7 w-7" }) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="dku-g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#2496ED" />
        <stop offset="100%" stopColor="#00E5FF" />
      </linearGradient>
    </defs>
    <rect x="4" y="4" width="24" height="24" rx="6" fill="#0B0B0D" stroke="rgba(255,255,255,0.12)" />
    <rect x="8" y="10" width="16" height="3" rx="1" fill="rgba(255,255,255,0.18)" />
    <rect x="8" y="15" width="10" height="3" rx="1" fill="rgba(255,255,255,0.28)" />
    <rect x="8" y="20" width="13" height="3" rx="1" fill="url(#dku-g)" />
  </svg>
);

export default DokuruMark;
