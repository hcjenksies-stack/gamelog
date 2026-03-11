// ─── Unit Tests: Reviews Routes ───────────────────────────────────────────────
// Covers posting, fetching, editing, and deleting game reviews.
// Reviews are rated 1–10 and upserted per user/game pair.

const request = require("supertest");
const jwt     = require("jsonwebtoken");

jest.mock("@prisma/client", () => {
  const db = {
    review: {
      upsert:     jest.fn(),
      findMany:   jest.fn(),
      findUnique: jest.fn(),
      update:     jest.fn(),
      delete:     jest.fn(),
      aggregate:  jest.fn(),
    },
    game: { update: jest.fn() },
  };
  const PrismaClient = jest.fn(() => db);
  PrismaClient.__db = db;
  return { PrismaClient };
});

const { PrismaClient } = require("@prisma/client");
const db  = PrismaClient.__db;
const app = require("../../src/app");

function authHeader(payload = { id: 1, username: "alice" }) {
  return { Authorization: `Bearer ${jwt.sign(payload, process.env.JWT_SECRET)}` };
}

const mockReview = {
  id: 1, userId: 1, gameId: 5, rating: 9, body: "Incredible game",
  user: { id: 1, username: "alice", handle: "@alice", avatar: "A", avatarColor: "#5865f2" },
  game: { id: 5, title: "God of War", cover: "\ud83c\udfae" },
};

describe("POST /reviews", () => {
  it("creates or updates a review with a valid rating", async () => {
    db.review.upsert.mockResolvedValue(mockReview);
    db.review.aggregate.mockResolvedValue({ _avg: { rating: 9 }, _count: { rating: 1 } });
    db.game.update.mockResolvedValue({});

    const res = await request(app)
      .post("/reviews")
      .set(authHeader())
      .send({ gameId: 5, rating: 9, body: "Incredible game" });

    expect(res.status).toBe(201);
    expect(res.body.rating).toBe(9);
  });

  it("returns 400 when rating is out of range", async () => {
    const res = await request(app)
      .post("/reviews")
      .set(authHeader())
      .send({ gameId: 5, rating: 11, body: "Too high" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(app)
      .post("/reviews")
      .set(authHeader())
      .send({ gameId: 5 });
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).post("/reviews").send({ gameId: 5, rating: 8, body: "good" });
    expect(res.status).toBe(401);
  });
});

describe("GET /reviews/game/:gameId", () => {
  it("returns all reviews for a game", async () => {
    db.review.findMany.mockResolvedValue([mockReview]);
    const res = await request(app).get("/reviews/game/5");
    expect(res.status).toBe(200);
    expect(res.body[0].body).toBe("Incredible game");
  });
});

describe("PATCH /reviews/:id", () => {
  it("edits own review", async () => {
    db.review.findUnique.mockResolvedValue({ ...mockReview, userId: 1 });
    db.review.update.mockResolvedValue({ ...mockReview, body: "Updated" });
    db.review.aggregate.mockResolvedValue({ _avg: { rating: 9 }, _count: { rating: 1 } });
    db.game.update.mockResolvedValue({});

    const res = await request(app)
      .patch("/reviews/1")
      .set(authHeader())
      .send({ body: "Updated" });
    expect(res.status).toBe(200);
  });

  it("returns 403 when editing another user's review", async () => {
    db.review.findUnique.mockResolvedValue({ ...mockReview, userId: 99 });
    const res = await request(app)
      .patch("/reviews/1")
      .set(authHeader({ id: 1, username: "alice" }))
      .send({ body: "hacked" });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /reviews/:id", () => {
  it("deletes own review", async () => {
    db.review.findUnique.mockResolvedValue({ ...mockReview, userId: 1 });
    db.review.delete.mockResolvedValue({});
    db.review.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { rating: 0 } });
    db.game.update.mockResolvedValue({});

    const res = await request(app).delete("/reviews/1").set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 403 when deleting another user's review", async () => {
    db.review.findUnique.mockResolvedValue({ ...mockReview, userId: 99 });
    const res = await request(app).delete("/reviews/1").set(authHeader());
    expect(res.status).toBe(403);
  });
});
