// ─── Unit Tests: Auth Routes ──────────────────────────────────────────────────
// Covers user registration, login, token refresh, and logout.
// Prisma and bcryptjs are mocked so no real database or hashing occurs.

const { req } = require("../helpers/request");
const jwt     = require("jsonwebtoken");
const bcrypt  = require("bcryptjs");

// ── Prisma mock ───────────────────────────────────────────────────────────────
// Must be defined before any app require so routes get the mock on load
jest.mock("@prisma/client", () => {
  const db = {
    user: {
      findFirst:  jest.fn(),
      findUnique: jest.fn(),
      create:     jest.fn(),
      update:     jest.fn(),
    },
  };
  const PrismaClient = jest.fn(() => db);
  PrismaClient.__db = db;
  return { PrismaClient };
});

jest.mock("bcryptjs", () => ({
  hash:    jest.fn().mockResolvedValue("$2b$12$hashed"),
  compare: jest.fn(),
}));

const { PrismaClient } = require("@prisma/client");
const db  = PrismaClient.__db;
const app = require("../../src/app");

// Helper — creates a valid access token for use in Authorization headers
function makeToken(payload = { id: 1, username: "alice" }) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "15m" });
}

describe("POST /auth/register", () => {
  it("creates a user and returns tokens on valid input", async () => {
    db.user.findFirst.mockResolvedValue(null);  // no duplicate
    db.user.create.mockResolvedValue({ id: 1, username: "alice", handle: "@alice", email: "alice@test.com", avatar: "A", avatarColor: "#5865f2" });
    db.user.update.mockResolvedValue({});

    const res = await req(app, "POST", "/auth/register", {
      body: { username: "alice", email: "alice@test.com", password: "secret123" },
    });

    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe("alice");
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await req(app, "POST", "/auth/register", { body: { username: "bob" } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("returns 409 when email or username is already taken", async () => {
    db.user.findFirst.mockResolvedValue({ id: 99 }); // existing user
    const res = await req(app, "POST", "/auth/register", {
      body: { username: "alice", email: "alice@test.com", password: "secret123" },
    });
    expect(res.status).toBe(409);
  });
});

describe("POST /auth/login", () => {
  const mockUser = {
    id: 1, username: "alice", handle: "@alice",
    avatar: "A", avatarColor: "#5865f2",
    passwordHash: "$2b$12$hashed",
  };

  it("returns tokens on correct credentials", async () => {
    db.user.findUnique.mockResolvedValue(mockUser);
    bcrypt.compare.mockResolvedValue(true);
    db.user.update.mockResolvedValue({});

    const res = await req(app, "POST", "/auth/login", {
      body: { email: "alice@test.com", password: "secret123" },
    });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it("returns 401 on wrong password", async () => {
    db.user.findUnique.mockResolvedValue(mockUser);
    bcrypt.compare.mockResolvedValue(false);

    const res = await req(app, "POST", "/auth/login", {
      body: { email: "alice@test.com", password: "wrongpass" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when user does not exist", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const res = await req(app, "POST", "/auth/login", {
      body: { email: "nobody@test.com", password: "pass" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when fields are missing", async () => {
    const res = await req(app, "POST", "/auth/login", { body: { email: "x@y.com" } });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/refresh", () => {
  it("issues a new access token for a valid refresh token", async () => {
    const refreshToken = jwt.sign({ id: 1 }, process.env.JWT_REFRESH_SECRET, { expiresIn: "30d" });
    db.user.findUnique.mockResolvedValue({ id: 1, username: "alice", refreshToken });
    db.user.update.mockResolvedValue({});

    const res = await req(app, "POST", "/auth/refresh", { body: { refreshToken } });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it("returns 400 when refreshToken is missing", async () => {
    const res = await req(app, "POST", "/auth/refresh", { body: {} });
    expect(res.status).toBe(400);
  });

  it("returns 401 when refresh token is invalid", async () => {
    const res = await req(app, "POST", "/auth/refresh", { body: { refreshToken: "badtoken" } });
    expect(res.status).toBe(401);
  });
});
