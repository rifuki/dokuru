// Centralized environment variables
// Build-time validation happens in vite.config.ts

const isDev = import.meta.env.DEV;

function getRequiredEnv(name: string): string {
  const value = import.meta.env[name];
  
  // Only validate in development (production validated at build time)
  if (isDev && (!value || value.trim() === "")) {
    throw new Error(
      `Missing required environment variable: ${name}\n\n` +
      `Please add it to your .env file:\n` +
      `${name}=your_value_here`
    );
  }
  
  return value || "";
}

// ============================================
// REQUIRED
// ============================================

export const API_URL = getRequiredEnv("VITE_API_BASE_URL");

// ============================================
// OPTIONAL (add more as needed)
// ============================================

// export const SUI_NETWORK = getOptionalEnv("VITE_SUI_NETWORK", "testnet");
// export const CONTRACT_ADDRESS = getOptionalEnv("VITE_CONTRACT_ADDRESS");
