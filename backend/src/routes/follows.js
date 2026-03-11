const router = require("express").Router();
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");

const prisma = new PrismaClient();

// POST /follows/:userId — follow a user
router.post("/:userId", requireAuth, async (req, res, next) => {
  try {
    const followingId = parseInt(req.params.userId);
    if (followingId === req.user.id) {
      return res.status(400).json({ error: "Cannot follow yourself" });
    }

    const target = await prisma.user.findUnique({ where: { id: followingId } });
    if (!target) return res.status(404).json({ error: "User not found" });

    const follow = await prisma.follow.upsert({
      where: { followerId_followingId: { followerId: req.user.id, followingId } },
      update: {},
      create: { followerId: req.user.id, followingId },
    });
    res.status(201).json(follow);
  } catch (err) { next(err); }
});

// DELETE /follows/:userId — unfollow a user
router.delete("/:userId", requireAuth, async (req, res, next) => {
  try {
    const followingId = parseInt(req.params.userId);
    await prisma.follow.delete({
      where: { followerId_followingId: { followerId: req.user.id, followingId } },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /follows/:userId — toggle favorited / prioritized
router.patch("/:userId", requireAuth, async (req, res, next) => {
  try {
    const followingId = parseInt(req.params.userId);
    const { favorited } = req.body;
    if (favorited == null) return res.status(400).json({ error: "favorited boolean required" });

    const follow = await prisma.follow.update({
      where: { followerId_followingId: { followerId: req.user.id, followingId } },
      data: { favorited },
    });
    res.json(follow);
  } catch (err) { next(err); }
});

module.exports = router;
