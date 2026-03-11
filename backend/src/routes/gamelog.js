const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");

const prisma = new PrismaClient();

// POST /log — log or update a game for the current user
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { gameId, platform, progress, hours, trophiesEarned, trophiesTotal, platinum, coop } = req.body;
    if (!gameId) return res.status(400).json({ error: "gameId is required" });

    const log = await prisma.gameLog.upsert({
      where: { userId_gameId: { userId: req.user.id, gameId: parseInt(gameId) } },
      update: {
        ...(platform        !== undefined && { platform }),
        ...(progress        !== undefined && { progress: parseInt(progress) }),
        ...(hours           !== undefined && { hours: parseFloat(hours) }),
        ...(trophiesEarned  !== undefined && { trophiesEarned: parseInt(trophiesEarned) }),
        ...(trophiesTotal   !== undefined && { trophiesTotal: parseInt(trophiesTotal) }),
        ...(platinum        !== undefined && { platinum }),
        ...(coop            !== undefined && { coop }),
      },
      create: {
        userId:        req.user.id,
        gameId:        parseInt(gameId),
        platform:      platform      || null,
        progress:      parseInt(progress  || 0),
        hours:         parseFloat(hours   || 0),
        trophiesEarned:parseInt(trophiesEarned || 0),
        trophiesTotal: parseInt(trophiesTotal  || 0),
        platinum:      platinum  ?? false,
        coop:          coop      ?? false,
      },
      include: { game: true },
    });

    res.status(200).json(log);
  } catch (err) { next(err); }
});

// PATCH /log/:gameId — partial update
router.patch("/:gameId", requireAuth, async (req, res, next) => {
  try {
    const gameId = parseInt(req.params.gameId);
    const allowed = ["platform", "progress", "hours", "trophiesEarned", "trophiesTotal", "platinum", "coop"];
    const data = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }

    const log = await prisma.gameLog.update({
      where: { userId_gameId: { userId: req.user.id, gameId } },
      data,
      include: { game: true },
    });
    res.json(log);
  } catch (err) { next(err); }
});

// DELETE /log/:gameId — remove from library
router.delete("/:gameId", requireAuth, async (req, res, next) => {
  try {
    const gameId = parseInt(req.params.gameId);
    await prisma.gameLog.delete({
      where: { userId_gameId: { userId: req.user.id, gameId } },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /log/me — current user's full library
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const logs = await prisma.gameLog.findMany({
      where: { userId: req.user.id },
      include: { game: { include: { studios: { include: { studio: true } } } } },
      orderBy: { updatedAt: "desc" },
    });
    res.json(logs);
  } catch (err) { next(err); }
});

module.exports = router;
