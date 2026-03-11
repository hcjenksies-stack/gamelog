// ─── GameLog API — Entry Point ────────────────────────────────────────────────
// Bootstraps the Express server, registers all route handlers, and kicks off
// the background RAWG sync once the server is listening.

require("dotenv").config();
const express = require("express");
const cors    = require("cors");

// ── Route handlers ────────────────────────────────────────────────────────────
const authRoutes    = require("./routes/auth");
const userRoutes    = require("./routes/users");
const gameRoutes    = require("./routes/games");
const logRoutes     = require("./routes/gamelog");
const reviewRoutes  = require("./routes/reviews");
const blurbRoutes   = require("./routes/blurbs");
const followRoutes  = require("./routes/follows");
const studioRoutes  = require("./routes/studios");
const feedRoutes    = require("./routes/feed");
const syncRoutes    = require("./routes/sync");

// ── Background services ───────────────────────────────────────────────────────
const { scheduleSyncRawg } = require("./sync/rawgSync");

const app = express();

// Allow all origins — tighten this to FRONTEND_URL in production if needed
app.use(cors());

// Parse incoming JSON request bodies
app.use(express.json());

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/auth",    authRoutes);    // register, login, refresh, logout, OAuth
app.use("/users",   userRoutes);    // profiles, followers, Steam library
app.use("/games",   gameRoutes);    // game catalog
app.use("/log",     logRoutes);     // personal game library (add/update/remove)
app.use("/reviews", reviewRoutes);  // game reviews
app.use("/blurbs",  blurbRoutes);   // short takes (no rating)
app.use("/follows", followRoutes);  // user follow/unfollow
app.use("/studios", studioRoutes);  // studio profiles and news
app.use("/feed",    feedRoutes);    // activity feed
app.use("/sync",    syncRoutes);    // admin: RAWG sync trigger + status

// Simple liveness check used by Railway health monitoring
app.get("/health", (_req, res) => res.json({ ok: true }));

// ── Global error handler ──────────────────────────────────────────────────────
// Catches any error passed to next(err) and returns a consistent JSON shape
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`GameLog API running on :${PORT}`);

  // Kick off the RAWG game sync in the background (non-blocking).
  // This runs an initial sync if the DB is sparse, then repeats every 24h.
  scheduleSyncRawg().catch(console.error);
});
