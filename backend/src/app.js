// ─── GameLog API — Express App ────────────────────────────────────────────────
// Exports the configured Express app without starting the server.
// This separation lets tests import the app without triggering server startup
// or the background RAWG sync.

require("dotenv").config();
const express = require("express");
const cors    = require("cors");

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

const app = express();

// Allow all origins — tighten to FRONTEND_URL in production if needed
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
app.get("/health", (_req, res) => res.json({ ok: true, version: "1.1.0" }));

// ── Global error handler ──────────────────────────────────────────────────────
// Catches any error passed to next(err) and returns a consistent JSON shape
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

module.exports = app;
