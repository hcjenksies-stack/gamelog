// Jest configuration for the GameLog backend test suite
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  setupFiles: ["./tests/setup.js"],
  // Force exit after all tests complete to avoid hanging open DB connections
  forceExit: true,
  // Clear mock state between tests so mocks don't bleed across test cases
  clearMocks: true,
  // Collect coverage from source files only
  collectCoverageFrom: ["src/**/*.js", "!src/index.js"],
};
