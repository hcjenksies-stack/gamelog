// ─── Unit Tests: Auth Middleware ──────────────────────────────────────────────
// Tests requireAuth and optionalAuth middleware in isolation.
// These functions gate all protected routes and must reject bad tokens
// and silently skip invalid tokens respectively.

const jwt = require("jsonwebtoken");
const { requireAuth, optionalAuth } = require("../../src/middleware/auth");

// Helper — signs a token with the test secret set in setup.js
function makeToken(payload = { id: 1, username: "testuser" }) {
  return jwt.sign(payload, process.env.JWT_SECRET);
}

describe("requireAuth", () => {
  let req, res, next;

  beforeEach(() => {
    req  = { headers: {} };
    res  = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
  });

  it("calls next() and attaches user when token is valid", () => {
    req.headers.authorization = `Bearer ${makeToken({ id: 1, username: "testuser" })}`;
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.id).toBe(1);
    expect(req.user.username).toBe("testuser");
  });

  it("returns 401 when Authorization header is missing", () => {
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: expect.any(String) });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when token is invalid or expired", () => {
    req.headers.authorization = "Bearer not.a.real.token";
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when header scheme is not Bearer", () => {
    req.headers.authorization = `Token ${makeToken()}`;
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("optionalAuth", () => {
  let req, res, next;

  beforeEach(() => {
    req  = { headers: {} };
    res  = {};
    next = jest.fn();
  });

  it("attaches user and calls next() when a valid token is provided", () => {
    req.headers.authorization = `Bearer ${makeToken({ id: 2, username: "optuser" })}`;
    optionalAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe(2);
  });

  it("calls next() without attaching user when no token is provided", () => {
    optionalAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it("calls next() without attaching user when token is invalid", () => {
    req.headers.authorization = "Bearer bad.token.here";
    optionalAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });
});
