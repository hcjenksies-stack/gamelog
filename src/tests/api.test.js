// ─── Unit Tests: API Client Utilities ────────────────────────────────────────
// Tests the pure utility functions in api.js: token storage helpers and
// the adaptLog data transformation.

import { getToken, setTokens, clearTokens, adaptLog } from "../../api.js";

describe("Token storage helpers", () => {
  it("setTokens stores both access and refresh tokens", () => {
    setTokens("access-abc", "refresh-xyz");
    expect(localStorage.getItem("gl_token")).toBe("access-abc");
    expect(localStorage.getItem("gl_refresh")).toBe("refresh-xyz");
  });

  it("getToken returns the stored access token", () => {
    localStorage.setItem("gl_token", "mytoken");
    expect(getToken()).toBe("mytoken");
  });

  it("getToken returns null when no token is stored", () => {
    expect(getToken()).toBeNull();
  });

  it("clearTokens removes both tokens", () => {
    setTokens("access-abc", "refresh-xyz");
    clearTokens();
    expect(localStorage.getItem("gl_token")).toBeNull();
    expect(localStorage.getItem("gl_refresh")).toBeNull();
  });
});

describe("adaptLog — converts API log response to component shape", () => {
  const rawLog = {
    id: 10,
    platform: "PS5",
    progress: 72,
    hours: 40.5,
    coop: false,
    trophiesEarned: 25,
    trophiesTotal: 50,
    platinum: false,
    game: {
      id: 5,
      title: "God of War",
      genre: "Action",
      cover: "\u2694\ufe0f",
      backgroundImage: "https://example.com/gow.jpg",
      year: 2018,
      developer: "Santa Monica Studio",
      avgRating: 9.5,
      reviewCount: 120,
      studios: [{ studio: { id: "santa-monica", name: "Santa Monica Studio" } }],
    },
  };

  it("maps game title and id", () => {
    const adapted = adaptLog(rawLog);
    expect(adapted.title).toBe("God of War");
    expect(adapted.id).toBe(5);
  });

  it("maps log fields: platform, progress, hours", () => {
    const adapted = adaptLog(rawLog);
    expect(adapted.platform).toBe("PS5");
    expect(adapted.progress).toBe(72);
    expect(adapted.hours).toBe(40.5);
  });

  it("maps trophies sub-object correctly", () => {
    const adapted = adaptLog(rawLog);
    expect(adapted.trophies.earned).toBe(25);
    expect(adapted.trophies.total).toBe(50);
    expect(adapted.trophies.platinum).toBe(false);
  });

  it("prefers studio name from studios array", () => {
    const adapted = adaptLog(rawLog);
    expect(adapted.studio).toBe("Santa Monica Studio");
    expect(adapted.studioId).toBe("santa-monica");
  });

  it("falls back to game.developer when studios array is empty", () => {
    const log = { ...rawLog, game: { ...rawLog.game, studios: [] } };
    const adapted = adaptLog(log);
    expect(adapted.studio).toBe("Santa Monica Studio");
  });

  it("handles missing game gracefully with defaults", () => {
    const adapted = adaptLog({ id: 1, game: null });
    expect(adapted.title).toBe("Unknown");
    expect(adapted.progress).toBe(0);
    expect(adapted.trophies.earned).toBe(0);
  });
});
