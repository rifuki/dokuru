import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { envValidatorPlugin } from "./plugins/env-validator";

function vendorChunk(id: string) {
  if (!id.includes("/node_modules/")) return;

  if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/")) {
    return "vendor-react";
  }
  if (id.includes("/node_modules/@tanstack/")) {
    return "vendor-tanstack";
  }
  if (id.includes("/node_modules/@radix-ui/") || id.includes("/node_modules/radix-ui/")) {
    return "vendor-radix";
  }
  if (id.includes("/node_modules/recharts/") || id.includes("/node_modules/d3-")) {
    return "vendor-charts";
  }
  if (id.includes("/node_modules/react-pdf/") || id.includes("/node_modules/pdfjs-dist/")) {
    return "vendor-pdf";
  }
  if (id.includes("/node_modules/@xterm/")) {
    return "vendor-terminal";
  }
  if (id.includes("/node_modules/lucide-react/")) {
    return "vendor-icons";
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    envValidatorPlugin(),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
});
