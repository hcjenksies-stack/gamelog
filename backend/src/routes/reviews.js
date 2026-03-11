const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const prisma = new PrismaClient();

// POST /reviews — post a review
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { gameId, rating, body } = req.body;
    if (!gameId || rating == null || !body) {
      return res.status(400).json({ error: "gameId, rating, and body are required" });
    }
    if (rating < 1 || rating > 10) {
      return res.status(400).json({ error: "rating must be between 1 and 10" });
    }

    const review = await prisma.review.upsert({
      where: { userId_gameId: { userId: req.user.id, gameId: parseInt(gameId) } },
      update: { rating: parseInt(rating), body },
      create: { userId: req.user.id, gameId: parseInt(gameId), rating: parseInt(rating), body },
      include: {
        user: { select: { id: true, username: true, handle: true, avatar: true, avatarColor: true } },
        game: { select: { id: true, title: true, cover: true } },
      },
    });

    // Update game aggregate rating
    await recalcRating(parseInt(gameId));

    res.status(201).json(review);
  } catch (err) { next(err); }
});

// GET /reviews/game/:gameId — all reviews for a game
router.get("/game/:gameId", optionalAuth, async (req, res, next) => {
  try {
    const gameId = parseInt(req.params.gameId);
    const { limit = 20, offset = 0 } = req.query;
    const reviews = await prisma.review.findMany({
      where: { gameId },
      include: { user: { select: { id: true, username: true, handle: true, avatar: true, avatarColor: true } } },
      orderBy: { createdAt: "desc" },
      take: parseInt(limit),
      skip: parseInt(offset),
    });
    res.json(reviews);
  } catch (err) { next(err); }
});

// PATCH /reviews/:id — edit own review
router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const review = await prisma.review.findUnique({ where: { id } });
    if (!review) return res.status(404).json({ error: "Review not found" });
    if (review.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });

    const data = {};
    if (req.body.rating != null) data.rating = parseInt(req.body.rating);
    if (req.body.body   != null) data.body   = req.body.body;

    const updated = await prisma.review.update({
      where: { id },
      data,
      include: { game: { select: { id: true, title: true } } },
    });
    await recalcRating(review.gameId);
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /reviews/:id — delete own review
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const review = await prisma.review.findUnique({ where: { id } });
    if (!review) return res.status(404).json({ error: "Review not found" });
    if (review.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });

    await prisma.review.delete({ where: { id } });
    await recalcRating(review.gameId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

async function recalcRating(gameId) {
  const agg = await prisma.review.aggregate({
    where: { gameId },
    _avg: { rating: true },
    _count: { rating: true },
  });
  await prisma.game.update({
    where: { id: gameId },
    data: {
      avgRating:   agg._avg.rating,
      reviewCount: agg._count.rating,
    },
  });
}

module.exports = router;
