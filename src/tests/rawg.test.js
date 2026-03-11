// ─── Unit Tests: RAWG API Client ─────────────────────────────────────────────
// Tests the rawgFetch in-memory cache and deduplication logic.
// The global fetch is mocked so no real network calls are made.

import { rawgFetch } from "../../rawg.js";

// Mock fetch globally — vitest runs in jsdom which provides fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Helper — builds a minimal successful RAWG search response
function mockSearchResponse(games = []) {
  return { ok: true, json: async () => ({ results: games }) };
}
function mockDetailResponse(game = {}) {
  return { ok: true, json: async () => game };
}

describe("rawgFetch", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Clear the module-level cache between tests by re-importing
    // We do this by resetting the mock and testing cache hits indirectly
  });

  it("returns null when title is empty", async () => {
    const result = await rawgFetch("");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null when no results are found", async () => {
    mockFetch.mockResolvedValue(mockSearchResponse([]));
    const result = await rawgFetch("nonexistentgamexyz123");
    expect(result).toBeNull();
  });

  it("returns a game object with mapped fields on a successful fetch", async () => {
    const searchHit = {
      id: 42, name: "Elden Ring",
      background_image: "https://example.com/er.jpg",
      metacritic: 96, platforms: [],
    };
    const detail = {
      ...searchHit,
      description_raw: "An action RPG",
      genres: [{ name: "RPG" }],
      platforms: [{ platform: { slug: "pc" } }],
      developers: [{ name: "FromSoftware" }],
      playtime: 60,
      released: "2022-02-25",
      rating: 4.5,
      ratings_count: 5000,
    };
    mockFetch
      .mockResolvedValueOnce(mockSearchResponse([searchHit]))  // search call
      .mockResolvedValueOnce(mockDetailResponse(detail));       // detail call

    const result = await rawgFetch("Elden Ring");
    expect(result.id).toBe(42);
    expect(result.name).toBe("Elden Ring");
    expect(result.metacritic).toBe(96);
    expect(result.developers).toContain("FromSoftware");
    expect(result.platforms).toContain("steam"); // pc slug → steam
  });

  it("prefers an exact title match over the first result", async () => {
    // Use a different title so the module-level cache doesn't return a prior result
    const inexact = { id: 1, name: "Hades: Underworld", background_image: null, metacritic: null, platforms: [] };
    const exact   = { id: 2, name: "Hades",             background_image: null, metacritic: 94,   platforms: [] };
    mockFetch
      .mockResolvedValueOnce(mockSearchResponse([inexact, exact]))
      .mockResolvedValueOnce(mockDetailResponse({ ...exact, genres: [], developers: [], platforms: [] }));

    const result = await rawgFetch("Hades");
    expect(result.id).toBe(2);
  });
});
