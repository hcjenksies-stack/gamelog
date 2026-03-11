import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server:  { port: 5173 },
  test: {
    // Node environment — no DOM needed; localStorage is mocked manually in setup.js
    environment: "node",
    // Auto-import vitest globals (describe, it, expect, vi) — no imports needed
    globals: true,
    // Runs before each test file to set up the localStorage mock
    setupFiles: ["./src/tests/setup.js"],
    // Only pick up frontend tests — backend tests use Jest separately
    include:  ["src/tests/**/*.test.{js,jsx}"],
    exclude:  ["backend/**", "node_modules/**"],
  },
});
