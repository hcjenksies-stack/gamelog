import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server:  { port: 5173 },
  test: {
    // Run tests in a browser-like environment so DOM APIs and localStorage work
    environment: "jsdom",
    // Auto-import vitest globals (describe, it, expect) — no manual imports needed
    globals: true,
    // Setup file that runs before each test file
    setupFiles: ["./src/tests/setup.js"],
    // Only pick up frontend tests — backend uses Jest separately
    include: ["src/tests/**/*.test.{js,jsx}"],
    exclude: ["backend/**", "node_modules/**"],
  },
});
