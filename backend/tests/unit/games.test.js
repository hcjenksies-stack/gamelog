// ─── Unit Tests: Games Routes ─────────────────────────────────────────────────
// Covers the game catalog: listing, searching, fetching a single game,
// and creating games.

const { req } = require("../helpers/request");
const jwt     = require("jsonwebtoken");

jest.mock("@prisma/client", () => {
  const db = {
    game: {
      findMany:   jest.fn(),
      findUnique: jest.fn(),
      create:     jest.fn(),
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

const mockGame = {
  id: 1, title: "Elden Ring", genre: "RPG", cover: "\u2694\ufe0f",
  year: 2022, coop: false, rawgId: 123, metacritic: 96,
  backgroundImage: null, rawgRating: 4.5, developer: "FromSoftware",
  studios: [],
};

describe("GET /games", () => {
  it("returns a list of games", async () => {
    db.game.findMany.mockResolvedValue([mockGame]);
    const res = await req(app, "GET", "/games");
    expect(res.status).toBe(200);
    expect(res.body[0].title).toBe("Elden Ring");
  });

  it("filters by genre", async () => {
    db.game.findMany.mockResolvedValue([mockGame]);
    const res = await req(app, "GET", "/games?genre=RPG");
    expect(res.status).toBe(200);
  });

  it("supports full-text search by title", async () => {
    db.game.findMany.mockResolvedValue([mockGame]);
    const res = await req(app, "GET", "/games?q=Elden");
    expect(res.status).toBe(200);
  });
});

describe("GET /games/:id", () => {
  it("returns a single game with reviews", async () => {
    db.game.findUnique.mockResolvedValue({ ...mockGame, reviews: [], blurbs: [] });
    const res = await req(app, "GET", "/games/1");
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Elden Ring");
  });

  it("returns 404 when game does not exist", async () => {
    db.game.findUnique.mockResolvedValue(null);
    const res = await req(app, "GET", "/games/9999");
    expect(res.status).toBe(404);
  });
});

describe("POST /games", () => {
  it("creates a game when authenticated", async () => {
    db.game.create.mockResolvedValue(mockGame);
    const res = await req(app, "POST", "/games", { headers: authHeader(), body: { title: "Elden Ring", genre: "RPG" } });
    expect(res.status).toBe(201);
  });

  it("returns 400 when title or genre is missing", async () => {
    const res = await req(app, "POST", "/games", { headers: authHeader(), body: { title: "X" } });
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    const res = await req(app, "POST", "/games", { body: { title: "X", genre: "RPG" } });
    expect(res.status).toBe(401);
  });
});
