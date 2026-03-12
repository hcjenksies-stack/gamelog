const router  = require("express").Router();
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");

const prisma = new PrismaClient();

function signAccess(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "15m" });
}
function signRefresh(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: "30d" });
}

// POST /auth/register
router.post("/register", async (req, res, next) => {
  try {
    const { username, email, password, handle, avatar, avatarColor, phone } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "username, email and password are required" });
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
    if (existing) {
      return res.status(409).json({ error: "Email or username already in use" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const derivedHandle = handle || `@${username}`;

    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        handle: derivedHandle,
        avatar:      avatar      || username[0].toUpperCase(),
        avatarColor: avatarColor || "#5865f2",
        phone:       phone       || null,
      },
      select: { id: true, username: true, handle: true, email: true, avatar: true, avatarColor: true },
    });

    const accessToken  = signAccess({ id: user.id, username: user.username });
    const refreshToken = signRefresh({ id: user.id });

    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    res.status(201).json({ user, accessToken, refreshToken });
  } catch (err) { next(err); }
});

// POST /auth/login
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const accessToken  = signAccess({ id: user.id, username: user.username });
    const refreshToken = signRefresh({ id: user.id });

    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    res.json({
      user: { id: user.id, username: user.username, handle: user.handle, avatar: user.avatar, avatarColor: user.avatarColor },
      accessToken,
      refreshToken,
    });
  } catch (err) { next(err); }
});

// POST /auth/refresh
router.post("/refresh", async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: "refreshToken required" });

    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    const user = await prisma.user.findFirst({
      where: { id: payload.id, refreshToken },
    });
    if (!user) return res.status(401).json({ error: "Refresh token revoked" });

    const newAccess  = signAccess({ id: user.id, username: user.username });
    const newRefresh = signRefresh({ id: user.id });

    await prisma.user.update({ where: { id: user.id }, data: { refreshToken: newRefresh } });

    res.json({ accessToken: newAccess, refreshToken: newRefresh });
  } catch (err) { next(err); }
});

// POST /auth/logout
router.post("/logout", async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await prisma.user.updateMany({ where: { refreshToken }, data: { refreshToken: null } });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});


