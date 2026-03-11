// ─── Integration Tests: Full API Flows ───────────────────────────────────────
// Tests complete user journeys through multiple endpoints in sequence.
// Prisma is still mocked (no real DB needed), but this verifies that the
// full Express pipeline — routing, middleware, controllers — works end-to-end.

const request = require("supertest");
const bcrypt  = require("bcryptjs");

jest.mock("bcryptjs", () => ({
  hash:    jest.fn().mockResolvedValue("$2b$12$hashed"),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock("../../src/sync/rawgSync", () => ({
  syncRawg:        jest.fn().mockResolvedValue(),
  scheduleSyncRawg: jest.fn().mockResolvedValue(),
}));

jest.mock("@prisma/client", () => {
  const db = {
    user:    { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    game:    { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    gameLog: { upsert: jest.fn(), findMany: jest.fn() },
    review:  { upsert: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), delete: jest.fn(), aggregate: jest.fn() },
    follow:  { upsert: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
    studioFollow: { findMany: jest.fn() },
    blurb:   { findMany: jest.fn() },
    achievement: { findMany: jest.fn() },
    studio:  { findUnique: jest.fn() },
  };
  const PrismaClient = jest.fn(() => db);
  PrismaClient.__db = db;
  return { PrismaClient };
});

const { PrismaClient } = require("@prisma/client");
const db  = PrismaClient.__db;
const app = require("../../src/app");

// ── Flow 1: Full auth cycle ────────────────────────────────────────────────────
describe("Auth flow: register → login → access protected route", () => {
  let accessToken;

  const userData = { id: 1, username: "flowuser", handle: "@flowuser", email: "flow@test.com", avatar: "F", avatarColor: "#5865f2" };

  it("1. registers a new user", async () => {
    db.user.findFirst.mockResolvedValue(null);
    db.user.create.mockResolvedValue(userData);
    db.user.update.mockResolvedValue({});

    const res = await request(app).post("/auth/register").send({
      username: "flowuser", email: "flow@test.com", password: "pass123",
    });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    accessToken = res.body.accessToken;
  });

  it("2. logs in with the same credentials", async () => {
    db.user.findUnique.mockResolvedValue({ ...userData, passwordHash: "$2b$12$hashed" });
    db.user.update.mockResolvedValue({});

    const res = await request(app).post("/auth/login").send({
      email: "flow@test.com", password: "pass123",
    });
    expect(res.status).toBe(200);
    accessToken = res.body.accessToken;
  });

  it("3. accesses a protected route with the token", async () => {
    db.user.findUnique.mockResolvedValue({
      ...userData,
      bio: null, country: null, age: null, isPublic: true, isVerified: false,
      isInfluencer: false, liveNow: false, currentGame: null, currentPlatform: null,
      status: null, createdAt: new Date(), steamId: null, steamUsername: null,
      steamAvatar: null, discordId: null, discordUsername: null, discordAvatar: null,
      psnHandle: null, xboxGamertag: null, avatarUrl: null, phone: null, onboarded: false,
      badges: [], streams: [], _count: { followers: 0, following: 0, gameLogs: 0 },
    });

    const res = await request(app)
      .get("/users/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("flowuser");
  });
});

// ── Flow 2: Game log lifecycle ─────────────────────────────────────────────────
describe("Game log flow: add game → review → get library", () => {
  const token = require("jsonwebtoken").sign({ id: 1, username: "alice" }, process.env.JWT_SECRET);
  const authHeader = { Authorization: `Bearer ${token}` };

  it("1. adds a game to the library", async () => {
    db.gameLog.upsert.mockResolvedValue({
      id: 1, userId: 1, gameId: 5, platform: "PC", progress: 0,
      game: { id: 5, title: "Hades", cover: "\ud83d\udde1\ufe0f" },
    });

    const res = await request(app).post("/log").set(authHeader).send({ gameId: 5, platform: "PC" });
    expect(res.status).toBe(200);
    expect(res.body.gameId).toBe(5);
  });

  it("2. posts a review for the game", async () => {
    db.review.upsert.mockResolvedValue({
      id: 1, userId: 1, gameId: 5, rating: 10, body: "Perfect game",
      user: { id: 1, username: "alice", handle: "@alice", avatar: "A", avatarColor: "#5865f2" },
      game: { id: 5, title: "Hades", cover: "\ud83d\udde1\ufe0f" },
    });
    db.review.aggregate.mockResolvedValue({ _avg: { rating: 10 }, _count: { rating: 1 } });
    db.game.update = jest.fn().mockResolvedValue({});

    const res = await request(app).post("/reviews").set(authHeader).send({
      gameId: 5, rating: 10, body: "Perfect game",
    });
    expect(res.status).toBe(201);
    expect(res.body.rating).toBe(10);
  });

  it("3. retrieves the full library", async () => {
    db.gameLog.findMany.mockResolvedValue([{
      id: 1, userId: 1, gameId: 5, platform: "PC",
      game: { id: 5, title: "Hades", cover: "\ud83d\udde1\ufe0f", studios: [] },
    }]);

    const res = await request(app).get("/log/me").set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });
});

// ── Flow 3: Social — follow + feed ────────────────────────────────────────────
describe("Social flow: follow user → get feed", () => {
  const token = require("jsonwebtoken").sign({ id: 1, username: "alice" }, process.env.JWT_SECRET);
  const authHeader = { Authorization: `Bearer ${token}` };

  it("1. follows another user", async () => {
    db.user.findUnique.mockResolvedValue({ id: 2, username: "bob" });
    db.follow.upsert.mockResolvedValue({ followerId: 1, followingId: 2 });

    const res = await request(app).post("/follows/2").set(authHeader);
    expect(res.status).toBe(201);
  });

  it("2. gets an empty feed when followed user has no activity", async () => {
    db.follow.findMany.mockResolvedValue([{ followingId: 2, favorited: false }]);
    db.studioFollow.findMany.mockResolvedValue([]);
    db.gameLog.findMany.mockResolvedValue([]);
    db.review.findMany.mockResolvedValue([]);
    db.blurb.findMany.mockResolvedValue([]);
    db.achievement.findMany.mockResolvedValue([]);
    // Mock user.findMany for live influencer check inside the feed route
    db.user.findMany.mockResolvedValue([]);

    const res = await request(app).get("/feed").set(authHeader);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
