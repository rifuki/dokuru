/**
 * Design System Tokens - Linear-inspired
 * Consistent colors, spacing, typography for all admin components
 */

export const colors = {
  // Muted, professional palette
  primary: {
    DEFAULT: 'hsl(220, 45%, 50%)',
    light: 'hsl(220, 50%, 60%)',
    dark: 'hsl(220, 55%, 35%)',
  },
  
  // Status colors (subtle)
  status: {
    success: 'hsl(142, 45%, 45%)',
    warning: 'hsl(38, 50%, 50%)',
    error: 'hsl(0, 45%, 50%)',
    info: 'hsl(210, 45%, 50%)',
  },
  
  // Chart colors (harmonious)
  chart: {
    blue: 'hsl(220, 45%, 55%)',
    purple: 'hsl(260, 40%, 60%)',
    cyan: 'hsl(180, 35%, 55%)',
    orange: 'hsl(30, 40%, 60%)',
    green: 'hsl(142, 40%, 50%)',
    pink: 'hsl(330, 40%, 60%)',
  },
} as const;

export const gradients = {
  primary: 'linear-gradient(135deg, hsl(220, 50%, 60%), hsl(260, 45%, 65%))',
  success: 'linear-gradient(135deg, hsl(142, 45%, 50%), hsl(180, 40%, 55%))',
  warning: 'linear-gradient(135deg, hsl(38, 50%, 55%), hsl(30, 45%, 60%))',
  chart: 'linear-gradient(180deg, hsl(220, 50%, 60%) 0%, hsl(220, 50%, 50%) 100%)',
} as const;
