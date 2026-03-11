const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const prisma = new PrismaClient();

// GET /games — list with optional search/genre filter
router.get("/", optionalAuth, async (req, res, next) => {
  try {
    const { genre, q, limit = 50, offset = 0 } = req.query;
    const where = {};
    if (genre) where.genre = { equals: genre, mode: "insensitive" };
    if (q)     where.title = { contains: q, mode: "insensitive" };

    const games = await prisma.game.findMany({
      where,
      take: parseInt(limit),
      skip: parseInt(offset),
      include: { studios: { include: { studio: true } } },
      orderBy: [{ metacritic: "desc" }, { rawgRating: "desc" }],
    });
    res.json(games);
  } catch (err) { next(err); }
});

// GET /games/:id — single game with reviews summary
router.get("/:id", optionalAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const game = await prisma.game.findUnique({
      where: { id },
      include: {
        studios: { include: { studio: true } },
        reviews: {
          include: { user: { select: { id: true, username: true, handle: true, avatar: true, avatarColor: true } } },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        blurbs: {
          include: { user: { select: { id: true, username: true, handle: true, avatar: true, avatarColor: true } } },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });
    if (!game) return res.status(404).json({ error: "Game not found" });
    res.json(game);
  } catch (err) { next(err); }
});

// POST /games — create a game (verified users / admin only for now)
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { title, genre, cover, year, coop, studioIds } = req.body;
    if (!title || !genre) {
      return res.status(400).json({ error: "title and genre are required" });
    }

    const game = await prisma.game.create({
      data: {
        title, genre,
        cover:  cover  || "🎮",
        year:   year   ? parseInt(year) : null,
        coop:   coop   ?? false,
        studios: studioIds?.length
          ? { create: studioIds.map(sid => ({ studioId: sid })) }
          : undefined,
      },
      include: { studios: { include: { studio: true } } },
    });
    res.status(201).json(game);
  } catch (err) { next(err); }
});

module.exports = router;
