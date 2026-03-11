// ─── Sync Routes ──────────────────────────────────────────────────────────────
// Admin endpoints for managing the RAWG game sync.
// The trigger endpoint is protected by a shared secret (SYNC_KEY env var)
// so it can be called safely from a cron job or external scheduler.

const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { syncRawg } = require("../sync/rawgSync");

const prisma = new PrismaClient();

// GET /sync/rawg?key=SECRET&pages=150
// Manually kicks off a RAWG sync in the background and returns immediately.
// Pass ?pages=N to control how many pages to fetch (40 games per page).
// Protected — callers must supply the correct SYNC_KEY to prevent abuse.
router.get("/rawg", async (req, res) => {
  // Reject requests with a missing or wrong key
  if (req.query.key !== process.env.SYNC_KEY) {
    return res.status(401).json({ error: "Invalid key" });
  }

  // Check current game count so we can include it in the response
  const count = await prisma.game.count({ where: { rawgId: { not: null } } });

  // Fire the sync in the background — we don't await it so the response
  // returns immediately rather than hanging for the full sync duration
  syncRawg({ pages: parseInt(req.query.pages || "150") }).catch(console.error);

  res.json({ ok: true, message: "Sync started", currentCount: count });
});

// GET /sync/status
// Returns the total number of games in the DB and how many came from RAWG.
// Public — useful for health checks and debugging without exposing the sync key.
router.get("/status", async (_req, res) => {
  const total    = await prisma.game.count();
  const fromRawg = await prisma.game.count({ where: { rawgId: { not: null } } });
  res.json({ total, fromRawg });
});

module.exports = router;
