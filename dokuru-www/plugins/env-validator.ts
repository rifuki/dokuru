import type { Plugin } from "vite";
import { loadEnv } from "vite";

// Required environment variables
const REQUIRED_ENV_VARS = ["VITE_API_BASE_URL"];

export function envValidatorPlugin(): Plugin {
  return {
    name: "env-validator",
    config(_config, { mode }) {
      const fileEnv = loadEnv(mode, process.cwd(), "");
      const systemEnv = process.env;

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
            "❌ Missing required environment variables:",
            ...missing.map((v) => `   - ${v}`),
            "",
            "Please set them via one of these methods:",
            "",
            "1. Create a .env file:",
            ...REQUIRED_ENV_VARS.map((v) => `   ${v}=your_value_here`),
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
