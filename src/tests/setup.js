// ─── Vitest Setup ─────────────────────────────────────────────────────────────
// Runs before each test file. Extends expect with DOM matchers and sets up
// a mock localStorage since tests run in jsdom, not a real browser.

import "@testing-library/jest-dom";

// Mock localStorage — jsdom provides this but we reset it between tests
beforeEach(() => {
  localStorage.clear();
});
