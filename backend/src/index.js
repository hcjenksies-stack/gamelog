// ─── GameLog API — Entry Point ────────────────────────────────────────────────
// Imports the configured Express app, binds it to a port, and starts the
// background RAWG sync. Kept separate from app.js so tests can import the
// app without triggering server startup.

const app = require("./app");
const { scheduleSyncRawg } = require("./sync/rawgSync");

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`GameLog API running on :${PORT}`);

  // Kick off the RAWG game sync in the background (non-blocking).
  // Runs an initial sync if the DB is sparse, then repeats every 24h.
  scheduleSyncRawg().catch(console.error);
});
