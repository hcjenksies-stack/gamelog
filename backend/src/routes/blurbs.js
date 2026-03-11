const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const prisma = new PrismaClient();

// POST /blurbs — post a blurb (short take, no rating)
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { gameId, text } = req.body;
    if (!gameId || !text) {
      return res.status(400).json({ error: "gameId and text are required" });
    }
    if (text.length > 280) {
      return res.status(400).json({ error: "Blurb must be 280 characters or fewer" });
    }

    const blurb = await prisma.blurb.create({
      data: { userId: req.user.id, gameId: parseInt(gameId), text },
      include: {
        user: { select: { id: true, username: true, handle: true, avatar: true, avatarColor: true } },
        game: { select: { id: true, title: true, cover: true } },
      },
    });
    res.status(201).json(blurb);
  } catch (err) { next(err); }
});

// GET /blurbs/game/:gameId — blurbs for a specific game
router.get("/game/:gameId", optionalAuth, async (req, res, next) => {
  try {
    const gameId = parseInt(req.params.gameId);
    const { limit = 20, offset = 0 } = req.query;
    const blurbs = await prisma.blurb.findMany({
      where: { gameId },
      include: { user: { select: { id: true, username: true, handle: true, avatar: true, avatarColor: true } } },
      orderBy: { createdAt: "desc" },
      take: parseInt(limit),
      skip: parseInt(offset),
    });
    res.json(blurbs);
  } catch (err) { next(err); }
});

// DELETE /blurbs/:id — delete own blurb
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const blurb = await prisma.blurb.findUnique({ where: { id } });
    if (!blurb) return res.status(404).json({ error: "Blurb not found" });
    if (blurb.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });

    await prisma.blurb.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
