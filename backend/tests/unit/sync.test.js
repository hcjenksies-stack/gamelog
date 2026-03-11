// ─── Unit Tests: Sync Routes ──────────────────────────────────────────────────
// Covers the RAWG sync trigger (key-protected) and the public status endpoint.

const request = require("supertest");

// Mock syncRawg so tests don't fire real HTTP requests to RAWG
jest.mock("../../src/sync/rawgSync", () => ({
  syncRawg:        jest.fn().mockResolvedValue(),
  scheduleSyncRawg: jest.fn().mockResolvedValue(),
}));

jest.mock("@prisma/client", () => {
  const db = { game: { count: jest.fn() } };
  const PrismaClient = jest.fn(() => db);
  PrismaClient.__db = db;
  return { PrismaClient };
});

const { PrismaClient } = require("@prisma/client");
const db  = PrismaClient.__db;
const app = require("../../src/app");

describe("GET /sync/rawg", () => {
  it("starts a sync and returns currentCount when key is valid", async () => {
    db.game.count.mockResolvedValue(6000);
    const res = await request(app).get(`/sync/rawg?key=${process.env.SYNC_KEY}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.currentCount).toBe(6000);
  });

  it("returns 401 when key is wrong", async () => {
    const res = await request(app).get("/sync/rawg?key=wrongkey");
    expect(res.status).toBe(401);
  });

  it("returns 401 when key is missing", async () => {
    const res = await request(app).get("/sync/rawg");
    expect(res.status).toBe(401);
  });
});

describe("GET /sync/status", () => {
  it("returns total and fromRawg counts", async () => {
    db.game.count.mockResolvedValueOnce(6000).mockResolvedValueOnce(5995);
    const res = await request(app).get("/sync/status");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(6000);
    expect(res.body.fromRawg).toBe(5995);
  });
});
