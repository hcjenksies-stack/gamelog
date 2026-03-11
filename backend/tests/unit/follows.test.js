// ─── Unit Tests: Follows Routes ───────────────────────────────────────────────
// Covers following/unfollowing users and toggling the favorited (priority) flag.

const { req } = require("../helpers/request");
const jwt     = require("jsonwebtoken");

jest.mock("@prisma/client", () => {
  const db = {
    user:   { findUnique: jest.fn() },
    follow: { upsert: jest.fn(), delete: jest.fn(), update: jest.fn() },
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

describe("POST /follows/:userId", () => {
  it("follows a user", async () => {
    db.user.findUnique.mockResolvedValue({ id: 2, username: "bob" });
    db.follow.upsert.mockResolvedValue({ followerId: 1, followingId: 2 });

    const res = await req(app, "POST", "/follows/2", { headers: authHeader() });
    expect(res.status).toBe(201);
  });

  it("returns 400 when trying to follow yourself", async () => {
    const res = await req(app, "POST", "/follows/1", { headers: authHeader({ id: 1, username: "alice" }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when target user does not exist", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const res = await req(app, "POST", "/follows/9999", { headers: authHeader() });
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await req(app, "POST", "/follows/2");
    expect(res.status).toBe(401);
  });
});

describe("DELETE /follows/:userId", () => {
  it("unfollows a user", async () => {
    db.follow.delete.mockResolvedValue({});
    const res = await req(app, "DELETE", "/follows/2", { headers: authHeader() });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("PATCH /follows/:userId", () => {
  it("updates the favorited flag", async () => {
    db.follow.update.mockResolvedValue({ followerId: 1, followingId: 2, favorited: true });
    const res = await req(app, "PATCH", "/follows/2", { headers: authHeader(), body: { favorited: true } });
    expect(res.status).toBe(200);
    expect(res.body.favorited).toBe(true);
  });

  it("returns 400 when favorited field is missing", async () => {
    const res = await req(app, "PATCH", "/follows/2", { headers: authHeader(), body: {} });
    expect(res.status).toBe(400);
  });
});
