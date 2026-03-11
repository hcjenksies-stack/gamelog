// ─── RAWG Game Sync ───────────────────────────────────────────────────────────
// Fetches games from the RAWG.io API and upserts them into our Postgres DB.
// Ordered by most-added (popularity proxy) so we get the best-known games first.
// Runs once at startup if the DB is sparse, then repeats every 24 hours.

const { PrismaClient } = require("@prisma/client");

const prisma    = new PrismaClient();
const RAWG_BASE = "https://api.rawg.io/api";

// RAWG uses different genre labels than we do internally.
// This map normalises them so filters and genre sections work consistently.
const GENRE_MAP = {
  "Action":               "Action",
  "Indie":                "Indie",
  "Adventure":            "Adventure",
  "RPG":                  "RPG",
  "Strategy":             "Strategy",
  "Shooter":              "FPS",          // RAWG calls it "Shooter", we display "FPS"
  "Casual":               "Casual",
  "Simulation":           "Simulation",
  "Puzzle":               "Puzzle",
  "Arcade":               "Arcade",
  "Platformer":           "Platformer",
  "Massively Multiplayer":"MMO",
  "Racing":               "Racing",
  "Sports":               "Sports",
  "Fighting":             "Fighting",
  "Family":               "Family",
  "Board Games":          "Board Games",
  "Educational":          "Educational",
  "Card":                 "Card",
};

// Guard flag — prevents overlapping sync runs if the daily interval fires
// while a previous sync is still in progress.
let syncing = false;

// Fetches `pages` pages of games from RAWG (40 games/page = up to 6,000 games
// at the default of 150 pages) and upserts each one into the games table.
// Uses rawgId as the unique key so re-running is always safe (no duplicates).
async function syncRawg({ pages = 150 } = {}) {
  const key = process.env.RAWG_API_KEY;

  // Bail early if no API key is configured — nothing we can do without it
  if (!key)     { console.log("[rawg-sync] No RAWG_API_KEY, skipping"); return; }
  if (syncing)  { console.log("[rawg-sync] Already running, skipping"); return; }

  syncing = true;
  console.log(`[rawg-sync] Starting — target ${pages * 40} games`);
  let total = 0;

  try {
    for (let page = 1; page <= pages; page++) {
      try {
        // Fetch one page of games, ordered by most-added to surface popular titles first
        const url = `${RAWG_BASE}/games?key=${key}&ordering=-added&page_size=40&page=${page}`;
        const res  = await fetch(url);

        // If rate-limited, back off for 60s then retry the same page
        if (res.status === 429) {
          console.warn("[rawg-sync] rate limited, pausing 60s");
          await sleep(60000);
          page--;
          continue;
        }

        if (!res.ok) { console.warn(`[rawg-sync] page ${page} HTTP ${res.status}`); break; }

        const data  = await res.json();
        const games = data.results || [];

        // An empty results array means we've gone past the last page
        if (!games.length) break;

        for (const g of games) {
          // Skip any malformed entries missing required fields
          if (!g.id || !g.name) continue;

          // Normalise the genre — fall back to the raw RAWG label if it's not in our map
          const rawGenre = g.genres?.[0]?.name || "Other";
          const genre    = GENRE_MAP[rawGenre] || rawGenre;

          // RAWG release dates come as "YYYY-MM-DD" — we only store the year
          const year = g.released ? parseInt(g.released.slice(0, 4)) : null;

          try {
            // Upsert by rawgId: update metadata if the game already exists,
            // create a new row if it doesn't. This makes the sync idempotent.
            await prisma.game.upsert({
              where:  { rawgId: g.id },
              update: {
                title:           g.name,
                genre,
                backgroundImage: g.background_image || null,
                metacritic:      g.metacritic        || null,
                rawgRating:      g.rating            || null,  // 0–5 scale from RAWG community
                rawgSlug:        g.slug              || null,
                year,
              },
              create: {
                title:           g.name,
                genre,
                cover:           "🎮",   // emoji fallback for GameCover when no image loads
                year,
                coop:            false,
                backgroundImage: g.background_image || null,
                metacritic:      g.metacritic        || null,
                rawgRating:      g.rating            || null,
                rawgId:          g.id,
                rawgSlug:        g.slug              || null,
              },
            });
            total++;
          } catch (_) {
            // Skip individual game failures (e.g. unique constraint on title)
            // so one bad record doesn't abort the whole page
          }
        }

        // 300ms delay between pages keeps us well under RAWG's 20k req/month free limit
        await sleep(300);

        // Progress log every 25 pages (~1,000 games)
        if (page % 25 === 0) console.log(`[rawg-sync] page ${page}/${pages}, ${total} upserted`);

      } catch (err) {
        // Log page-level errors but keep going — one bad page shouldn't stop the sync
        console.error(`[rawg-sync] page ${page} error:`, err.message);
        await sleep(5000);
      }
    }
  } finally {
    // Always release the guard so future syncs can run
    syncing = false;
  }

  console.log(`[rawg-sync] Done. Total upserted: ${total}`);
}

// Simple promise-based sleep helper used for rate limiting and backoff
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Called once at server startup. Runs an initial sync if the DB has fewer than
// 500 RAWG-sourced games (i.e. first boot or after a wipe), then schedules a
// daily refresh to pick up new releases and updated metadata.
async function scheduleSyncRawg() {
  try {
    const count = await prisma.game.count({ where: { rawgId: { not: null } } });
    console.log(`[rawg-sync] DB has ${count} RAWG-sourced games`);

    if (count < 500) {
      console.log("[rawg-sync] Low count — running initial sync now");
      syncRawg({ pages: 150 }).catch(console.error);
    }
  } catch (err) {
    console.error("[rawg-sync] schedule check failed:", err.message);
  }

  // Re-sync every 24 hours to capture new releases and rating updates
  setInterval(() => {
    console.log("[rawg-sync] Daily refresh starting");
    syncRawg({ pages: 150 }).catch(console.error);
  }, 24 * 60 * 60 * 1000);
}

module.exports = { syncRawg, scheduleSyncRawg };
