// ─── Test Environment Setup ───────────────────────────────────────────────────
// Sets environment variables required by the app before any test files load.
// These are safe dummy values — no real DB or secrets are used in unit tests.

process.env.JWT_SECRET         = "test-jwt-secret-for-unit-tests";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-for-unit-tests";
process.env.SYNC_KEY           = "test-sync-key";
process.env.DATABASE_URL       = "postgresql://test:test@localhost:5432/test";
process.env.FRONTEND_URL       = "http://localhost:5173";
process.env.STEAM_API_KEY      = "test-steam-api-key";
