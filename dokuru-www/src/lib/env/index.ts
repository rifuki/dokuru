// Centralized environment variables
// Build-time validation happens in vite.config.ts

const isDev = import.meta.env.DEV;
const DEFAULT_DOKURU_MODE = "cloud";
const rawDokuruMode = import.meta.env.VITE_DOKURU_MODE?.trim().toLowerCase() || DEFAULT_DOKURU_MODE;

if (rawDokuruMode !== "agent" && rawDokuruMode !== "cloud") {
  throw new Error("Invalid VITE_DOKURU_MODE. Expected 'agent' or 'cloud'.");
}

export const DOKURU_MODE = rawDokuruMode;
export const IS_LOCAL_AGENT_MODE = DOKURU_MODE === "agent";

function getRequiredEnv(name: string): string {
  const value = import.meta.env[name];

  // Only validate in development (production validated at build time)
  if (isDev && !IS_LOCAL_AGENT_MODE && (!value || value.trim() === "")) {
    throw new Error(
      `Missing required environment variable: ${name}\n\n` +
      `For Cloud mode, set in .env file:\n` +
      `${name}=http://your-dokuru-server:9393\n\n` +
      `Or use Agent mode (embedded UI):\n` +
      `VITE_DOKURU_MODE=agent`
    );
  }

  return value || "";
}

// ============================================
// REQUIRED
// ============================================

export const API_URL = IS_LOCAL_AGENT_MODE
  ? isDev && import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL
    : globalThis.location?.origin || "http://localhost:3939"
  : getRequiredEnv("VITE_API_BASE_URL");

// ============================================
// OPTIONAL (add more as needed)
// ============================================

// export const SUI_NETWORK = getOptionalEnv("VITE_SUI_NETWORK", "testnet");
// export const CONTRACT_ADDRESS = getOptionalEnv("VITE_CONTRACT_ADDRESS");
