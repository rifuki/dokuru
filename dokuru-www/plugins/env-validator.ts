import type { Plugin } from "vite";
import { loadEnv } from "vite";

// Required environment variables
const REQUIRED_ENV_VARS = ["VITE_API_BASE_URL"];
const DEFAULT_DOKURU_MODE = "cloud";

function resolveDokuruMode(value: string | undefined) {
  const mode = (value || DEFAULT_DOKURU_MODE).trim().toLowerCase();
  if (mode === "agent" || mode === "cloud") return mode;

  throw new Error(
    [
      "",
      "❌ Invalid VITE_DOKURU_MODE:",
      `   - ${value}`,
      "",
      "Valid values are:",
      "   - cloud",
      "   - agent",
      "",
    ].join("\n")
  );
}

export function envValidatorPlugin(): Plugin {
  return {
    name: "env-validator",
    config(_config, { mode }) {
      const fileEnv = loadEnv(mode, process.cwd(), "");
      const systemEnv = process.env;
      const appMode = resolveDokuruMode(fileEnv.VITE_DOKURU_MODE || systemEnv.VITE_DOKURU_MODE);

      if (appMode === "agent") {
        console.log(
          "✅ Agent mode detected - API_BASE_URL optional (defaults to http://localhost:3939)"
        );
        return;
      }

      const missing: string[] = [];
      for (const envVar of REQUIRED_ENV_VARS) {
        const fileValue = fileEnv[envVar];
        const systemValue = systemEnv[envVar];
        const value = fileValue || systemValue;

        if (!value || value.trim() === "") {
          missing.push(envVar);
        }
      }

      if (missing.length > 0) {
        throw new Error(
          [
            "",
            "❌ Cloud mode requires VITE_API_BASE_URL",
            "",
            "Missing required environment variables:",
            ...missing.map((v) => `   - ${v}`),
            "",
            "ℹ️  To use Agent mode (embedded UI) without external API:",
            "   Set VITE_DOKURU_MODE=agent",
            "",
            "Otherwise, please set the API URL via one of these methods:",
            "",
            "1. Create a .env file:",
            ...REQUIRED_ENV_VARS.map((v) => `   ${v}=http://your-dokuru-server:9393`),
            "",
            "2. Or copy from .env.example:",
            "   cp .env.example .env",
            "",
            "3. For production (Vercel, CI/CD):",
            "   Set environment variables in your hosting platform dashboard",
            "",
          ].join("\n")
        );
      }

      console.log("✅ Environment variables validated");
    },
  };
}
