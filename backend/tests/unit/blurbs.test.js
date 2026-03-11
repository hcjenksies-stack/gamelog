// ─── Unit Tests: Blurbs Routes ────────────────────────────────────────────────
// Covers posting short unrated takes on games (max 280 chars), listing them,
// and deleting your own.

const { req } = require("../helpers/request");
const jwt     = require("jsonwebtoken");

jest.mock("@prisma/client", () => {
  const db = {
    blurb: {
      create:     jest.fn(),
      findMany:   jest.fn(),
      findUnique: jest.fn(),
      delete:     jest.fn(),
    },
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

const mockBlurb = {
  id: 1, userId: 1, gameId: 5, text: "This game is awesome",
  user: { id: 1, username: "alice", handle: "@alice", avatar: "A", avatarColor: "#5865f2" },
  game: { id: 5, title: "God of War", cover: "\ud83c\udfae" },
};

describe("POST /blurbs", () => {
  it("creates a blurb", async () => {
    db.blurb.create.mockResolvedValue(mockBlurb);
    const res = await req(app, "POST", "/blurbs", { headers: authHeader(), body: { gameId: 5, text: "This game is awesome" } });
    expect(res.status).toBe(201);
    expect(res.body.text).toBe("This game is awesome");
  });

  it("returns 400 when text exceeds 280 characters", async () => {
    const res = await req(app, "POST", "/blurbs", { headers: authHeader(), body: { gameId: 5, text: "x".repeat(281) } });
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await req(app, "POST", "/blurbs", { headers: authHeader(), body: { gameId: 5 } });
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await req(app, "POST", "/blurbs", { body: { gameId: 5, text: "cool" } });
    expect(res.status).toBe(401);
  });
});

describe("GET /blurbs/game/:gameId", () => {
  it("returns blurbs for a game", async () => {
    db.blurb.findMany.mockResolvedValue([mockBlurb]);
    const res = await req(app, "GET", "/blurbs/game/5");
    expect(res.status).toBe(200);
    expect(res.body[0].text).toBe("This game is awesome");
  });
});

describe("DELETE /blurbs/:id", () => {
  it("deletes own blurb", async () => {
    db.blurb.findUnique.mockResolvedValue({ ...mockBlurb, userId: 1 });
    db.blurb.delete.mockResolvedValue({});
    const res = await req(app, "DELETE", "/blurbs/1", { headers: authHeader() });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 403 when deleting another user's blurb", async () => {
    db.blurb.findUnique.mockResolvedValue({ ...mockBlurb, userId: 99 });
    const res = await req(app, "DELETE", "/blurbs/1", { headers: authHeader() });
    expect(res.status).toBe(403);
  });
});