// POST /auth/forgot-password
// Generates a reset token, stores it hashed, and emails a reset link.
// Always returns 200 to prevent email enumeration.
router.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "email required" });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json({ ok: true }); // silent — don't reveal whether email exists

    const crypto = require("crypto");
    const token     = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Invalidate any previous reset tokens for this user
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

    await prisma.passwordResetToken.create({
      data: {
        userId:    user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    const frontend  = process.env.FRONTEND_URL || "https://dist-ten-flame-88.vercel.app";
    const resetLink = `${frontend}?reset=${token}`;

    if (process.env.RESEND_API_KEY) {
      await fetch("https://api.resend.com/emails", {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          from:    process.env.RESEND_FROM || "GameLog <noreply@gamelog.app>",
          to:      [email],
          subject: "Reset your GameLog password",
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
  <h2 style="margin:0 0 8px">Reset your password</h2>
  <p style="color:#6b7499;margin:0 0 24px">Hi ${user.username}, click the button below to set a new password. The link expires in 1 hour.</p>
  <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#5865f2;color:#fff;border-radius:10px;text-decoration:none;font-weight:700">Reset password</a>
  <p style="color:#6b7499;font-size:12px;margin:24px 0 0">If you didn't request this, you can safely ignore this email.</p>
</div>`,
        }),
      });
    } else {
      // Dev fallback — log the link so the developer can test without an email provider
      console.log("[forgot-password] Reset link:", resetLink);
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /auth/reset-password
// Verifies the token and updates the user's password.
router.post("/reset-password", async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: "token and password required" });
    if (password.length < 8)  return res.status(400).json({ error: "Password must be at least 8 characters" });

    const crypto    = require("crypto");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.expiresAt < new Date()) {
      return res.status(400).json({ error: "Reset link is invalid or has expired" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: record.userId },
      data:  { passwordHash, refreshToken: null }, // log out all sessions
    });

    await prisma.passwordResetToken.delete({ where: { tokenHash } });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── Discord OAuth ─────────────────────────────────────────────────────────────

// GET /auth/discord/url — returns the Discord OAuth URL for the logged-in user.
// We embed a short-lived JWT as the OAuth `state` param so the callback can
// identify which GameLog user completed the flow.
router.get("/discord/url", requireAuth, (req, res) => {
  const state = jwt.sign({ id: req.user.id }, process.env.JWT_SECRET, { expiresIn: "10m" });
  const params = new URLSearchParams({
    client_id:     process.env.DISCORD_CLIENT_ID,
    redirect_uri:  process.env.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope:         "identify",   // only need identity — no messages, no guilds
    state,
  });
  res.json({ url: `https://discord.com/oauth2/authorize?${params}` });
});

// GET /auth/discord/callback — Discord redirects here with a short-lived code.
// We exchange the code for an access token, fetch the user's Discord profile,
// then store their Discord ID, username, and avatar URL in our DB.
router.get("/discord/callback", async (req, res, next) => {
  try {
    const { code, state } = req.query;
    const frontend = process.env.FRONTEND_URL || "https://dist-ten-flame-88.vercel.app";

    // Validate the JWT state to confirm this callback belongs to a real session
    let payload;
    try {
      payload = jwt.verify(state, process.env.JWT_SECRET);
    } catch {
      return res.redirect(`${frontend}?discord=error`);
    }

    // Exchange the authorization code for a Discord access token
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type:    "authorization_code",
        code,
        redirect_uri:  process.env.DISCORD_REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect(`${frontend}?discord=error`);

    // Use the access token to fetch the user's Discord profile
    const discordRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const d = await discordRes.json();

    // Store the Discord identity on the user's GameLog account
    await prisma.user.update({
      where: { id: payload.id },
      data: {
        discordId:       d.id,
        discordUsername: d.username,
        // Build the CDN avatar URL if the user has a custom avatar, else null
        discordAvatar:   d.avatar
          ? `https://cdn.discordapp.com/avatars/${d.id}/${d.avatar}.png`
          : null,
      },
    });

    // Redirect back to the frontend with a success flag the app can read
    res.redirect(`${frontend}?discord=connected`);
  } catch (err) { next(err); }
});

// DELETE /auth/discord — clears all Discord fields from the user's account
router.delete("/discord", requireAuth, async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { discordId: null, discordUsername: null, discordAvatar: null },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── Steam OpenID ──────────────────────────────────────────────────────────────
// Steam uses OpenID 2.0 (not OAuth). The flow is:
//   1. We build a Steam login URL and send it to the frontend
//   2. User logs in on Steam's site
//   3. Steam redirects to our callback with the user's SteamID in the URL
//   4. We POST back to Steam to verify the assertion isn't forged
//   5. We store the SteamID and fetch the user's Steam profile via the Web API

const STEAM_OPENID = "https://steamcommunity.com/openid/login";

// GET /auth/steam/url — builds and returns the Steam OpenID login URL.
// A JWT state param is appended to the callback URI so we know who to update.
router.get("/steam/url", requireAuth, (req, res) => {
  const state       = jwt.sign({ id: req.user.id }, process.env.JWT_SECRET, { expiresIn: "10m" });
  const callbackUri = `${process.env.STEAM_CALLBACK_URI}?state=${encodeURIComponent(state)}`;
  const realm       = process.env.BACKEND_URL || "https://localbinrailway-up-detach-production-dad5.up.railway.app";

  const params = new URLSearchParams({
    "openid.ns":         "http://specs.openid.net/auth/2.0",
    "openid.mode":       "checkid_setup",
    "openid.return_to":  callbackUri,   // Steam will redirect here after login
    "openid.realm":      realm,         // must match the backend's root URL
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.identity":   "http://specs.openid.net/auth/2.0/identifier_select",
  });
  res.json({ url: `${STEAM_OPENID}?${params}` });
});

// GET /auth/steam/callback — Steam redirects here after the user logs in.
router.get("/steam/callback", async (req, res, next) => {
  const frontend = process.env.FRONTEND_URL || "https://dist-ten-flame-88.vercel.app";
  try {
    // Steam passes back all the openid.* params plus our custom state JWT
    const { state, ...openidParams } = req.query;

    // Confirm the state JWT is valid — proves this callback is for a real session
    let payload;
    try { payload = jwt.verify(state, process.env.JWT_SECRET); }
    catch { return res.redirect(`${frontend}?steam=error`); }

    // Verify the OpenID assertion with Steam to prevent forgery.
    // We replay all the params back to Steam with mode=check_authentication
    // and expect "is_valid:true" in the response body.
    const verifyParams = new URLSearchParams({ ...openidParams, "openid.mode": "check_authentication" });
    const verifyRes    = await fetch(STEAM_OPENID, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    verifyParams.toString(),
    });
    const verifyText = await verifyRes.text();
    if (!verifyText.includes("is_valid:true")) {
      return res.redirect(`${frontend}?steam=error`);
    }

    // The SteamID is the last path segment of the claimed_id URL
    // e.g. "https://steamcommunity.com/openid/id/76561198XXXXXXXXX"
    const claimedId = openidParams["openid.claimed_id"] || "";
    const steamId   = claimedId.replace("https://steamcommunity.com/openid/id/", "");
    if (!steamId || !/^\d+$/.test(steamId)) {
      return res.redirect(`${frontend}?steam=error`);
    }

    // Optionally fetch the user's Steam display name and avatar via the Web API
    let steamUsername = null, steamAvatar = null;
    if (process.env.STEAM_API_KEY) {
      const profileRes  = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${process.env.STEAM_API_KEY}&steamids=${steamId}`
      );
      const profileData = await profileRes.json();
      const player      = profileData?.response?.players?.[0];
      if (player) {
        steamUsername = player.personaname;   // Steam display name
        steamAvatar   = player.avatarmedium;  // 64x64 avatar URL
      }
    }

    // Persist the Steam identity on the user's GameLog account
    await prisma.user.update({
      where: { id: payload.id },
      data:  { steamId, steamUsername, steamAvatar },
    });

    res.redirect(`${frontend}?steam=connected`);
  } catch (err) { next(err); }
});

// DELETE /auth/steam — unlinks Steam from the user's account
router.delete("/steam", requireAuth, async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data:  { steamId: null, steamUsername: null, steamAvatar: null },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
