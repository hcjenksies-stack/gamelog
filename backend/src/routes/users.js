const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const prisma = new PrismaClient();

const PUBLIC_USER_SELECT = {
  id: true, username: true, handle: true,
  avatar: true, avatarColor: true, bio: true,
  country: true, age: true, isPublic: true,
  isVerified: true, isInfluencer: true,
  liveNow: true, currentGame: true, currentPlatform: true,
  status: true, createdAt: true,
  avatarUrl: true, phone: true, onboarded: true,
  discordId: true, discordUsername: true, discordAvatar: true,
  psnHandle: true, xboxGamertag: true,
  steamId: true, steamUsername: true, steamAvatar: true,
  badges: { include: { badge: true } },
  streams: true,
  _count: { select: { followers: true, following: true, gameLogs: true } },
};

// GET /users/me — own profile
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { ...PUBLIC_USER_SELECT, email: true },
    });
    res.json(user);
  } catch (err) { next(err); }
});

// PATCH /users/me — update own profile
router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const allowed = ["bio", "country", "age", "avatar", "avatarColor",
                     "isPublic", "status", "currentGame", "currentPlatform",
                     "liveNow", "psnHandle", "xboxGamertag",
                     "avatarUrl", "phone", "onboarded",
                     "steamId", "steamUsername", "steamAvatar"];
    const data = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: PUBLIC_USER_SELECT,
    });
    res.json(user);
  } catch (err) { next(err); }
});

// GET /users — list users (with optional ?influencer=true or ?q=search)
router.get("/", optionalAuth, async (req, res, next) => {
  try {
    const { influencer, q, limit = 50 } = req.query;
    const where = {};
    if (influencer !== undefined) where.isInfluencer = influencer === "true";
    if (q) where.OR = [
      { username: { contains: q, mode: "insensitive" } },
      { handle:   { contains: q, mode: "insensitive" } },
    ];
    const users = await prisma.user.findMany({
      where,
      select: PUBLIC_USER_SELECT,
      take: parseInt(limit),
      orderBy: { createdAt: "asc" },
    });
    res.json(users);
  } catch (err) { next(err); }
});

// GET /users/:idOrHandle — public profile
router.get("/:idOrHandle", optionalAuth, async (req, res, next) => {
  try {
    const { idOrHandle } = req.params;
    const where = isNaN(idOrHandle)
      ? { handle: idOrHandle.startsWith("@") ? idOrHandle : `@${idOrHandle}` }
      : { id: parseInt(idOrHandle) };

    const user = await prisma.user.findUnique({
      where,
      select: PUBLIC_USER_SELECT,
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    // private profile — only expose basics unless viewer is a follower
    if (!user.isPublic) {
      const viewerId = req.user?.id;
      if (!viewerId || viewerId === user.id) {
        // own private profile — show everything
      } else {
        const follow = await prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: viewerId, followingId: user.id } },
        });
        if (!follow) {
          return res.json({
            id: user.id, username: user.username, handle: user.handle,
            avatar: user.avatar, avatarColor: user.avatarColor,
            isPublic: false, _count: user._count,
          });
        }
      }
    }

    res.json(user);
  } catch (err) { next(err); }
});

// GET /users/:id/games — all logged games
router.get("/:id/games", optionalAuth, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    const logs = await prisma.gameLog.findMany({
      where: { userId },
      include: { game: { include: { studios: { include: { studio: true } } } } },
      orderBy: { updatedAt: "desc" },
    });
    res.json(logs);
  } catch (err) { next(err); }
});

// GET /users/:id/reviews
router.get("/:id/reviews", optionalAuth, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    const reviews = await prisma.review.findMany({
      where: { userId },
      include: { game: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(reviews);
  } catch (err) { next(err); }
});

// GET /users/:id/achievements
router.get("/:id/achievements", optionalAuth, async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    const achievements = await prisma.achievement.findMany({
      where: { userId },
      include: { game: { select: { id: true, title: true, cover: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(achievements);
  } catch (err) { next(err); }
});

// GET /users/:id/followers
router.get("/:id/followers", async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    const rows = await prisma.follow.findMany({
      where: { followingId: userId },
      include: { follower: { select: { id: true, username: true, handle: true, avatar: true, avatarColor: true, status: true } } },
    });
    res.json(rows.map(r => r.follower));
  } catch (err) { next(err); }
});

// GET /users/:id/following
router.get("/:id/following", async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    const rows = await prisma.follow.findMany({
      where: { followerId: userId },
      include: { following: { select: { id: true, username: true, handle: true, avatar: true, avatarColor: true, status: true } } },
    });
    res.json(rows.map(r => ({ ...r.following, favorited: r.favorited })));
  } catch (err) { next(err); }
});

// GET /users/me/steam/games — fetches the authenticated user's Steam library.
// Requires the user to have linked their Steam account first (/auth/steam/url).
// Games are sorted by total playtime descending so the most-played titles come first.
// Steam stores playtime in minutes — we convert to hours before returning.
router.get("/me/steam/games", requireAuth, async (req, res, next) => {
  try {
    // Look up the user's stored SteamID — set during the OAuth callback
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { steamId: true } });
    if (!user?.steamId)          return res.status(400).json({ error: "Steam not connected" });
    if (!process.env.STEAM_API_KEY) return res.status(503).json({ error: "Steam API key not configured" });

    // IPlayerService/GetOwnedGames returns the full library including free games.
    // include_appinfo=1 adds the game name and image hash to each entry.
    const url      = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${process.env.STEAM_API_KEY}&steamid=${user.steamId}&include_appinfo=1&include_played_free_games=1&format=json`;
    const steamRes = await fetch(url);
    const data     = await steamRes.json();

    // Normalise the Steam response into a consistent shape for the frontend.
    // Note: if the user's Steam profile is set to private, games will be an empty array.
    const games = (data?.response?.games || [])
      .sort((a, b) => b.playtime_forever - a.playtime_forever)
      .map(g => ({
        appId:       g.appid,
        title:       g.name,
        // Steam provides a small logo image and a wider header image per app
        cover:       `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_logo_url}.jpg`,
        headerImage: `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
        // Convert playtime from minutes to hours, rounded to 1 decimal place
        hoursTotal:  Math.round(g.playtime_forever          / 60 * 10) / 10,
        hoursRecent: Math.round((g.playtime_2weeks || 0)    / 60 * 10) / 10,
        // rtime_last_played is a Unix timestamp — convert to ISO string or null
        lastPlayed:  g.rtime_last_played ? new Date(g.rtime_last_played * 1000).toISOString() : null,
      }));

    res.json({ steamId: user.steamId, games });
  } catch (err) { next(err); }
});

module.exports = router;
