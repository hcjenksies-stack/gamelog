// ─── GameLog API Client ────────────────────────────────────────────────────────
const BASE = import.meta.env?.VITE_API_URL ?? "http://localhost:3001";

export function getToken()  { return localStorage.getItem("gl_token"); }
export function setTokens(access, refresh) {
  localStorage.setItem("gl_token", access);
  localStorage.setItem("gl_refresh", refresh);
}
export function clearTokens() {
  localStorage.removeItem("gl_token");
  localStorage.removeItem("gl_refresh");
}

async function req(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

export const api = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  register: (data)            => req("POST",   "/auth/register", data),
  login:    (data)            => req("POST",   "/auth/login",    data),
  logout:   ()                => {
    const refreshToken = localStorage.getItem("gl_refresh");
    clearTokens();
    return req("POST", "/auth/logout", { refreshToken }).catch(() => {});
  },
  getDiscordAuthUrl: ()       => req("GET",    "/auth/discord/url"),
  disconnectDiscord: ()       => req("DELETE", "/auth/discord"),
  getSteamAuthUrl:   ()       => req("GET",    "/auth/steam/url"),
  disconnectSteam:   ()       => req("DELETE", "/auth/steam"),
  getSteamGames:     ()       => req("GET",    "/users/me/steam/games"),

  // ── Users ─────────────────────────────────────────────────────────────────
  me:           ()            => req("GET",    "/users/me"),
  updateMe:     (data)        => req("PATCH",  "/users/me",       data),
  getUser:      (id)          => req("GET",    `/users/${id}`),
  getFollowing: (id)          => req("GET",    `/users/${id}/following`),
  getFollowers: (id)          => req("GET",    `/users/${id}/followers`),

  // ── Game log (personal library) ───────────────────────────────────────────
  getMyLibrary: ()            => req("GET",    "/log/me"),
  logGame:      (data)        => req("POST",   "/log",            data),
  updateLog:    (gameId, data)=> req("PATCH",  `/log/${gameId}`,  data),
  removeLog:    (gameId)      => req("DELETE", `/log/${gameId}`),

  // ── Games ─────────────────────────────────────────────────────────────────
  getGames:  (params = {})    => req("GET",    `/games?${new URLSearchParams(params)}`),
  searchGames: (q)            => req("GET",    `/games?q=${encodeURIComponent(q)}&limit=30`),
  getGame:   (id)             => req("GET",    `/games/${id}`),

  // ── Reviews ───────────────────────────────────────────────────────────────
  postReview:   (data)        => req("POST",   "/reviews",        data),
  editReview:   (id, data)    => req("PATCH",  `/reviews/${id}`,  data),
  deleteReview: (id)          => req("DELETE", `/reviews/${id}`),

  // ── Blurbs ────────────────────────────────────────────────────────────────
  postBlurb:    (data)        => req("POST",   "/blurbs",         data),
  deleteBlurb:  (id)          => req("DELETE", `/blurbs/${id}`),

  // ── Follows (user ↔ user) ─────────────────────────────────────────────────
  follow:       (userId)      => req("POST",   `/follows/${userId}`),
  unfollow:     (userId)      => req("DELETE", `/follows/${userId}`),
  prioritize:   (userId, fav) => req("PATCH",  `/follows/${userId}`, { favorited: fav }),

  // ── Studios ───────────────────────────────────────────────────────────────
  getStudios:    ()           => req("GET",    "/studios"),
  getStudio:     (id)         => req("GET",    `/studios/${id}`),
  followStudio:  (id)         => req("POST",   `/studios/${id}/follow`),
  unfollowStudio:(id)         => req("DELETE", `/studios/${id}/follow`),

  // ── Feed ──────────────────────────────────────────────────────────────────
  getFeed: (params = {})      => req("GET",    `/feed?${new URLSearchParams(params)}`),

  // ── Achievements ──────────────────────────────────────────────────────────
  logAchievement:(data)       => req("POST",   "/feed/achievements", data),

  // ── Users (extended) ─────────────────────────────────────────────────────
  getUsers:            (params = {}) => req("GET", `/users?${new URLSearchParams(params)}`),
  getUserGames:        (id)          => req("GET", `/users/${id}/games`),
  getUserReviews:      (id)          => req("GET", `/users/${id}/reviews`),
  getUserAchievements: (id)          => req("GET", `/users/${id}/achievements`),
};

// ── Adapter: API GameLog → component game shape ──────────────────────────────
export function adaptLog(log) {
  const game   = log.game;
  const studio = game?.studios?.[0]?.studio;
  return {
    id:       game?.id,
    logId:    log.id,
    title:          game?.title           || "Unknown",
    genre:          game?.genre           || "",
    cover:          game?.cover           || "🎮",
    backgroundImage:game?.backgroundImage || null,
    year:           game?.year,
    studio:         studio?.name          || game?.developer || "",
    studioId:       studio?.id            || null,
    platform: log.platform,
    progress: log.progress   ?? 0,
    hours:    log.hours      ?? 0,
    coop:     log.coop       ?? false,
    trophies: {
      earned:   log.trophiesEarned ?? 0,
      total:    log.trophiesTotal  ?? 0,
      platinum: log.platinum       ?? false,
    },
    rating: game?.avgRating ?? null,
    reviews: game?.reviewCount ?? 0,
    // Status tracks where the game sits: playing | wishlist | completed | dropped
    status: log.status || "playing",
  };
}
