// ─── Unit Tests: Game Log Routes ──────────────────────────────────────────────
// Covers adding games to a user's library, updating log entries, and removal.

const request = require("supertest");
const jwt     = require("jsonwebtoken");

jest.mock("@prisma/client", () => {
  const db = {
    gameLog: {
      upsert:   jest.fn(),
      update:   jest.fn(),
      delete:   jest.fn(),
      findMany: jest.fn(),
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

const mockLog = {
  id: 10, userId: 1, gameId: 5, platform: "PS5",
  progress: 50, hours: 12.5, platinum: false, coop: false,
  trophiesEarned: 10, trophiesTotal: 40,
  game: { id: 5, title: "God of War", cover: "\ud83c\udfae", genre: "Action" },
};

describe("POST /log", () => {
  it("creates or updates a game log entry", async () => {
    db.gameLog.upsert.mockResolvedValue(mockLog);
    const res = await request(app)
      .post("/log")
      .set(authHeader())
      .send({ gameId: 5, platform: "PS5", progress: 50, hours: 12.5 });
    expect(res.status).toBe(200);
    expect(res.body.gameId).toBe(5);
  });

  it("returns 400 when gameId is missing", async () => {
    const res = await request(app).post("/log").set(authHeader()).send({ platform: "PS5" });
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).post("/log").send({ gameId: 5 });
    expect(res.status).toBe(401);
  });
});

describe("PATCH /log/:gameId", () => {
  it("partially updates a log entry", async () => {
    db.gameLog.update.mockResolvedValue({ ...mockLog, progress: 75 });
    const res = await request(app)
      .patch("/log/5")
      .set(authHeader())
      .send({ progress: 75 });
    expect(res.status).toBe(200);
    expect(res.body.progress).toBe(75);
  });
});

describe("DELETE /log/:gameId", () => {
  it("removes a game from the library", async () => {
    db.gameLog.delete.mockResolvedValue({});
    const res = await request(app).delete("/log/5").set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("GET /log/me", () => {
  it("returns the user's full game library", async () => {
    db.gameLog.findMany.mockResolvedValue([mockLog]);
    const res = await request(app).get("/log/me").set(authHeader());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].gameId).toBe(5);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/log/me");
    expect(res.status).toBe(401);
  });
});
