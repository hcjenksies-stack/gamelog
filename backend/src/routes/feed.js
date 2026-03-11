const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");

const prisma = new PrismaClient();

/**
 * GET /feed
 *
 * Returns a merged, time-sorted social feed for the authenticated user:
 *   • friend_progress   — gamelog updates from followed users
 *   • friend_review     — reviews from followed users
 *   • friend_blurb      — blurbs from followed users
 *   • friend_achievement— achievements from followed users
 *   • influencer_post   — reviews/blurbs from followed influencers
 *   • influencer_live   — influencers who are currently live
 *   • studio_event      — news posts from followed studios
 */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { limit = 30, before } = req.query;
    const userId = req.user.id;

    // Who does the current user follow?
    const follows = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true, favorited: true },
    });
    const followedIds      = follows.map(f => f.followingId);
    const priorityIds      = new Set(follows.filter(f => f.favorited).map(f => f.followingId));

    const studioFollows    = await prisma.studioFollow.findMany({
      where: { userId },
      select: { studioId: true },
    });
    const followedStudioIds = studioFollows.map(f => f.studioId);

    if (!followedIds.length && !followedStudioIds.length) {
      return res.json([]);
    }

    const cursor = before ? new Date(before) : new Date();

    // Fetch all source data in parallel
    const [logs, reviews, blurbs, achievements, studioNews, liveInfluencers] = await Promise.all([
      // Friend/influencer game progress
      prisma.gameLog.findMany({
        where: { userId: { in: followedIds }, updatedAt: { lt: cursor } },
        include: {
          user: { select: { id: true, username: true, handle: true, avatar: true, avatarColor: true, isInfluencer: true } },
          game: { select: { id: true, title: true, cover: true, genre: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),

      // Friend/influencer reviews
      prisma.review.findMany({
        where: { userId: { in: followedIds }, createdAt: { lt: cursor } },
        include: {
          user: { select: { id: true, username: true, handle: true, avatar: true, avatarColor: true, isInfluencer: true } },
          game: { select: { id: true, title: true, cover: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),

      // Friend/influencer blurbs
      prisma.blurb.findMany({
        where: { userId: { in: followedIds }, createdAt: { lt: cursor } },
        include: {
          user: { select: { id: true, username: true, handle: true, avatar: true, avatarColor: true, isInfluencer: true } },
          game: { select: { id: true, title: true, cover: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),

      // Friend achievements
      prisma.achievement.findMany({
        where: { userId: { in: followedIds }, createdAt: { lt: cursor } },
        include: {
          user: { select: { id: true, username: true, handle: true, avatar: true, avatarColor: true } },
          game: { select: { id: true, title: true, cover: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),

      // Studio news from followed studios
      followedStudioIds.length
        ? prisma.studioNews.findMany({
            where: { studioId: { in: followedStudioIds }, createdAt: { lt: cursor } },
            include: { studio: true },
            orderBy: { createdAt: "desc" },
            take: 20,
          })
        : Promise.resolve([]),

      // Influencers currently live (from followed users)
      prisma.user.findMany({
        where: { id: { in: followedIds }, isInfluencer: true, liveNow: true },
        include: { streams: true },
      }),
    ]);

    // Shape into unified feed items
    const items = [];

    for (const log of logs) {
      items.push({
        id:       `log-${log.id}`,
        type:     log.user.isInfluencer ? "influencer_post" : "friend_progress",
        time:     log.updatedAt,
        priority: priorityIds.has(log.userId),
        user:     log.user,
        game:     log.game,
        progress: log.progress,
        hours:    log.hours,
        platform: log.platform,
      });
    }

    for (const review of reviews) {
      items.push({
        id:       `review-${review.id}`,
        type:     review.user.isInfluencer ? "influencer_post" : "friend_review",
        time:     review.createdAt,
        priority: priorityIds.has(review.userId),
        user:     review.user,
        game:     review.game,
        rating:   review.rating,
        text:     review.body,
      });
    }

    for (const blurb of blurbs) {
      items.push({
        id:       `blurb-${blurb.id}`,
        type:     blurb.user.isInfluencer ? "influencer_post" : "friend_blurb",
        time:     blurb.createdAt,
        priority: priorityIds.has(blurb.userId),
        user:     blurb.user,
        game:     blurb.game,
        text:     blurb.text,
      });
    }

    for (const ach of achievements) {
      items.push({
        id:          `ach-${ach.id}`,
        type:        "friend_achievement",
        time:        ach.createdAt,
        priority:    priorityIds.has(ach.userId),
        user:        ach.user,
        game:        ach.game,
        achievement: { name: ach.name, icon: ach.icon, rarity: ach.rarity, pct: ach.pct },
      });
    }

    for (const news of studioNews) {
      items.push({
        id:     `studio-${news.id}`,
        type:   "studio_event",
        time:   news.createdAt,
        studio: news.studio,
        event:  { type: news.type, title: news.title, desc: news.desc },
      });
    }

    for (const inf of liveInfluencers) {
      items.push({
        id:          `live-${inf.id}`,
        type:        "influencer_live",
        time:        new Date(),
        influencer:  inf,
        streams:     inf.streams,
        currentGame: inf.currentGame,
      });
    }

    // Sort newest first, then slice
    items.sort((a, b) => new Date(b.time) - new Date(a.time));
    res.json(items.slice(0, parseInt(limit)));
  } catch (err) { next(err); }
});

// POST /feed/achievements — log an achievement for current user
router.post("/achievements", requireAuth, async (req, res, next) => {
  try {
    const { gameId, name, icon, rarity, pct } = req.body;
    if (!gameId || !name) return res.status(400).json({ error: "gameId and name are required" });

    const achievement = await prisma.achievement.create({
      data: {
        userId: req.user.id,
        gameId: parseInt(gameId),
        name,
        icon:   icon   || null,
        rarity: rarity || null,
        pct:    pct    ? parseFloat(pct) : null,
      },
      include: {
        user: { select: { id: true, username: true, handle: true } },
        game: { select: { id: true, title: true, cover: true } },
      },
    });
    res.status(201).json(achievement);
  } catch (err) { next(err); }
});

module.exports = router;
