// ─── Unit Tests: User Routes ──────────────────────────────────────────────────
// Covers profile retrieval, updates, user listing, and public profile lookups.

const { req } = require("../helpers/request");
const jwt     = require("jsonwebtoken");

jest.mock("@prisma/client", () => {
  const db = {
    user:         { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    studioFollow: { findMany: jest.fn() },
    follow:       { findMany: jest.fn() },
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

const baseUser = {
  id: 1, username: "alice", handle: "@alice", email: "alice@test.com",
  avatar: "A", avatarColor: "#5865f2", bio: null, country: null,
  age: null, isPublic: true, isVerified: false, isInfluencer: false,
  liveNow: false, currentGame: null, currentPlatform: null, status: null,
  steamId: null, steamUsername: null, steamAvatar: null,
  discordId: null, discordUsername: null, discordAvatar: null,
  psnHandle: null, xboxGamertag: null, avatarUrl: null, phone: null,
  onboarded: false, createdAt: new Date().toISOString(),
  badges: [], streams: [], _count: { followers: 0, following: 0, gameLogs: 0 },
};

describe("GET /users/me", () => {
  it("returns own profile when authenticated", async () => {
    db.user.findUnique.mockResolvedValue({ ...baseUser });
    const res = await req(app, "GET", "/users/me", { headers: authHeader() });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("alice");
  });

  it("returns 401 when not authenticated", async () => {
    const res = await req(app, "GET", "/users/me");
    expect(res.status).toBe(401);
  });
});

describe("PATCH /users/me", () => {
  it("updates allowed profile fields", async () => {
    db.user.update.mockResolvedValue({ ...baseUser, bio: "I play games" });
    const res = await req(app, "PATCH", "/users/me", { headers: authHeader(), body: { bio: "I play games" } });
    expect(res.status).toBe(200);
    expect(res.body.bio).toBe("I play games");
  });

  it("returns 401 when not authenticated", async () => {
    const res = await req(app, "PATCH", "/users/me", { body: { bio: "x" } });
    expect(res.status).toBe(401);
  });
});

describe("GET /users", () => {
  it("returns a list of users", async () => {
    db.user.findMany.mockResolvedValue([baseUser]);
    const res = await req(app, "GET", "/users");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].username).toBe("alice");
  });

  it("supports search by ?q=", async () => {
    db.user.findMany.mockResolvedValue([]);
    const res = await req(app, "GET", "/users?q=nobody");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /users/:idOrHandle", () => {
  it("returns a public profile by numeric id", async () => {
    db.user.findUnique.mockResolvedValue(baseUser);
    const res = await req(app, "GET", "/users/1");
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("alice");
  });

  it("returns 404 when user does not exist", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const res = await req(app, "GET", "/users/9999");
    expect(res.status).toBe(404);
  });
});
