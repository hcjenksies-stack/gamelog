const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { requireAuth, optionalAuth } = require("../middleware/auth");

const prisma = new PrismaClient();

// GET /studios — list all studios
router.get("/", optionalAuth, async (req, res, next) => {
  try {
    const studios = await prisma.studio.findMany({
      include: {
        _count: { select: { followers: true, games: true } },
        games:  { include: { game: true }, take: 5 },
      },
      orderBy: { name: "asc" },
    });

    // Attach viewer's follow status
    if (req.user) {
      const myFollows = await prisma.studioFollow.findMany({
        where: { userId: req.user.id },
        select: { studioId: true },
      });
      const followedSet = new Set(myFollows.map(f => f.studioId));
      return res.json(studios.map(s => ({ ...s, following: followedSet.has(s.id) })));
    }

    res.json(studios);
  } catch (err) { next(err); }
});

// GET /studios/:id — single studio profile
router.get("/:id", optionalAuth, async (req, res, next) => {
  try {
    const studio = await prisma.studio.findUnique({
      where: { id: req.params.id },
      include: {
        games:    { include: { game: true } },
        news:     { orderBy: { createdAt: "desc" }, take: 10 },
        upcoming: { orderBy: { releaseDate: "asc" } },
        _count:   { select: { followers: true } },
      },
    });
    if (!studio) return res.status(404).json({ error: "Studio not found" });

    let following = false;
    if (req.user) {
      const f = await prisma.studioFollow.findUnique({
        where: { userId_studioId: { userId: req.user.id, studioId: studio.id } },
      });
      following = !!f;
    }

    res.json({ ...studio, following });
  } catch (err) { next(err); }
});

// POST /studios/:id/follow — follow a studio
router.post("/:id/follow", requireAuth, async (req, res, next) => {
  try {
    const studioId = req.params.id;
    const studio = await prisma.studio.findUnique({ where: { id: studioId } });
    if (!studio) return res.status(404).json({ error: "Studio not found" });

    await prisma.studioFollow.upsert({
      where: { userId_studioId: { userId: req.user.id, studioId } },
      update: {},
      create: { userId: req.user.id, studioId },
    });
    res.status(201).json({ ok: true, following: true });
  } catch (err) { next(err); }
});

// DELETE /studios/:id/follow — unfollow a studio
router.delete("/:id/follow", requireAuth, async (req, res, next) => {
  try {
    const studioId = req.params.id;
    await prisma.studioFollow.delete({
      where: { userId_studioId: { userId: req.user.id, studioId } },
    });
    res.json({ ok: true, following: false });
  } catch (err) { next(err); }
});

// POST /studios — create a studio (admin use)
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { id, name, handle, avatar, founded, location, bio } = req.body;
    if (!id || !name || !handle) {
      return res.status(400).json({ error: "id, name and handle are required" });
    }
    const studio = await prisma.studio.create({
      data: { id, name, handle, avatar: avatar || "🎮", founded, location, bio },
    });
    res.status(201).json(studio);
  } catch (err) { next(err); }
});

module.exports = router;
