import { useState, useEffect, useRef, useContext, createContext } from "react";
import { api, adaptLog, setTokens, clearTokens } from "./api.js";
import { rawgFetch } from "./rawg.js";

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function relTime(t) {
  if (!t) return "";
  const s = (Date.now() - new Date(t)) / 1000;
  if (s < 60)    return `${Math.floor(s)}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Normalise API feed item shapes to match the mock shape FeedView renders
function adaptFeedItem(item) {
  // Normalise user: add .name and .color aliases
  if (item.user && !item.user.name) {
    item = { ...item, user: { ...item.user, name: item.user.username, color: item.user.avatarColor } };
  }
  // influencer_post from API puts the author in item.user, mock uses item.influencer
  if (item.type === "influencer_post" && !item.influencer && item.user) {
    item = { ...item, influencer: { ...item.user, name: item.user.username } };
  }
  // influencer_live: ensure .name alias
  if (item.influencer && !item.influencer.name) {
    item = { ...item, influencer: { ...item.influencer, name: item.influencer.username } };
  }
  // friend_progress: progress/hours/platform live at top level in API, mock has them in .game
  if (item.type === "friend_progress" && item.progress !== undefined && item.game) {
    item = { ...item, game: { ...item.game, progress: item.progress, hours: item.hours, platform: item.platform } };
  }
  // friend_review: API uses .text, mock uses .review
  if (item.type === "friend_review" && item.text && !item.review) {
    item = { ...item, review: item.text };
  }
  // studio_event: API news items have no .image, fallback to studio avatar
  if (item.type === "studio_event" && item.event && !item.event.image) {
    item = { ...item, event: { ...item.event, image: item.studio?.avatar || "🏢" } };
  }
  // Convert ISO timestamps to relative strings
  if (item.time && typeof item.time === "string" && item.time.includes("T")) {
    item = { ...item, time: relTime(item.time) };
  }
  return item;
}

// ─── TOKENS ───────────────────────────────────────────────────────────────────
const C = {
  bg:"#0f1117", surface:"#171b26", surface2:"#1e2333", surface3:"#252a3d",
  border:"#272d42", border2:"#313856",
  text:"#f0f2f8", textSub:"#b0b8d4", textMuted:"#6b7499",
  accent:"#5865f2", accentLight:"#7983f5", accentSoft:"#5865f218",
  green:"#3ba55d", greenLight:"#57d97d",
  gold:"#f0b429", red:"#ed4245", orange:"#ff9a3c",
  discord:"#5865f2", discordSoft:"#5865f215",
  twitch:"#9146ff", youtube:"#ff0000", twitter:"#1d9bf0",
  tomatoFresh:"#f84f31", tomatoRotten:"#6c8a1e", tomatoAudience:"#ff7c00",
};
const F = { body:"'Plus Jakarta Sans',sans-serif", display:"'Fraunces',serif", mono:"'DM Mono',monospace" };

// ─── AUTH CONTEXT ─────────────────────────────────────────────────────────────
const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("gl_token");
    if (token) {
      api.me().then(setUser).catch(() => clearTokens()).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const data = await api.login({ email, password });
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    return data.user;
  };

  const register = async (username, email, password, phone) => {
    const data = await api.register({
      username, email, password,
      handle:      `@${username}`,
      avatar:      username[0].toUpperCase(),
      avatarColor: "#5865f2",
      ...(phone ? { phone } : {}),
    });
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    return data.user;
  };

  const logout = () => { api.logout(); setUser(null); };

  const refreshUser = async () => { const u = await api.me(); setUser(u); return u; };

  return (
    <AuthCtx.Provider value={{ user, setUser, login, register, logout, refreshUser, loading }}>
      {children}
    </AuthCtx.Provider>
  );
}

// ─── AUTH GATE (login / register screen) ─────────────────────────────────────
function AuthGate({ onAuth }) {
  const [mode, setMode]   = useState("login");
  const [form, setForm]   = useState({ username:"", email:"", password:"", phone:"" });
  const [error, setError] = useState(null);
  const [busy,  setBusy]  = useState(false);
  const { login, register } = useAuth();

  const f = k => e => setForm(p => ({...p, [k]: e.target.value}));

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      if (mode === "login") await login(form.email, form.password);
      else                  await register(form.username, form.email, form.password, form.phone || null);
      onAuth(mode === "register");
    } catch (e) { setError(e.message); }
    finally     { setBusy(false); }
  };

  const inputStyle = { width:"100%", background:C.surface2, border:`1px solid ${C.border2}`, borderRadius:10, padding:"10px 12px", color:C.text, fontFamily:F.body, fontSize:14, outline:"none", boxSizing:"border-box" };
  const label      = (txt, optional) => (
    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
      <span style={{ fontFamily:F.body, fontWeight:600, fontSize:12, color:C.textMuted }}>{txt}</span>
      {optional && <span style={{ fontFamily:F.body, fontSize:11, color:C.textMuted, opacity:0.6 }}>Optional</span>}
    </div>
  );

  return (
    <div style={{ maxWidth:430, margin:"0 auto", minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ fontFamily:F.body, fontWeight:800, fontSize:28, color:C.text, marginBottom:6 }}>
        <span style={{ color:C.accentLight }}>Game</span>Log
      </div>
      <div style={{ fontFamily:F.body, fontSize:13, color:C.textMuted, marginBottom:32 }}>Your social gaming journal</div>

      <div style={{ width:"100%", background:C.surface, borderRadius:20, border:`1px solid ${C.border}`, padding:24 }}>
        <div style={{ display:"flex", gap:6, marginBottom:20 }}>
          {["login","register"].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(null); }} style={{ flex:1, padding:"9px", borderRadius:10, background:mode===m?C.accentSoft:C.surface2, border:`1px solid ${mode===m?C.accentLight:C.border}`, color:mode===m?C.accentLight:C.textMuted, fontFamily:F.body, fontWeight:700, fontSize:13, cursor:"pointer" }}>
              {m === "login" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        {mode === "register" && (<>
          <div style={{ marginBottom:14 }}>
            {label("Username")}
            <input value={form.username} onChange={f("username")} placeholder="neonpixel" style={inputStyle} />
          </div>
          <div style={{ marginBottom:14 }}>
            {label("Phone number", true)}
            <input type="tel" value={form.phone} onChange={f("phone")} placeholder="+1 (555) 000-0000" style={inputStyle} />
            <div style={{ fontFamily:F.body, fontSize:11, color:C.textMuted, marginTop:5, lineHeight:1.5 }}>Used only to help friends find you. Never shared publicly.</div>
          </div>
        </>)}
        <div style={{ marginBottom:14 }}>
          {label("Email")}
          <input type="email" value={form.email} onChange={f("email")} placeholder="you@example.com" style={inputStyle} />
        </div>
        <div style={{ marginBottom:20 }}>
          {label("Password")}
          <input type="password" value={form.password} onChange={f("password")} placeholder="••••••••" onKeyDown={e => e.key==="Enter" && submit()} style={inputStyle} />
        </div>

        {error && (
          <div style={{ background:`${C.red}18`, border:`1px solid ${C.red}44`, borderRadius:10, padding:"10px 14px", marginBottom:14, fontFamily:F.body, fontSize:13, color:C.red }}>{error}</div>
        )}

        <button onClick={submit} disabled={busy} style={{ width:"100%", padding:13, borderRadius:12, background:C.accent, border:"none", color:"#fff", fontFamily:F.body, fontWeight:800, fontSize:14, cursor:"pointer", opacity:busy?0.6:1 }}>
          {busy ? "…" : mode === "login" ? "Sign In" : "Create Account"}
        </button>
      </div>
    </div>
  );
}

// ─── ONBOARDING FLOW ──────────────────────────────────────────────────────────
function OnboardingFlow({ onComplete }) {
  const [step, setStep] = useState(0);
  const { user, refreshUser } = useAuth();

  const STEPS = ["Photo", "Gamertags", "Discord", "Friends"];
  const totalSteps = STEPS.length;

  const next = async () => {
    if (step === totalSteps - 1) {
      await api.updateMe({ onboarded: true }).catch(() => {});
      await refreshUser();
      onComplete();
    } else {
      setStep(s => s + 1);
    }
  };

  const skip = async () => { await next(); };

  return (
    <div style={{ maxWidth:430, margin:"0 auto", minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", padding:24, paddingTop:48 }}>
      {/* Progress dots */}
      <div style={{ display:"flex", gap:6, justifyContent:"center", marginBottom:36 }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{ width: i === step ? 20 : 6, height:6, borderRadius:99, background: i <= step ? C.accent : C.border2, transition:"all 0.25s" }} />
        ))}
      </div>

      <div style={{ flex:1 }}>
        {step === 0 && <OnboardPhotoStep onNext={next} onSkip={skip} user={user} />}
        {step === 1 && <OnboardGamertags onNext={next} onSkip={skip} user={user} />}
        {step === 2 && <OnboardDiscord   onNext={next} onSkip={skip} user={user} />}
        {step === 3 && <OnboardFriends   onNext={next} onSkip={skip} user={user} />}
      </div>
    </div>
  );
}

function OnboardPhotoStep({ onNext, onSkip, user }) {
  const [preview, setPreview] = useState(user?.avatarUrl || null);
  const [saving,  setSaving]  = useState(false);
  const fileRef = useRef(null);

  const onFile = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      // Compress via canvas to ~200x200
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 200;
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2, sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        setPreview(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!preview) { onNext(); return; }
    setSaving(true);
    try { await api.updateMe({ avatarUrl: preview }); } catch(_) {}
    setSaving(false);
    onNext();
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
      <div style={{ fontFamily:F.body, fontWeight:800, fontSize:24, color:C.text, marginBottom:8, textAlign:"center" }}>Add a profile photo</div>
      <div style={{ fontFamily:F.body, fontSize:14, color:C.textMuted, marginBottom:32, textAlign:"center", lineHeight:1.6 }}>Put a face to your username. You can always change it later.</div>

      <div onClick={() => fileRef.current?.click()} style={{ width:120, height:120, borderRadius:"50%", background: preview ? "transparent" : C.surface2, border:`2px dashed ${preview ? "transparent" : C.border2}`, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", marginBottom:20, overflow:"hidden", position:"relative" }}>
        {preview
          ? <img src={preview} alt="preview" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
          : <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:32 }}>📷</span>
              <span style={{ fontFamily:F.body, fontSize:12, color:C.textMuted }}>Tap to upload</span>
            </div>
        }
        {preview && (
          <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", opacity:0, transition:"opacity 0.2s" }}
            onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0}>
            <span style={{ fontSize:20 }}>✏️</span>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display:"none" }} />

      {preview && (
        <button onClick={() => setPreview(null)} style={{ background:"none", border:"none", color:C.textMuted, fontFamily:F.body, fontSize:13, cursor:"pointer", marginBottom:20 }}>Remove photo</button>
      )}

      <button onClick={save} disabled={saving} style={{ width:"100%", padding:14, borderRadius:14, background:C.accent, border:"none", color:"#fff", fontFamily:F.body, fontWeight:800, fontSize:15, cursor:"pointer", marginBottom:12, opacity:saving?0.6:1 }}>
        {saving ? "Saving…" : preview ? "Save & Continue" : "Continue"}
      </button>
      <button onClick={onSkip} style={{ background:"none", border:"none", color:C.textMuted, fontFamily:F.body, fontSize:13, cursor:"pointer", padding:"8px 0" }}>Skip for now</button>
    </div>
  );
}

function OnboardGamertags({ onNext, onSkip }) {
  const [psn,  setPsn]  = useState("");
  const [xbox, setXbox] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateMe({
        ...(psn.trim()  ? { psnHandle:    psn.trim()  } : {}),
        ...(xbox.trim() ? { xboxGamertag: xbox.trim() } : {}),
      });
    } catch(_) {}
    setSaving(false);
    onNext();
  };

  const inputStyle = { width:"100%", background:C.surface2, border:`1px solid ${C.border2}`, borderRadius:10, padding:"12px 14px", color:C.text, fontFamily:F.body, fontSize:14, outline:"none", boxSizing:"border-box" };

  return (
    <div>
      <div style={{ fontFamily:F.body, fontWeight:800, fontSize:24, color:C.text, marginBottom:8 }}>Connect your consoles</div>
      <div style={{ fontFamily:F.body, fontSize:14, color:C.textMuted, marginBottom:32, lineHeight:1.6 }}>Add your gamertags so friends can find and play with you.</div>

      <div style={{ marginBottom:18 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
          <span style={{ fontSize:20 }}>🎮</span>
          <span style={{ fontFamily:F.body, fontWeight:700, fontSize:14, color:C.text }}>PlayStation Network</span>
        </div>
        <input value={psn} onChange={e=>setPsn(e.target.value)} placeholder="Your PSN ID" style={inputStyle} />
      </div>

      <div style={{ marginBottom:36 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
          <span style={{ fontSize:20 }}>🟢</span>
          <span style={{ fontFamily:F.body, fontWeight:700, fontSize:14, color:C.text }}>Xbox Gamertag</span>
        </div>
        <input value={xbox} onChange={e=>setXbox(e.target.value)} placeholder="Your Xbox Gamertag" style={inputStyle} />
      </div>

      <button onClick={save} disabled={saving} style={{ width:"100%", padding:14, borderRadius:14, background:(psn||xbox)?C.accent:C.surface2, border:(psn||xbox)?"none":`1px solid ${C.border2}`, color:(psn||xbox)?"#fff":C.textMuted, fontFamily:F.body, fontWeight:800, fontSize:15, cursor:"pointer", marginBottom:12, opacity:saving?0.6:1 }}>
        {saving ? "Saving…" : (psn || xbox) ? "Save & Continue" : "Continue"}
      </button>
      <button onClick={onSkip} style={{ background:"none", border:"none", color:C.textMuted, fontFamily:F.body, fontSize:13, cursor:"pointer", padding:"8px 0", width:"100%" }}>Skip for now</button>
    </div>
  );
}

function OnboardDiscord({ onNext, onSkip, user }) {
  const [loading, setLoading] = useState(false);
  const connected = !!user?.discordId;

  const connectDiscord = async () => {
    setLoading(true);
    try {
      const { url } = await api.getDiscordAuthUrl();
      window.location.href = url;
    } catch(_) { setLoading(false); }
  };

  return (
    <div>
      <div style={{ fontFamily:F.body, fontWeight:800, fontSize:24, color:C.text, marginBottom:8 }}>Connect Discord</div>
      <div style={{ fontFamily:F.body, fontSize:14, color:C.textMuted, marginBottom:32, lineHeight:1.6 }}>Link your Discord account to show your online status to friends and get notified about co-op sessions.</div>

      <div style={{ background:C.discordSoft, border:`1px solid ${C.discord}44`, borderRadius:18, padding:24, marginBottom:24, display:"flex", flexDirection:"column", alignItems:"center", gap:14 }}>
        <span style={{ fontSize:48 }}>🎧</span>
        {connected ? (
          <>
            <div style={{ fontFamily:F.body, fontWeight:700, fontSize:16, color:C.greenLight }}>✓ Connected as {user.discordUsername}</div>
            <div style={{ fontFamily:F.body, fontSize:13, color:C.textMuted }}>Your Discord is linked.</div>
          </>
        ) : (
          <>
            <div style={{ fontFamily:F.body, fontWeight:700, fontSize:16, color:C.text }}>Not connected yet</div>
            <div style={{ fontFamily:F.body, fontSize:13, color:C.textMuted, textAlign:"center", lineHeight:1.5 }}>We'll only read your username and avatar. We never post to your Discord.</div>
          </>
        )}
      </div>

      {!connected && (
        <button onClick={connectDiscord} disabled={loading} style={{ width:"100%", padding:14, borderRadius:14, background:C.discord, border:"none", color:"#fff", fontFamily:F.body, fontWeight:800, fontSize:15, cursor:"pointer", marginBottom:12, opacity:loading?0.6:1 }}>
          {loading ? "Opening Discord…" : "🎧 Connect Discord"}
        </button>
      )}
      <button onClick={onNext} style={{ width:"100%", padding:14, borderRadius:14, background:connected?C.accent:C.surface2, border:connected?"none":`1px solid ${C.border2}`, color:connected?"#fff":C.textMuted, fontFamily:F.body, fontWeight:800, fontSize:15, cursor:"pointer", marginBottom:12 }}>
        {connected ? "Continue →" : "Continue without Discord"}
      </button>
      {!connected && <button onClick={onSkip} style={{ background:"none", border:"none", color:C.textMuted, fontFamily:F.body, fontSize:13, cursor:"pointer", padding:"8px 0", width:"100%" }}>Skip for now</button>}
    </div>
  );
}

function OnboardFriends({ onNext, onSkip, user }) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState([]);
  const [followed, setFollowed] = useState({});
  const [searching, setSearching] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const users = await api.getUsers({ q: query.trim() });
      setResults(users.filter(u => u.id !== user?.id));
    } catch(_) {}
    setSearching(false);
  };

  const toggleFollow = async (u) => {
    try {
      if (followed[u.id]) { await api.unfollow(u.id); setFollowed(p => ({...p, [u.id]: false})); }
      else                { await api.follow(u.id);   setFollowed(p => ({...p, [u.id]: true}));  }
    } catch(_) {}
  };

  return (
    <div>
      <div style={{ fontFamily:F.body, fontWeight:800, fontSize:24, color:C.text, marginBottom:8 }}>Find your friends</div>
      <div style={{ fontFamily:F.body, fontSize:14, color:C.textMuted, marginBottom:24, lineHeight:1.6 }}>Search for friends by username to follow them and see their gaming activity.</div>

      <div style={{ display:"flex", gap:8, marginBottom:16 }}>
        <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()} placeholder="Search by username…" style={{ flex:1, background:C.surface2, border:`1px solid ${C.border2}`, borderRadius:10, padding:"12px 14px", color:C.text, fontFamily:F.body, fontSize:14, outline:"none" }} />
        <button onClick={search} disabled={searching} style={{ padding:"12px 16px", borderRadius:10, background:C.accent, border:"none", color:"#fff", fontFamily:F.body, fontWeight:700, fontSize:13, cursor:"pointer" }}>
          {searching ? "…" : "Search"}
        </button>
      </div>

      {results.length > 0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:24 }}>
          {results.map(u => (
            <div key={u.id} style={{ display:"flex", gap:12, alignItems:"center", background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"12px 14px" }}>
              <div style={{ width:40, height:40, borderRadius:"50%", background: u.avatarUrl ? "transparent" : u.avatarColor, overflow:"hidden", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:F.body, fontWeight:800, fontSize:16, color:"#fff" }}>
                {u.avatarUrl ? <img src={u.avatarUrl} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : u.avatar}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:F.body, fontWeight:700, fontSize:14, color:C.text }}>{u.username}</div>
                <div style={{ fontFamily:F.body, fontSize:12, color:C.textMuted }}>{u.handle}</div>
              </div>
              <button onClick={()=>toggleFollow(u)} style={{ padding:"7px 14px", borderRadius:99, background:followed[u.id]?C.accentSoft:"transparent", border:`1px solid ${followed[u.id]?C.accentLight:C.border2}`, color:followed[u.id]?C.accentLight:C.textMuted, fontFamily:F.body, fontWeight:700, fontSize:12, cursor:"pointer" }}>
                {followed[u.id] ? "Following" : "Follow"}
              </button>
            </div>
          ))}
        </div>
      )}

      <button onClick={onNext} style={{ width:"100%", padding:14, borderRadius:14, background:C.accent, border:"none", color:"#fff", fontFamily:F.body, fontWeight:800, fontSize:15, cursor:"pointer", marginBottom:12 }}>
        {Object.values(followed).some(Boolean) ? "Done →" : "Continue"}
      </button>
      <button onClick={onSkip} style={{ background:"none", border:"none", color:C.textMuted, fontFamily:F.body, fontSize:13, cursor:"pointer", padding:"8px 0", width:"100%" }}>Skip for now</button>
    </div>
  );
}

// ─── DATA ─────────────────────────────────────────────────────────────────────
const BADGES = {
  platinum_hunter:{ icon:"🏆", label:"Platinum Hunter",  color:"#c8a43a", desc:"Earned 2+ platinum trophies" },
  early_adopter:  { icon:"⚡", label:"Early Adopter",    color:"#5865f2", desc:"Joined in the first month"  },
  soulsborne_vet: { icon:"⚔️", label:"Soulsborne Vet",   color:"#9b3030", desc:"100+ hrs across Soulsborne" },
  completionist:  { icon:"✅", label:"Completionist",    color:"#3ba55d", desc:"Completed 5+ games at 100%" },
  indie_lover:    { icon:"💜", label:"Indie Lover",      color:"#a855f7", desc:"Logged 10+ indie titles"    },
  coop_king:      { icon:"🤝", label:"Co-op King",       color:"#0ea5e9", desc:"Played 20+ co-op sessions"  },
  speedrunner:    { icon:"⚡", label:"Speedrunner",      color:"#f59e0b", desc:"Sub-1-hour any% clear"      },
  verified_creator:{ icon:"✦", label:"Verified Creator", color:"#f0b429", desc:"Verified gaming influencer" },
};


const COUNTRIES = ["🇺🇸 United States","🇬🇧 United Kingdom","🇨🇦 Canada","🇩🇪 Germany","🇫🇷 France","🇯🇵 Japan","🇦🇺 Australia","🇧🇷 Brazil","🇰🇷 South Korea","🇪🇸 Spain","🇮🇹 Italy","🇸🇪 Sweden","🇳🇱 Netherlands","🇲🇽 Mexico","🇵🇱 Poland","🇷🇺 Russia","🇮🇳 India","🇵🇹 Portugal","🇦🇷 Argentina","🇳🇴 Norway"];

// ─── RAWG HOOK ────────────────────────────────────────────────────────────────
function useRawgGame(title) {
  const [rawg, setRawg] = useState(null);
  useEffect(() => {
    if (!title) return;
    let cancelled = false;
    rawgFetch(title).then(data => { if (!cancelled) setRawg(data); });
    return () => { cancelled = true; };
  }, [title]);
  return rawg;
}

// ─── GAME COVER IMAGES ────────────────────────────────────────────────────────
// Fills its parent container. Parent must have overflow:hidden + explicit size.
// Pass imgUrl to use a DB/RAWG cover directly and skip the RAWG fetch.
// Falls back to a styled emoji card when no image is available.
const GameCover = ({ title, emoji, emojiSize = 28, imgUrl }) => {
  // Only fetch from RAWG if we don't already have an image URL from the DB
  const rawg = useRawgGame(imgUrl ? null : title);
  const url  = imgUrl || rawg?.background_image || null;
  const [failed, setFailed] = useState(false);

  useEffect(() => { if (url) setFailed(false); }, [url]);

  if (!url || failed) {
    return (
      <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center", background:`linear-gradient(160deg,${C.surface3},${C.surface2})` }}>
        <span style={{ fontSize: emojiSize }}>{emoji}</span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={title}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}
    />
  );
};

// ─── SHARED ATOMS ─────────────────────────────────────────────────────────────
const Avatar = ({ char, color=C.accent, size=36, fontSize=14, img }) => (
  <div style={{ width:size, height:size, borderRadius:"50%", flexShrink:0, background:img?"transparent":`linear-gradient(145deg,${color}dd,${color}77)`, border:`1.5px solid ${color}44`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:F.body, fontWeight:800, fontSize, color:"#fff", overflow:"hidden" }}>
    {img ? <img src={img} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : char}
  </div>
);

const StatusDot = ({ status }) => {
  const col = { online:C.greenLight, idle:C.gold, dnd:C.red, offline:C.textMuted }[status]||C.textMuted;
  return <div style={{ width:10, height:10, borderRadius:"50%", background:col, border:`2px solid ${C.surface}`, flexShrink:0 }} />;
};

const PlatformBadge = ({ id, small }) => {
  const m={ps5:"PS5",xbox:"Xbox",steam:"Steam",switch:"Switch",pc:"PC"};
  const co={ps5:"#0070d1",xbox:"#107c10",steam:"#66c0f4",switch:"#e60012",pc:"#9b87f5"};
  return <span style={{ padding:small?"1px 6px":"2px 8px", borderRadius:5, background:`${co[id]||"#555"}22`, color:co[id]||C.textMuted, fontSize:small?10:11, fontFamily:F.body, fontWeight:700, border:`1px solid ${co[id]||"#555"}44` }}>{m[id]||id}</span>;
};

const ProgressBar = ({ pct, color=C.accent, h=5 }) => (
  <div style={{ height:h, borderRadius:99, background:C.surface3, overflow:"hidden" }}>
    <div style={{ width:`${pct}%`, height:"100%", borderRadius:99, background:color, opacity:.9 }} />
  </div>
);

const Tag = ({ children, color=C.accent }) => (
  <span style={{ padding:"3px 9px", borderRadius:99, background:`${color}15`, color, fontSize:11, fontFamily:F.body, fontWeight:600, border:`1px solid ${color}30` }}>{children}</span>
);

const StarRow = ({ rating }) => (
  <div style={{ display:"flex", alignItems:"center", gap:3 }}>
    {[...Array(5)].map((_,i)=><span key={i} style={{ fontSize:12, color:i<Math.round(rating/2)?C.gold:C.border2 }}>★</span>)}
    <span style={{ fontFamily:F.mono, fontSize:11, color:C.textMuted, marginLeft:3 }}>{rating}</span>
  </div>
);

const Pill = ({ children, active, onClick }) => (
  <button onClick={onClick} style={{ padding:"7px 15px", borderRadius:99, border:"1px solid", borderColor:active?C.accentLight:C.border2, background:active?C.accentSoft:"transparent", color:active?C.accentLight:C.textMuted, fontFamily:F.body, fontWeight:600, fontSize:13, cursor:"pointer", whiteSpace:"nowrap" }}>{children}</button>
);

const SectionLabel = ({ children }) => (
  <div style={{ fontFamily:F.body, fontWeight:700, fontSize:11, letterSpacing:"0.08em", textTransform:"uppercase", color:C.textMuted, marginBottom:10 }}>{children}</div>
);

const RTScore = ({ score, type="critic", size=52 }) => {
  const fresh=score>=60;
  const color=type==="critic"?(fresh?C.tomatoFresh:C.tomatoRotten):C.tomatoAudience;
  const icon=type==="critic"?(fresh?"🍅":"🫙"):(score>=60?"🍿":"😴");
  const r=(size/2)-4; const circ=2*Math.PI*r; const dash=(score/100)*circ;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
      <div style={{ position:"relative", width:size, height:size }}>
        <svg width={size} height={size} style={{ position:"absolute", top:0, left:0, transform:"rotate(-90deg)" }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.surface3} strokeWidth={3.5} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={3.5} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
        </svg>
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <span style={{ fontFamily:F.body, fontWeight:800, fontSize:size>48?14:12, color }}>{score}%</span>
        </div>
      </div>
      <div style={{ display:"flex", gap:3, alignItems:"center" }}>
        <span style={{ fontSize:11 }}>{icon}</span>
        <span style={{ fontFamily:F.body, fontSize:10, fontWeight:600, color:C.textMuted }}>{type==="critic"?"Critics":"Audience"}</span>
      </div>
    </div>
  );
};

const Countdown = ({ releaseDate }) => {
  const [diff, setDiff] = useState(null);
  useEffect(()=>{
    const calc=()=>{ const ms=new Date(releaseDate)-new Date(); if(ms<=0){setDiff({days:0,hours:0,minutes:0,seconds:0});return;} setDiff({days:Math.floor(ms/86400000),hours:Math.floor((ms%86400000)/3600000),minutes:Math.floor((ms%3600000)/60000),seconds:Math.floor((ms%60000)/1000)}); };
    calc(); const t=setInterval(calc,1000); return()=>clearInterval(t);
  },[releaseDate]);
  if(!diff)return null;
  return (
    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
      {[{l:"days",v:diff.days},{l:"hrs",v:diff.hours},{l:"min",v:diff.minutes},{l:"sec",v:diff.seconds}].map(u=>(
        <div key={u.l} style={{ textAlign:"center", background:C.surface3, borderRadius:8, padding:"5px 9px", minWidth:44 }}>
          <div style={{ fontFamily:F.mono, fontSize:15, color:C.accentLight, lineHeight:1 }}>{String(u.v).padStart(2,"0")}</div>
          <div style={{ fontFamily:F.body, fontSize:9, color:C.textMuted, marginTop:2, textTransform:"uppercase", letterSpacing:"0.06em" }}>{u.l}</div>
        </div>
      ))}
    </div>
  );
};

// Stream platform button
const StreamBtn = ({ stream }) => {
  const icons = { twitch:"🟣", youtube:"🔴", twitter:"🔵" };
  return (
    <a href={stream.url} target="_blank" rel="noreferrer" style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:10, background:`${stream.color}22`, border:`1px solid ${stream.color}44`, color:stream.color, fontFamily:F.body, fontWeight:700, fontSize:13, textDecoration:"none", flexShrink:0 }}>
      <span style={{ fontSize:14 }}>{icons[stream.platform]}</span>
      {stream.label}
      {stream.live && <span style={{ fontSize:10, background:C.red, color:"#fff", borderRadius:4, padding:"1px 5px", fontFamily:F.body, fontWeight:800 }}>LIVE {stream.viewers && `· ${stream.viewers}`}</span>}
    </a>
  );
};

// ─── INFLUENCER PROFILE SHEET ──────────────────────────────────────────────────
const InfluencerProfileSheet = ({ influencerId, onClose }) => {
  const [p,        setP]       = useState(null);
  const [games,    setGames]   = useState([]);
  const [activity, setActivity]= useState([]);
  const [tab,      setTab]     = useState("games");
  const [following,setFollowing]= useState(true);
  const { user } = useAuth();

  useEffect(() => {
    let uid = null;
    api.getUser(influencerId)
      .then(u => {
        uid = u.id;
        setP(prev => ({
          ...(prev || {}),
          id: u.username, name: u.username, handle: u.handle,
          avatar: u.avatar || "?", avatarColor: u.avatarColor || C.accent,
          verified: u.isVerified, isInfluencer: true,
          bio: u.bio || prev?.bio || "", country: u.country || "", age: u.age || "",
          followers: u._count?.followers != null
            ? (u._count.followers >= 1000000 ? `${(u._count.followers/1000000).toFixed(1)}M`
               : u._count.followers >= 1000   ? `${(u._count.followers/1000).toFixed(1)}K`
               : String(u._count.followers))
            : (prev?.followers || "0"),
          following: u._count?.following || 0,
          streams: u.streams || prev?.streams || [],
          currentGame: u.currentGame, currentPlatform: u.currentPlatform,
          liveNow: u.liveNow, realName: prev?.realName || "",
          badges: (u.badges || []).map(b => b.badgeId || b.badge?.id || b),
        }));
        return api.getUserGames(uid);
      })
      .then(logs => {
        if (logs?.length) setGames(logs.slice(0, 5).map(l => ({
          title: l.game?.title || "?", cover: l.game?.cover || "🎮",
          hours: l.hours || 0, rating: null, genre: l.game?.genre || "",
        })));
        if (uid) return api.getUserReviews(uid);
      })
      .then(reviews => {
        if (reviews?.length) setActivity(reviews.slice(0, 5).map(r => ({
          type: "review", time: relTime(r.createdAt),
          game: r.game?.title || "", cover: r.game?.cover || "🎮",
          text: r.body || "",
        })));
      })
      .catch(() => {});
  }, [influencerId]);

  if (!p) return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <span style={{ color:C.textMuted, fontFamily:F.body }}>Loading…</span>
    </div>
  );

  const toggleFollow = async () => {
    if (!user) return;
    // Influencers exist as users in the DB; p.id maps to username
    // Optimistically toggle — API call by handle
    try {
      if (following) await api.unfollow(p.id);
      else           await api.follow(p.id);
    } catch { /* best-effort */ }
    setFollowing(f => !f);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:300, display:"flex", alignItems:"flex-end" }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ width:"100%", maxWidth:430, margin:"0 auto", maxHeight:"92vh", background:C.surface, borderRadius:"22px 22px 0 0", border:`1px solid ${C.border}`, overflowY:"auto" }}>
        <div style={{ padding:"12px 0 0", display:"flex", justifyContent:"center" }}><div style={{ width:36, height:4, borderRadius:99, background:C.border2 }} /></div>

        {/* Hero banner */}
        <div style={{ height:64, background:`linear-gradient(135deg, ${p.avatarColor}44, ${C.surface2})`, position:"relative" }}>
          {p.liveNow && (
            <div style={{ position:"absolute", top:10, right:14, display:"flex", gap:5, alignItems:"center", background:`${C.red}dd`, borderRadius:8, padding:"4px 10px" }}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:"#fff", animation:"pulse 1s infinite" }} />
              <span style={{ fontFamily:F.body, fontWeight:800, fontSize:12, color:"#fff" }}>LIVE NOW</span>
            </div>
          )}
        </div>

        <div style={{ padding:"0 18px 0", marginTop:-26 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:12 }}>
            <div style={{ width:56, height:56, borderRadius:"50%", background:`linear-gradient(145deg,${p.avatarColor}dd,${p.avatarColor}77)`, border:`3px solid ${C.surface}`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:F.body, fontWeight:800, fontSize:22, color:"#fff" }}>{p.avatar}</div>
            <button onClick={toggleFollow} style={{ padding:"8px 18px", borderRadius:99, background:following?C.surface3:C.accentSoft, border:`1px solid ${following?C.border2:C.accentLight}`, color:following?C.textMuted:C.accentLight, fontFamily:F.body, fontWeight:700, fontSize:13, cursor:"pointer" }}>
              {following?"Following":"Follow"}
            </button>
          </div>

          <div style={{ display:"flex", gap:7, alignItems:"center", marginBottom:4 }}>
            <span style={{ fontFamily:F.body, fontWeight:800, fontSize:20, color:C.text }}>{p.name}</span>
            <span style={{ fontSize:14, color:C.gold }}>✦</span>
            <Tag color={C.gold}>Verified Creator</Tag>
          </div>
          <div style={{ fontSize:12, color:C.textMuted, fontFamily:F.body, marginBottom:4 }}>{p.handle} · {p.realName}</div>
          <div style={{ fontSize:12, color:C.textMuted, fontFamily:F.body, marginBottom:10 }}>{p.country} · Age {p.age}</div>
          <p style={{ fontFamily:F.body, fontSize:13, color:C.textSub, lineHeight:1.6, marginBottom:14 }}>{p.bio}</p>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
            {[{v:p.followers,l:"Followers"},{v:p.following,l:"Following"}].map(s=>(
              <div key={s.l} style={{ background:C.surface2, borderRadius:10, padding:"10px 12px", textAlign:"center" }}>
                <div style={{ fontFamily:F.body, fontWeight:800, fontSize:18, color:C.accentLight }}>{s.v}</div>
                <div style={{ fontSize:11, color:C.textMuted, fontFamily:F.body, marginTop:1 }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Stream links */}
          <SectionLabel>Watch Live</SectionLabel>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
            {p.streams.map(s=><StreamBtn key={s.platform} stream={s} />)}
          </div>
          {p.liveNow && p.currentGame && (
            <div style={{ background:`${C.red}12`, border:`1px solid ${C.red}33`, borderRadius:12, padding:"10px 14px", marginBottom:16, display:"flex", gap:10, alignItems:"center" }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:C.red }} />
              <span style={{ fontFamily:F.body, fontSize:13, color:C.text }}>Currently playing <strong>{p.currentGame}</strong></span>
              {p.currentPlatform && <PlatformBadge id={p.currentPlatform} small />}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ padding:"0 18px", marginBottom:14 }}>
          <div style={{ display:"flex", gap:6 }}>
            {["games","activity"].map(t=>(
              <button key={t} onClick={()=>setTab(t)} style={{ flex:1, padding:"9px", borderRadius:10, background:tab===t?C.accentSoft:C.surface2, border:`1px solid ${tab===t?C.accentLight:C.border}`, color:tab===t?C.accentLight:C.textMuted, fontFamily:F.body, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                {t==="games"?"Top Games":"Recent"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding:"0 18px 28px" }}>
          {tab==="games" && games.map((g,i)=>(
            <div key={g.title} style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:14, padding:14, display:"flex", gap:12, alignItems:"center", marginBottom:8 }}>
              <span style={{ fontFamily:F.mono, fontSize:14, color:i===0?C.gold:C.textMuted, width:22, flexShrink:0 }}>#{i+1}</span>
              <div style={{ width:40, height:52, borderRadius:8, overflow:"hidden", flexShrink:0 }}><GameCover title={g.title} emoji={g.cover} emojiSize={20} /></div>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:F.body, fontWeight:700, fontSize:14, color:C.text }}>{g.title}</div>
                <div style={{ fontSize:12, color:C.textMuted, fontFamily:F.body, marginTop:2 }}>{g.genre} · {g.hours.toLocaleString()}h</div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={{ fontFamily:F.body, fontWeight:800, fontSize:18, color:g.rating>=9?C.gold:C.accentLight }}>{g.rating}</div>
                <div style={{ fontSize:10, color:C.textMuted }}>/ 10</div>
              </div>
            </div>
          ))}
          {tab==="activity" && activity.map((a,i)=>(
            <div key={i} style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:14, padding:14, marginBottom:8 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                  {a.type==="live" && <Tag color={C.red}>🔴 Was Live</Tag>}
                  {a.type==="review" && <Tag color={C.green}>Review</Tag>}
                  {a.type==="progress" && <Tag color={C.accentLight}>Progress</Tag>}
                  {a.type==="blurb" && <Tag color={C.accent}>Blurb</Tag>}
                  {a.game && <span style={{ fontSize:12, color:C.textMuted, fontFamily:F.body }}>{a.cover} {a.game}</span>}
                </div>
                <span style={{ fontSize:11, color:C.textMuted, fontFamily:F.mono }}>{a.time}</span>
              </div>
              <p style={{ fontFamily:F.display, fontStyle:"italic", fontSize:14, color:C.textSub, lineHeight:1.6 }}>"{a.text}"</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── FRIEND PROFILE SHEET ─────────────────────────────────────────────────────
const FriendProfileSheet = ({ profileKey, onClose }) => {
  const [p,        setP]       = useState(null);
  const [games,    setGames]   = useState([]);
  const [activity, setActivity]= useState([]);
  const [tab,      setTab]     = useState("games");
  const [favorited,setFavorited] = useState(false);

  useEffect(() => {
    let uid = null;
    api.getUser(profileKey)
      .then(u => {
        uid = u.id;
        setP({
          name: u.username, handle: u.handle, avatar: u.avatar || "?",
          avatarColor: u.avatarColor || C.accent,
          bio: u.bio || "", country: u.country || "", age: u.age || "",
          followers:   u._count?.followers  || 0,
          following:   u._count?.following  || 0,
          gamesPlayed: u._count?.gameLogs   || 0,
          status: u.status || "offline", statusGame: u.currentGame,
          statusPlatform: u.currentPlatform, isPublic: u.isPublic,
          badges: (u.badges || []).map(b => b.badgeId || b.badge?.id || b),
        });
        return api.getUserGames(uid);
      })
      .then(logs => {
        if (logs.length) setGames(logs.slice(0, 5).map(l => adaptLog(l)));
        if (uid) return api.getUserReviews(uid);
      })
      .then(reviews => {
        if (reviews?.length) setActivity(reviews.slice(0, 5).map(r => ({
          type: "review", time: relTime(r.createdAt),
          game: r.game?.title || "", cover: r.game?.cover || "🎮",
          text: r.body || "",
        })));
      })
      .catch(() => {}); // keep static fallback on error
  }, [profileKey]);

  if (!p) return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.82)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <span style={{ color:C.textMuted, fontFamily:F.body }}>Loading…</span>
    </div>
  );

  const statusColor = { online:C.greenLight, idle:C.gold, dnd:C.red, offline:C.textMuted }[p.status];

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.82)", zIndex:300, display:"flex", alignItems:"flex-end" }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ width:"100%", maxWidth:430, margin:"0 auto", maxHeight:"92vh", background:C.surface, borderRadius:"22px 22px 0 0", border:`1px solid ${C.border}`, overflowY:"auto" }}>
        <div style={{ padding:"12px 0 0", display:"flex", justifyContent:"center" }}><div style={{ width:36, height:4, borderRadius:99, background:C.border2 }} /></div>
        <div style={{ padding:"14px 18px 0" }}>
          <div style={{ display:"flex", gap:14, alignItems:"flex-start", marginBottom:14 }}>
            <div style={{ position:"relative" }}>
              <Avatar char={p.avatar} color={p.avatarColor} size={58} fontSize={21} />
              <div style={{ position:"absolute", bottom:1, right:1 }}><StatusDot status={p.status} /></div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:F.body, fontWeight:800, fontSize:19, color:C.text }}>{p.name}</div>
              <div style={{ fontSize:12, color:C.textMuted, fontFamily:F.body }}>{p.handle} · {p.country} · Age {p.age}</div>
              <div style={{ display:"flex", gap:5, alignItems:"center", marginTop:5 }}>
                <div style={{ width:7, height:7, borderRadius:"50%", background:statusColor }} />
                <span style={{ fontSize:12, color:statusColor, fontFamily:F.body, fontWeight:600 }}>{{ online:"Online",idle:"Idle",dnd:"Busy",offline:"Offline" }[p.status]}</span>
                {p.statusGame && <><span style={{ color:C.textMuted, fontSize:12 }}>·</span><span style={{ fontSize:12, color:C.textMuted, fontFamily:F.body }}>{p.statusGame}</span>{p.statusPlatform&&<PlatformBadge id={p.statusPlatform} small />}</>}
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6, flexShrink:0 }}>
              <button style={{ padding:"7px 14px", borderRadius:99, background:C.accentSoft, border:`1px solid ${C.accentLight}`, color:C.accentLight, fontFamily:F.body, fontWeight:700, fontSize:12, cursor:"pointer" }}>Following</button>
              <button onClick={()=>setFavorited(f=>!f)} style={{ padding:"7px 14px", borderRadius:99, background:favorited?`${C.gold}22`:"transparent", border:`1px solid ${favorited?C.gold:C.border2}`, color:favorited?C.gold:C.textMuted, fontFamily:F.body, fontWeight:700, fontSize:12, cursor:"pointer" }}>
                {favorited?"⭐ Priority":"☆ Prioritize"}
              </button>
            </div>
          </div>

          <p style={{ fontFamily:F.display, fontStyle:"italic", fontSize:14, color:C.textSub, lineHeight:1.65, marginBottom:12 }}>{p.bio}</p>

          {/* Privacy notice for private users */}
          {!p.isPublic && (
            <div style={{ background:`${C.orange}15`, border:`1px solid ${C.orange}44`, borderRadius:10, padding:"10px 14px", marginBottom:12, display:"flex", gap:8, alignItems:"flex-start" }}>
              <span style={{ fontSize:14 }}>🔒</span>
              <div>
                <div style={{ fontFamily:F.body, fontWeight:700, fontSize:12, color:C.orange }}>Private profile</div>
                <div style={{ fontSize:11, color:C.textMuted, fontFamily:F.body, lineHeight:1.5 }}>This user has set their profile to private. You can see activity because you're mutual friends.</div>
              </div>
            </div>
          )}

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
            {[{v:p.gamesPlayed,l:"Games"},{v:p.followers,l:"Followers"},{v:p.following,l:"Following"}].map(s=>(
              <div key={s.l} style={{ background:C.surface2, borderRadius:10, padding:"10px 8px", textAlign:"center" }}>
                <div style={{ fontFamily:F.body, fontWeight:800, fontSize:17, color:C.accentLight }}>{s.v}</div>
                <div style={{ fontSize:11, color:C.textMuted, fontFamily:F.body, marginTop:1 }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Badges */}
          <SectionLabel>Badges</SectionLabel>
          <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:16 }}>
            {p.badges.map(bk=>{ const b=BADGES[bk]; return (
              <div key={bk} style={{ display:"flex", gap:6, alignItems:"center", background:C.surface2, border:`1px solid ${b.color}33`, borderRadius:10, padding:"6px 10px" }} title={b.desc}>
                <span style={{ fontSize:14 }}>{b.icon}</span>
                <span style={{ fontFamily:F.body, fontWeight:700, fontSize:12, color:b.color }}>{b.label}</span>
              </div>
            ); })}
          </div>
        </div>

        <div style={{ padding:"0 18px", marginBottom:14 }}>
          <div style={{ display:"flex", gap:6 }}>
            {["games","activity"].map(t=>(
              <button key={t} onClick={()=>setTab(t)} style={{ flex:1, padding:"9px", borderRadius:10, background:tab===t?C.accentSoft:C.surface2, border:`1px solid ${tab===t?C.accentLight:C.border}`, color:tab===t?C.accentLight:C.textMuted, fontFamily:F.body, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                {t==="games"?"Top Games":"Recent Activity"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding:"0 18px 28px" }}>
          {tab==="games" && games.map((g,i)=>(
            <div key={g.title} style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:14, padding:14, display:"flex", gap:12, alignItems:"center", marginBottom:8 }}>
              <span style={{ fontFamily:F.mono, fontSize:14, color:i===0?C.gold:C.textMuted, width:22, flexShrink:0 }}>#{i+1}</span>
              <div style={{ width:40, height:52, borderRadius:8, overflow:"hidden", flexShrink:0 }}><GameCover title={g.title} emoji={g.cover||"🎮"} emojiSize={20} /></div>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:F.body, fontWeight:700, fontSize:14, color:C.text }}>{g.title}</div>
                <div style={{ display:"flex", gap:5, alignItems:"center", marginTop:3 }}><PlatformBadge id={g.platform} small /><span style={{ fontSize:11, color:C.textMuted, fontFamily:F.body }}>{g.hours}h</span>{g.trophies.platinum&&<span style={{ fontSize:12 }}>🏆</span>}</div>
                <div style={{ marginTop:6 }}><ProgressBar pct={g.progress} /></div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={{ fontFamily:F.body, fontWeight:800, fontSize:18, color:g.rating===10?C.gold:C.accentLight }}>{g.rating}</div>
                <div style={{ fontSize:10, color:C.textMuted }}>/ 10</div>
              </div>
            </div>
          ))}
          {tab==="activity" && activity.map((a,i)=>(
            <div key={i} style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:14, padding:14, marginBottom:8 }}>
              <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                <span style={{ fontSize:22, flexShrink:0 }}>{a.cover}</span>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontFamily:F.body, fontWeight:700, fontSize:13, color:C.accentLight }}>{a.game}</span>
                    <span style={{ fontSize:11, color:C.textMuted, fontFamily:F.mono }}>{a.time}</span>
                  </div>
                  <div style={{ marginTop:3 }}>
                    {a.type==="achievement"&&<Tag color={C.gold}>Achievement</Tag>}
                    {a.type==="review"&&<Tag color={C.green}>Review</Tag>}
                    {a.type==="progress"&&<Tag color={C.accentLight}>Progress</Tag>}
                    {a.type==="blurb"&&<Tag color={C.accent}>Blurb</Tag>}
                  </div>
                  <p style={{ fontFamily:F.display, fontStyle:"italic", fontSize:14, color:C.textSub, lineHeight:1.6, marginTop:8 }}>"{a.text}"</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── STUDIO PROFILE SHEET ─────────────────────────────────────────────────────
const StudioProfileSheet = ({ studioId, onClose }) => {
  const [s,        setS]       = useState(null);
  const [tab,      setTab]     = useState("games");
  const [following,setFollowing]= useState(false);
  const [watchlist,setWatchlist]= useState({});
  const { user } = useAuth();

  useEffect(() => {
    api.getStudio(studioId)
      .then(studio => {
        setFollowing(studio.following);
        setS({
          id: studio.id, name: studio.name, handle: studio.handle,
          avatar: studio.avatar || "🏢", bio: studio.bio || "",
          verified: true, following: studio.following,
          founded: studio.founded, location: studio.location,
          followers: studio._count?.followers != null
            ? (studio._count.followers >= 1000000 ? `${(studio._count.followers/1000000).toFixed(1)}M`
               : studio._count.followers >= 1000   ? `${(studio._count.followers/1000).toFixed(1)}K`
               : String(studio._count.followers))
            : "0",
          totalGames: studio.games?.length || 0,
          topGames: (studio.games || []).map(sg => ({
            title:       sg.game.title,
            cover:       sg.game.cover || "🎮",
            year:        sg.game.year,
            criticScore: sg.game.avgRating ? Math.round(sg.game.avgRating * 10) : null,
            audienceScore: null,
            desc:        "",
            genre:       sg.game.genre || "",
            platform:    "Multi-platform",
            hours:       sg.game.avgHours || "—",
          })),
          news: (studio.news || []).map(n => ({
            type:  n.type || "announcement",
            time:  relTime(n.createdAt),
            title: n.title,
            desc:  n.desc,
          })),
          upcoming: (studio.upcoming || []).map(u => ({
            title:       u.title,
            cover:       u.cover || "🎮",
            releaseDate: u.releaseDate,
            announced:   true,
            countdown:   !!u.releaseDate,
          })),
        });
      })
      .catch(() => {}); // keep static fallback on error
  }, [studioId]);

  if (!s) return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.82)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <span style={{ color:C.textMuted, fontFamily:F.body }}>Loading…</span>
    </div>
  );

  const toggleFollow = async () => {
    if (!user) return;
    try {
      if (following) await api.unfollowStudio(studioId);
      else           await api.followStudio(studioId);
      setFollowing(f => !f);
    } catch (e) { console.error(e); }
  };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.82)", zIndex:300, display:"flex", alignItems:"flex-end" }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ width:"100%", maxWidth:430, margin:"0 auto", maxHeight:"92vh", background:C.surface, borderRadius:"22px 22px 0 0", border:`1px solid ${C.border}`, overflowY:"auto" }}>
        <div style={{ padding:"12px 0 0", display:"flex", justifyContent:"center" }}><div style={{ width:36, height:4, borderRadius:99, background:C.border2 }} /></div>
        <div style={{ padding:"14px 18px 0" }}>
          <div style={{ display:"flex", gap:14, alignItems:"center", marginBottom:14 }}>
            <div style={{ width:58, height:58, borderRadius:16, background:C.surface2, border:`1px solid ${C.border2}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:28 }}>{s.avatar}</div>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}><span style={{ fontFamily:F.body, fontWeight:800, fontSize:19, color:C.text }}>{s.name}</span>{s.verified&&<span style={{ fontSize:13, color:C.accentLight }}>✓</span>}</div>
              <div style={{ fontSize:12, color:C.textMuted, fontFamily:F.body }}>{s.handle}</div>
              <div style={{ fontSize:12, color:C.textMuted, fontFamily:F.body, marginTop:2 }}>{s.location} · Est. {s.founded}</div>
            </div>
            <button onClick={toggleFollow} style={{ padding:"8px 16px", borderRadius:99, background:following?C.surface3:C.accentSoft, border:`1px solid ${following?C.border2:C.accentLight}`, color:following?C.textMuted:C.accentLight, fontFamily:F.body, fontWeight:700, fontSize:12, cursor:"pointer" }}>
              {following?"Following":"Follow"}
            </button>
          </div>
          <p style={{ fontFamily:F.body, fontSize:13, color:C.textSub, lineHeight:1.6, marginBottom:12 }}>{s.bio}</p>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
            {[{v:s.followers,l:"Followers"},{v:s.totalGames,l:"Games Published"}].map(st=>(
              <div key={st.l} style={{ background:C.surface2, borderRadius:10, padding:"10px 12px", textAlign:"center" }}>
                <div style={{ fontFamily:F.body, fontWeight:800, fontSize:18, color:C.accentLight }}>{st.v}</div>
                <div style={{ fontSize:11, color:C.textMuted, fontFamily:F.body, marginTop:1 }}>{st.l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding:"0 18px", marginBottom:14 }}>
          <div style={{ display:"flex", gap:6 }}>
            {["games","news","upcoming"].map(t=>(
              <button key={t} onClick={()=>setTab(t)} style={{ flex:1, padding:"9px 4px", borderRadius:10, background:tab===t?C.accentSoft:C.surface2, border:`1px solid ${tab===t?C.accentLight:C.border}`, color:tab===t?C.accentLight:C.textMuted, fontFamily:F.body, fontWeight:700, fontSize:12, cursor:"pointer" }}>
                {t[0].toUpperCase()+t.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding:"0 18px 28px" }}>
          {tab==="games" && s.topGames.map(g=>(
            <div key={g.title} style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:16, overflow:"hidden", marginBottom:12 }}>
              <div style={{ padding:"14px 14px 10px", display:"flex", gap:12, alignItems:"center" }}>
                <div style={{ width:46, height:46, borderRadius:12, border:`1px solid ${C.border2}`, overflow:"hidden", flexShrink:0 }}><GameCover title={g.title} emoji={g.cover} emojiSize={22} /></div>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:F.body, fontWeight:800, fontSize:16, color:C.text }}>{g.title}</div>
                  <div style={{ display:"flex", gap:6, alignItems:"center", marginTop:3, flexWrap:"wrap" }}><span style={{ fontSize:12, color:C.textMuted, fontFamily:F.body }}>{g.year}</span><Tag color={C.accent}>{g.genre}</Tag><span style={{ fontSize:11, color:C.textMuted, fontFamily:F.body }}>{g.platform}</span></div>
                </div>
              </div>
              <div style={{ padding:"10px 14px", background:`${C.tomatoFresh}08`, borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, display:"flex", gap:18, alignItems:"center" }}>
                <RTScore score={g.criticScore} type="critic" size={54} />
                <RTScore score={g.audienceScore} type="audience" size={54} />
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:F.body, fontWeight:700, fontSize:12, color:C.textMuted, marginBottom:4 }}>Verdict</div>
                  <div style={{ fontFamily:F.body, fontWeight:800, fontSize:14, color:g.criticScore>=90?C.greenLight:g.criticScore>=70?C.gold:C.red }}>{g.criticScore>=90?"Must Play":g.criticScore>=80?"Great":g.criticScore>=70?"Good":"Mixed"}</div>
                  <div style={{ fontSize:11, color:C.textMuted, fontFamily:F.mono, marginTop:2 }}>{g.hours} avg</div>
                </div>
              </div>
              <div style={{ padding:"12px 14px" }}><p style={{ fontSize:13, color:C.textSub, lineHeight:1.6, fontFamily:F.body }}>{g.desc}</p></div>
            </div>
          ))}
          {tab==="news" && s.news.map((n,i)=>{
            const isS=n.type==="livestream";
            return (
              <div key={i} style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:14, padding:14, marginBottom:10 }}>
                <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:10 }}>
                  <Tag color={isS?C.red:n.type==="update"?C.green:C.accentLight}>{isS?"🔴 Livestream":n.type==="update"?"🔧 Update":"📢 News"}</Tag>
                  <span style={{ fontSize:11, color:C.textMuted, fontFamily:F.mono, marginLeft:"auto" }}>{n.time}</span>
                </div>
                <div style={{ fontFamily:F.body, fontWeight:700, fontSize:15, color:C.text, marginBottom:6 }}>{n.title}</div>
                <p style={{ fontSize:13, color:C.textSub, lineHeight:1.6, fontFamily:F.body }}>{n.desc}</p>
              </div>
            );
          })}
          {tab==="upcoming" && s.upcoming.map((u,i)=>(
            <div key={i} style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:16, padding:16, marginBottom:12 }}>
              <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:12 }}>
                <div style={{ width:50, height:50, borderRadius:14, border:`1px solid ${C.border2}`, overflow:"hidden", flexShrink:0 }}><GameCover title={u.title} emoji={u.cover||"🎮"} emojiSize={24} /></div>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:F.body, fontWeight:800, fontSize:16, color:C.text }}>{u.title}</div>
                  {u.releaseDate ? <div style={{ fontSize:13, color:C.greenLight, fontFamily:F.mono, marginTop:3 }}>{new Date(u.releaseDate).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
                    : <div style={{ fontSize:13, color:C.textMuted, fontFamily:F.body, marginTop:3 }}>Release date TBA</div>}
                </div>
                {u.releaseDate?<Tag color={C.green}>Coming Soon</Tag>:<Tag color={C.orange}>Announced</Tag>}
              </div>
              {u.countdown && u.releaseDate && (
                <div style={{ background:C.surface3, borderRadius:12, padding:"12px 14px", marginBottom:10 }}>
                  <div style={{ fontFamily:F.body, fontWeight:700, fontSize:11, color:C.textMuted, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.07em" }}>⏱ Launch Countdown</div>
                  <Countdown releaseDate={u.releaseDate} />
                </div>
              )}
              <button onClick={()=>setWatchlist(w=>({...w,[u.title]:!w[u.title]}))} style={{ width:"100%", padding:"9px", borderRadius:10, background:watchlist[u.title]?`${C.green}20`:C.surface3, border:`1px solid ${watchlist[u.title]?C.green+"55":C.border2}`, color:watchlist[u.title]?C.greenLight:C.textMuted, fontFamily:F.body, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                {watchlist[u.title]?"✓ On Watchlist":"+ Add to Watchlist"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── EDIT PROFILE SHEET ────────────────────────────────────────────────────────
const EditProfileSheet = ({ userProfile, onSave, onClose }) => {
  const [form, setForm] = useState({ ...userProfile });
  const [isPublic, setIsPublic] = useState(userProfile.isPublic);
  const [allowFollowers, setAllowFollowers] = useState(userProfile.allowFollowers);
  const fileRef = useRef();

  const handleImg = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setForm(p => ({ ...p, avatarImg: r.result }));
    r.readAsDataURL(f);
  };

  const Toggle = ({ label, desc, value, onChange }) => (
    <div style={{ display:"flex", gap:12, alignItems:"flex-start", padding:"12px 0", borderBottom:`1px solid ${C.border}` }}>
      <div style={{ flex:1 }}>
        <div style={{ fontFamily:F.body, fontWeight:700, fontSize:14, color:C.text }}>{label}</div>
        <div style={{ fontSize:12, color:C.textMuted, fontFamily:F.body, lineHeight:1.5, marginTop:3 }}>{desc}</div>
      </div>
      <button onClick={()=>onChange(!value)} style={{ width:46, height:26, borderRadius:99, background:value?C.accent:C.surface3, border:`1px solid ${value?C.accent:C.border2}`, cursor:"pointer", position:"relative", flexShrink:0, transition:"background .2s" }}>
        <div style={{ width:20, height:20, borderRadius:"50%", background:"#fff", position:"absolute", top:2, left:value?22:2, transition:"left .2s" }} />
      </button>
    </div>
  );

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:400, display:"flex", alignItems:"flex-end" }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ width:"100%", maxWidth:430, margin:"0 auto", maxHeight:"92vh", background:C.surface, borderRadius:"22px 22px 0 0", border:`1px solid ${C.border}`, overflowY:"auto" }}>
        <div style={{ padding:"12px 0 0", display:"flex", justifyContent:"center" }}><div style={{ width:36, height:4, borderRadius:99, background:C.border2 }} /></div>
        <div style={{ padding:"16px 18px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <span style={{ fontFamily:F.body, fontWeight:800, fontSize:17, color:C.text }}>Edit Profile</span>
            <button onClick={()=>{onSave(form,isPublic,allowFollowers);onClose();}} style={{ padding:"8px 18px", borderRadius:10, background:C.accent, border:"none", color:"#fff", fontFamily:F.body, fontWeight:700, fontSize:13, cursor:"pointer" }}>Save</button>
          </div>

          {/* Avatar upload */}
          <div style={{ display:"flex", gap:14, alignItems:"center", marginBottom:20, padding:"16px", background:C.surface2, borderRadius:14, border:`1px solid ${C.border}` }}>
            <div style={{ width:64, height:64, borderRadius:"50%", background:`linear-gradient(145deg,${C.accent}dd,${C.accent}77)`, border:`2px solid ${C.accentLight}44`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:F.body, fontWeight:800, fontSize:24, color:"#fff", overflow:"hidden", flexShrink:0 }}>
              {form.avatarImg ? <img src={form.avatarImg} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : form.avatarChar}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:F.body, fontWeight:700, fontSize:14, color:C.text, marginBottom:6 }}>Profile Photo</div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleImg} />
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>fileRef.current?.click()} style={{ padding:"7px 14px", borderRadius:9, background:C.accentSoft, border:`1px solid ${C.accentLight}`, color:C.accentLight, fontFamily:F.body, fontWeight:700, fontSize:12, cursor:"pointer" }}>Upload Photo</button>
                {form.avatarImg && <button onClick={()=>setForm(p=>({...p,avatarImg:null}))} style={{ padding:"7px 14px", borderRadius:9, background:C.surface3, border:`1px solid ${C.border2}`, color:C.textMuted, fontFamily:F.body, fontWeight:700, fontSize:12, cursor:"pointer" }}>Remove</button>}
              </div>
            </div>
          </div>

          {/* Fields */}
          {[{label:"Display Name",key:"name"},{label:"Username",key:"handle"},{label:"Bio",key:"bio",textarea:true}].map(f=>(
            <div key={f.key} style={{ marginBottom:14 }}>
              <div style={{ fontFamily:F.body, fontWeight:600, fontSize:12, color:C.textMuted, marginBottom:6 }}>{f.label}</div>
              {f.textarea
                ? <textarea value={form[f.key]||""} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} rows={3} style={{ width:"100%", background:C.surface2, border:`1px solid ${C.border2}`, borderRadius:10, padding:"10px 12px", color:C.text, fontFamily:F.body, fontSize:14, resize:"none", outline:"none", lineHeight:1.6, boxSizing:"border-box" }} />
                : <input value={form[f.key]||""} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} style={{ width:"100%", background:C.surface2, border:`1px solid ${C.border2}`, borderRadius:10, padding:"10px 12px", color:C.text, fontFamily:F.body, fontSize:14, outline:"none", boxSizing:"border-box" }} />
              }
            </div>
          ))}

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
            <div>
              <div style={{ fontFamily:F.body, fontWeight:600, fontSize:12, color:C.textMuted, marginBottom:6 }}>Country</div>
              <select value={form.country||""} onChange={e=>setForm(p=>({...p,country:e.target.value}))} style={{ width:"100%", background:C.surface2, border:`1px solid ${C.border2}`, borderRadius:10, padding:"10px 12px", color:C.text, fontFamily:F.body, fontSize:13, outline:"none", cursor:"pointer", boxSizing:"border-box" }}>
                <option value="">Select country</option>
                {COUNTRIES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontFamily:F.body, fontWeight:600, fontSize:12, color:C.textMuted, marginBottom:6 }}>Age</div>
              <input type="number" min="13" max="100" value={form.age||""} onChange={e=>setForm(p=>({...p,age:e.target.value}))} style={{ width:"100%", background:C.surface2, border:`1px solid ${C.border2}`, borderRadius:10, padding:"10px 12px", color:C.text, fontFamily:F.body, fontSize:14, outline:"none", boxSizing:"border-box" }} />
            </div>
          </div>

          {/* Privacy section */}
          <div style={{ fontFamily:F.body, fontWeight:800, fontSize:14, color:C.text, marginBottom:4, marginTop:4 }}>Privacy</div>
          <p style={{ fontSize:12, color:C.textMuted, fontFamily:F.body, lineHeight:1.5, marginBottom:12 }}>Control who can see your profile and follow your progress.</p>
          <Toggle label="Public Profile" desc="Anyone can view your profile, top games, and stats. Your reviews and blurbs are discoverable." value={isPublic} onChange={setIsPublic} />
          <Toggle label="Allow Followers" desc="Non-friends can follow you and see your updates in their feed. Requires explicit opt-in — no one follows you without your profile being public." value={allowFollowers} onChange={setAllowFollowers} />
          <div style={{ height:20 }} />
        </div>
      </div>
    </div>
  );
};

// ─── DISCORD PANEL ────────────────────────────────────────────────────────────
const DiscordPanel = ({ onOpenFriend }) => {
  const [tab, setTab] = useState("online");
  const { user } = useAuth();
  const [friends, setFriends] = useState([]);

  useEffect(() => {
    if (!user?.id) return;
    api.getFollowing(user.id).then(following => {
      setFriends(following.map(f => ({
        id: f.id, name: f.username, avatar: f.avatar || "?",
        avatarColor: f.avatarColor || "#5865f2",
        status: f.status || "offline", game: f.currentGame,
        platform: f.currentPlatform, suggested: false,
      })));
    }).catch(() => {});
  }, [user?.id]);

  const online = friends.filter(f=>f.status==="online");
  const suggested = friends.filter(f=>f.suggested);
  const list = tab==="online"?online:suggested;
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.discord}33`, borderRadius:16, overflow:"hidden", marginBottom:14 }}>
      <div style={{ background:`linear-gradient(90deg,${C.discord}22,${C.surface2})`, padding:"12px 14px", borderBottom:`1px solid ${C.border}`, display:"flex", gap:8, alignItems:"center" }}>
        <span style={{ fontSize:18 }}>🎧</span>
        <span style={{ fontFamily:F.body, fontWeight:700, fontSize:14, color:C.text }}>Discord</span>
        <div style={{ marginLeft:"auto", display:"flex", gap:2, background:C.surface3, borderRadius:8, padding:3 }}>
          {[["online",`Online (${online.length})`],["suggested","Add Friends"]].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{ padding:"4px 10px", borderRadius:6, border:"none", cursor:"pointer", background:tab===t?C.accent:"transparent", color:tab===t?"#fff":C.textMuted, fontFamily:F.body, fontWeight:600, fontSize:11 }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ padding:"0 12px" }}>
        {list.map((f,i)=>(
          <div key={f.id} style={{ display:"flex", gap:10, alignItems:"center", padding:"10px 0", borderBottom:i<list.length-1?`1px solid ${C.border}`:"none", cursor:f.profileKey?"pointer":"default" }} onClick={()=>f.profileKey&&onOpenFriend(f.profileKey)}>
            <div style={{ position:"relative", flexShrink:0 }}>
              <Avatar char={f.avatar} color={f.avatarColor} size={34} fontSize={13} />
              <div style={{ position:"absolute", bottom:-1, right:-1 }}><StatusDot status={f.status} /></div>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                <span style={{ fontFamily:F.body, fontWeight:700, fontSize:13, color:C.text }}>{f.name}</span>
                {f.suggested&&<Tag color={C.discord}>Suggested</Tag>}
                {f.profileKey&&<span style={{ fontSize:11, color:C.textMuted }}>→</span>}
              </div>
              {f.game ? <div style={{ display:"flex", gap:5, alignItems:"center", marginTop:2, flexWrap:"wrap" }}><span style={{ fontSize:12, color:C.textMuted, fontFamily:F.body }}>{f.game}</span>{f.platform&&<PlatformBadge id={f.platform} small />}{f.coop&&<Tag color={C.green}>Co-op</Tag>}</div>
                : <span style={{ fontSize:12, color:C.textMuted, fontFamily:F.body }}>{f.activity}</span>}
            </div>
            <a href="discord://" onClick={e=>{ e.preventDefault(); e.stopPropagation(); window.location.href="discord://"; setTimeout(()=>window.open("https://discord.com","_blank"),600); }} style={{ padding:"5px 11px", borderRadius:8, background:C.discordSoft, color:"#7983f5", fontFamily:F.body, fontWeight:700, fontSize:11, border:`1px solid ${C.discord}33`, textDecoration:"none", whiteSpace:"nowrap", flexShrink:0 }}>
              {f.suggested?"Add":"Open ↗"}
            </a>
          </div>
        ))}
      </div>
      <div style={{ padding:"10px 14px", borderTop:`1px solid ${C.border}`, background:C.surface2, display:"flex", justifyContent:"space-between" }}>
        <span style={{ fontSize:12, color:C.textMuted, fontFamily:F.body }}>Synced · {friends.length} friends</span>
        <a href="discord://" onClick={e=>{ e.preventDefault(); window.location.href="discord://"; setTimeout(()=>window.open("https://discord.com","_blank"),600); }} style={{ fontSize:12, color:"#7983f5", fontFamily:F.body, fontWeight:600, textDecoration:"none" }}>Open Discord ↗</a>
      </div>
    </div>
  );
};

// ─── GAME CATALOG ─────────────────────────────────────────────────────────────
// ─── GAME INFO SHEET ──────────────────────────────────────────────────────────
const GameInfoSheet = ({ title, onClose, onOpenStudio }) => {
  const { user } = useAuth();

  const [dbGame,        setDbGame]        = useState(null);
  const [inLibrary,     setInLibrary]     = useState(false);
  const [inWishlist,    setInWishlist]    = useState(false);
  const [showLogPicker, setShowLogPicker] = useState(false);
  const [logPlatform,   setLogPlatform]   = useState("ps5");
  const [logDone,       setLogDone]       = useState(false);
  const [realReviews,   setRealReviews]   = useState([]);

  // Only use RAWG as supplement for description / playtime if DB doesn't have it
  const rawg = useRawgGame(dbGame?.backgroundImage ? null : title);

  // Data precedence: DB → RAWG → fallback
  const cover       = dbGame?.cover || "🎮";
  const genre       = dbGame?.genre || rawg?.genres?.[0] || "";
  const studio      = dbGame?.studios?.[0]?.studio?.name || rawg?.developers?.[0] || dbGame?.developer || "";
  const year        = dbGame?.year || rawg?.released || "";
  const criticScore = dbGame?.metacritic ?? rawg?.metacritic ?? null;
  const desc        = rawg?.description_raw
    ? rawg.description_raw.slice(0, 320).replace(/\n+/g, " ").trim() + (rawg.description_raw.length > 320 ? "…" : "")
    : "";
  const platforms   = rawg?.platforms || [];
  const avgHours    = rawg?.playtime ? `~${rawg.playtime}h avg` : "";
  const coop        = dbGame?.coop || false;

  useEffect(() => {
    api.getGames({ q: title, limit: 10 }).then(games => {
      const match = games.find(g => g.title.toLowerCase() === title.toLowerCase()) || games[0];
      if (!match) return;
      setDbGame(match);
      fetch(`${import.meta.env?.VITE_API_URL ?? "http://localhost:3001"}/reviews/game/${match.id}`)
        .then(r => r.json())
        .then(reviews => setRealReviews(Array.isArray(reviews) ? reviews : []))
        .catch(() => {});
    }).catch(() => {});

    if (user) {
      api.getMyLibrary().then(logs => {
        const found = logs.find(l => l.game?.title?.toLowerCase() === title.toLowerCase());
        if (found) {
          setInLibrary(found.status !== "wishlist");
          setInWishlist(found.status === "wishlist");
        }
      }).catch(() => {});
    }
  }, [title, user]);

  const friendRatings = realReviews.slice(0, 3).map(r => ({
    user: r.user?.username || "?", avatar: r.user?.avatar || "?",
    color: r.user?.avatarColor || "#5865f2", rating: r.rating,
  }));

  const avgFriendRating = friendRatings.length
    ? (friendRatings.reduce((s,f)=>s+f.rating,0)/friendRatings.length).toFixed(1)
    : null;

  const bannerUrl = dbGame?.backgroundImage || rawg?.background_image || null;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:300, display:"flex", alignItems:"flex-end" }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ width:"100%", maxWidth:430, margin:"0 auto", maxHeight:"92vh", background:C.surface, borderRadius:"22px 22px 0 0", border:`1px solid ${C.border}`, overflowY:"auto" }}>

        {/* Drag handle */}
        <div style={{ padding:"12px 0 0", display:"flex", justifyContent:"center" }}>
          <div style={{ width:36, height:4, borderRadius:99, background:C.border2 }} />
        </div>

        {/* Full-width banner */}
        {bannerUrl && (
          <div style={{ position:"relative", height:160, margin:"10px 0 0", overflow:"hidden" }}>
            <img src={bannerUrl} alt={title} style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }} />
            <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom, transparent 30%, rgba(15,17,23,0.95) 100%)" }} />
            {criticScore && (
              <div style={{ position:"absolute", top:10, right:14, background:"rgba(0,0,0,0.75)", borderRadius:8, padding:"4px 8px", display:"flex", flexDirection:"column", alignItems:"center" }}>
                <span style={{ fontFamily:F.mono, fontSize:16, fontWeight:700, color:criticScore>=90?C.greenLight:criticScore>=75?C.gold:C.orange }}>{criticScore}</span>
                <span style={{ fontFamily:F.body, fontSize:8, color:C.textMuted, textTransform:"uppercase" }}>Metacritic</span>
              </div>
            )}
          </div>
        )}

        <div style={{ padding: bannerUrl ? "0 18px 0" : "14px 18px 0" }}>
          {/* Hero row */}
          <div style={{ display:"flex", gap:14, alignItems:"flex-start", marginBottom:16, marginTop: bannerUrl ? -40 : 0 }}>
            <div style={{ width:80, height:100, borderRadius:16, border:`1px solid ${C.border2}`, overflow:"hidden", flexShrink:0, boxShadow:"0 4px 20px rgba(0,0,0,0.5)" }}>
              <GameCover title={title} emoji={cover} emojiSize={38} imgUrl={bannerUrl} />
            </div>
            <div style={{ flex:1, paddingTop: bannerUrl ? 44 : 4 }}>
              <div style={{ fontFamily:F.body, fontWeight:800, fontSize:20, color:C.text, lineHeight:1.2, marginBottom:4 }}>{title}</div>
              <div style={{ fontSize:13, color:C.textMuted, fontFamily:F.body, marginBottom:8 }}>
                <span style={{ color:C.accentLight, fontWeight:700, cursor:"pointer" }} onClick={()=>{ onClose(); if(g.studioId && onOpenStudio) onOpenStudio(g.studioId); }}>{studio}</span>
                {year && <>{" · "}{year}</>}
              </div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {genre && <Tag color={C.accent}>{genre}</Tag>}
                {coop  && <Tag color={C.green}>Co-op</Tag>}
              </div>
            </div>
          </div>

          {/* Description */}
          {desc && <p style={{ fontFamily:F.body, fontSize:13, color:C.textSub, lineHeight:1.7, marginBottom:16 }}>{desc}</p>}

          {/* Key stats grid */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
            {[
              avgHours ? { label:"Avg. Time", val:avgHours,     icon:"⏱️" } : null,
              year     ? { label:"Released",  val:String(year), icon:"📅" } : null,
            ].filter(Boolean).map(s=>(
              <div key={s.label} style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:12, padding:"10px 8px", textAlign:"center" }}>
                <div style={{ fontSize:16, marginBottom:4 }}>{s.icon}</div>
                <div style={{ fontFamily:F.body, fontWeight:800, fontSize:12, color:s.color||C.text, lineHeight:1.2 }}>{s.val}</div>
                <div style={{ fontFamily:F.body, fontSize:9, color:C.textMuted, marginTop:2, textTransform:"uppercase", letterSpacing:"0.05em" }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Scores */}
          {criticScore ? (
            <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:14, padding:"12px 14px", marginBottom:14 }}>
              <div style={{ fontFamily:F.body, fontWeight:700, fontSize:11, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>Metacritic Score</div>
              <div style={{ display:"flex", gap:20, alignItems:"center" }}>
                <RTScore score={criticScore} type="critic" size={56} />
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:F.body, fontWeight:800, fontSize:15, color:criticScore>=90?C.greenLight:criticScore>=75?C.gold:C.orange }}>
                    {criticScore>=90?"Must Play":criticScore>=80?"Great":criticScore>=70?"Good":"Mixed"}
                  </div>
                  <div style={{ fontFamily:F.body, fontSize:11, color:C.textMuted, marginTop:3, lineHeight:1.5 }}>
                    {criticScore>=90?"Critics agree — this is essential.":"Worth a look if the genre fits."}
                  </div>
                </div>
              </div>
            </div>
          ) : !rawg ? (
            <div style={{ background:`${C.accent}10`, border:`1px solid ${C.accent}33`, borderRadius:12, padding:"10px 14px", marginBottom:14, display:"flex", gap:8, alignItems:"center" }}>
              <span style={{ fontSize:18 }}>🆕</span>
              <span style={{ fontFamily:F.body, fontSize:13, color:C.accentLight }}>Not yet released — no scores available</span>
            </div>
          ) : null}

          {/* Platforms */}
          {platforms.length > 0 && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontFamily:F.body, fontWeight:700, fontSize:11, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Available on</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {platforms.map(p=><PlatformBadge key={p} id={p} />)}
              </div>
            </div>
          )}

          {/* Friend ratings */}
          {friendRatings.length > 0 && (
            <div style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:14, padding:"12px 14px", marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={{ fontFamily:F.body, fontWeight:700, fontSize:11, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.06em" }}>Friends rated this</div>
                <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <span style={{ fontFamily:F.display, fontStyle:"italic", fontWeight:700, fontSize:18, color:C.gold }}>{avgFriendRating}</span>
                  <span style={{ fontSize:11, color:C.textMuted }}>/10</span>
                </div>
              </div>
              {friendRatings.map((f,i)=>(
                <div key={i} style={{ display:"flex", gap:10, alignItems:"center", marginBottom:i<friendRatings.length-1?8:0 }}>
                  <Avatar char={f.avatar} color={f.color} size={28} fontSize={11} />
                  <span style={{ fontFamily:F.body, fontWeight:600, fontSize:13, color:C.text, flex:1 }}>{f.user}</span>
                  <div style={{ display:"flex", gap:2, alignItems:"center" }}>
                    {[...Array(5)].map((_,j)=><span key={j} style={{ fontSize:11, color:j<Math.round(f.rating/2)?C.gold:C.border2 }}>★</span>)}
                    <span style={{ fontFamily:F.mono, fontSize:12, color:C.gold, marginLeft:4 }}>{f.rating}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CTA buttons */}
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            <button onClick={()=>{ if(!dbGame||!user) return; if(inLibrary){setLogDone(true);}else{setShowLogPicker(p=>!p);} }} style={{ flex:1, padding:"11px", borderRadius:12, background:inLibrary?`${C.green}22`:C.accent, border:inLibrary?`1px solid ${C.green}55`:"none", color:inLibrary?C.greenLight:"#fff", fontFamily:F.body, fontWeight:700, fontSize:13, cursor:"pointer" }}>
              {logDone?"✓ Added!":inLibrary?"✓ In Library":"+ Add to Library"}
            </button>
            <button onClick={async()=>{
                if (!dbGame || !user) return;
                if (inWishlist) return; // already wishlisted
                try {
                  await api.logGame({ gameId: dbGame.id, status: "wishlist" });
                  setInWishlist(true);
                } catch(e) { console.error(e); }
              }} style={{ flex:1, padding:"11px", borderRadius:12, background:inWishlist?`${C.gold}22`:C.surface2, border:`1px solid ${inWishlist?C.gold:C.border2}`, color:inWishlist?C.gold:C.textMuted, fontFamily:F.body, fontWeight:700, fontSize:13, cursor:"pointer" }}>
              {inWishlist ? "🔖 Wishlisted" : "🔖 Wishlist"}
            </button>
          </div>
          {showLogPicker && !inLibrary && (
            <div style={{ background:C.surface2, border:`1px solid ${C.border2}`, borderRadius:14, padding:14, marginBottom:16 }}>
              <div style={{ fontFamily:F.body, fontWeight:700, fontSize:13, color:C.text, marginBottom:10 }}>Which platform?</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
                {["ps5","xbox","steam","switch","pc"].map(p=>(
                  <button key={p} onClick={()=>setLogPlatform(p)} style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${logPlatform===p?C.accentLight:C.border2}`, background:logPlatform===p?C.accentSoft:C.surface3, color:logPlatform===p?C.accentLight:C.textMuted, fontFamily:F.body, fontWeight:700, fontSize:12, cursor:"pointer", textTransform:"uppercase" }}>{p}</button>
                ))}
              </div>
              <button onClick={async()=>{ try { await api.logGame({ gameId: dbGame.id, platform: logPlatform }); setInLibrary(true); setLogDone(true); setShowLogPicker(false); } catch(e){ console.error(e); } }} style={{ width:"100%", padding:10, borderRadius:10, background:C.accent, border:"none", color:"#fff", fontFamily:F.body, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                Confirm — Add to Library
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── HOME VIEW ────────────────────────────────────────────────────────────────
const GENRE_SECTIONS = [
  { label:"🗺️ Top Exploration Games", genre:"Metroidvania", emoji:"🗺️" },
  { label:"🎲 Top RPGs",              genre:"RPG",          emoji:"🎲" },
  { label:"⚔️ Top Action RPGs",       genre:"Action RPG",   emoji:"⚔️" },
  { label:"🎯 Top Roguelikes",        genre:"Roguelike",    emoji:"🎯" },
  { label:"💣 Top FPS Games",         genre:"FPS",          emoji:"💣" },
];

const HomeView = ({ onOpenFriend, onOpenStudio, onOpenInfluencer, onOpenGame }) => {
  const { user } = useAuth();
  const [trending,          setTrending]          = useState([]);
  const [friendReviews,     setFriendReviews]     = useState([]);
  const [studioUpdates,     setStudioUpdates]     = useState([]);
  const [recs,              setRecs]              = useState([]);
  const [popularFriends,    setPopularFriends]    = useState([]);
  const [hasFollowing,      setHasFollowing]      = useState(null); // null=loading
  const [genreGames,        setGenreGames]        = useState({});   // genre → games[]

  useEffect(() => {
    // Trending = top-rated games from the DB
    api.getGames({ limit: 6 }).then(games => {
      if (!games.length) return;
      setTrending(games.map((g, i) => ({
        title: g.title,
        cover: g.cover || "🎮",
        genre: g.genre || "",
        score: g.avgRating ? +g.avgRating.toFixed(1) : null,
        heat:  i === 0 ? "HOT" : g.avgRating ? `${+(g.avgRating / 10 * 100 - 88).toFixed(0)}%` : "New",
        bg:    "#0f1117",
      })));
    }).catch(() => {});

    // Check if user follows anyone
    if (user?.id) {
      api.getFollowing(user.id).then(following => {
        setHasFollowing(following.length > 0);
        if (following.length === 0) {
          // Load genre sections for solo users
          GENRE_SECTIONS.forEach(({ genre }) => {
            api.getGames({ genre, limit: 6 }).then(games => {
              if (games.length) setGenreGames(prev => ({
                ...prev,
                [genre]: games.map(g => ({ title: g.title, cover: g.cover || "🎮", score: g.avgRating ? +g.avgRating.toFixed(1) : null })),
              }));
            }).catch(() => {});
          });
        }
      }).catch(() => { setHasFollowing(false); });
    } else {
      setHasFollowing(false);
    }

    // Friend reviews + studio updates from the social feed
    api.getFeed({ limit: 40 }).then(rawItems => {
      const items = rawItems.map(adaptFeedItem);

      const reviews = items
        .filter(i => i.type === "friend_review")
        .slice(0, 3)
        .map(i => ({
          user: { name: i.user.name, avatar: i.user.avatar, color: i.user.color },
          game: i.game?.title || "", cover: i.game?.cover || "🎮",
          rating: i.rating, text: i.review || i.text || "",
          time: i.time, profileKey: i.user.name,
        }));
      if (reviews.length) setFriendReviews(reviews);

      const studios = items
        .filter(i => i.type === "studio_event")
        .slice(0, 3)
        .map(i => ({
          studio: { id: i.studio.id, name: i.studio.name, avatar: i.studio.avatar || "🏢", followers: i.studio.followers },
          text: i.event?.title || "",
          time: i.time,
        }));
      if (studios.length) setStudioUpdates(studios);
    }).catch(() => {});
  }, [user?.id]);

  const SH = ({ label, onMore }) => (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:7 }}>
      <span style={{ fontFamily:F.body, fontWeight:800, fontSize:11, color:C.text, letterSpacing:"0.02em", textTransform:"uppercase" }}>{label}</span>
      {onMore && <button onClick={onMore} style={{ background:"none", border:"none", cursor:"pointer", fontFamily:F.body, fontWeight:600, fontSize:10, color:C.accentLight, padding:0 }}>See all →</button>}
    </div>
  );

  const GameScrollRow = ({ games, size = 88 }) => (
    <div style={{ display:"flex", gap:7, overflowX:"auto", paddingBottom:2 }}>
      {games.map(g => (
        <div key={g.title} style={{ flexShrink:0, width:size, cursor:"pointer" }} onClick={()=>onOpenGame(g.title)}>
          <div style={{ width:size, height:Math.round(size*1.3), borderRadius:12, border:`1px solid ${C.border}`, position:"relative", overflow:"hidden" }}>
            <GameCover title={g.title} emoji={g.cover} emojiSize={30} imgUrl={g.backgroundImage} />
            <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 55%)" }} />
            {g.score && <div style={{ position:"absolute", bottom:5, right:5, fontFamily:F.mono, fontSize:9, color:"#fff", background:"rgba(0,0,0,0.55)", borderRadius:4, padding:"1px 5px" }}>{g.score}</div>}
          </div>
          <div style={{ marginTop:4 }}>
            <div style={{ fontFamily:F.body, fontWeight:700, fontSize:10, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{g.title}</div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* 1. Popular this week — bigger when no friends */}
      <div>
        <SH label="🔥 Popular this week" />
        <div style={{ display:"flex", gap:7, overflowX:"auto", paddingBottom:2 }}>
          {trending.map((g,i) => {
            const size = hasFollowing === false ? 110 : 80;
            const h    = hasFollowing === false ? 142 : 104;
            return (
              <div key={g.title} style={{ flexShrink:0, width:size, cursor:"pointer" }} onClick={()=>onOpenGame(g.title)}>
                <div style={{ width:size, height:h, borderRadius:12, border:`1px solid ${C.border}`, position:"relative", overflow:"hidden" }}>
                  <GameCover title={g.title} emoji={g.cover} emojiSize={hasFollowing===false?40:30} imgUrl={g.backgroundImage} />
                  <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 55%)" }} />
                  {i===0 && <div style={{ position:"absolute", top:5, left:5, background:C.gold, borderRadius:3, padding:"1px 5px", fontFamily:F.body, fontWeight:800, fontSize:8, color:"#000", letterSpacing:"0.04em" }}>HOT</div>}
                  {g.heat==="New" && <div style={{ position:"absolute", top:5, left:5, background:C.green, borderRadius:3, padding:"1px 5px", fontFamily:F.body, fontWeight:800, fontSize:8, color:"#fff", letterSpacing:"0.04em" }}>NEW</div>}
                  {g.score && <div style={{ position:"absolute", bottom:5, right:5, fontFamily:F.mono, fontSize:9, color:"#fff", background:"rgba(0,0,0,0.55)", borderRadius:4, padding:"1px 5px" }}>{g.score}</div>}
                </div>
                <div style={{ marginTop:4 }}>
                  <div style={{ fontFamily:F.body, fontWeight:700, fontSize:10, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{g.title}</div>
                  <div style={{ fontFamily:F.body, fontSize:9, color:g.heat==="New"?C.greenLight:C.textMuted, marginTop:1 }}>{g.heat}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2a. Genre sections (solo / no-friends mode) */}
      {hasFollowing === false && GENRE_SECTIONS.map(({ label, genre }) =>
        genreGames[genre]?.length ? (
          <div key={genre}>
            <SH label={label} />
            <GameScrollRow games={genreGames[genre]} size={88} />
          </div>
        ) : null
      )}

      {/* 2b. Friend-mode sections */}
      {hasFollowing ? <>
        {/* Friend reviews */}
        {friendReviews.length > 0 && <div>
          <SH label="⭐ Reviews from friends" />
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            {friendReviews.map((r,i) => (
              <div key={i} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"8px 10px", display:"flex", gap:8, alignItems:"center", cursor:"pointer" }} onClick={()=>onOpenFriend(r.profileKey)}>
                <Avatar char={r.user.avatar} color={r.user.color} size={26} fontSize={10} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                    <span style={{ fontFamily:F.body, fontWeight:700, fontSize:11, color:C.text }}>{r.user.name}</span>
                    <span style={{ fontSize:10 }}>{r.cover}</span>
                    <span style={{ fontFamily:F.body, fontSize:10, color:C.textMuted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{r.game}</span>
                  </div>
                  <div style={{ fontFamily:F.display, fontStyle:"italic", fontSize:11, color:C.textSub, marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>"{r.text}"</div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2, flexShrink:0 }}>
                  <div style={{ display:"flex", gap:1 }}>{[...Array(5)].map((_,j)=><span key={j} style={{ fontSize:8, color:j<Math.round(r.rating/2)?C.gold:C.border2 }}>★</span>)}</div>
                  <span style={{ fontFamily:F.mono, fontSize:9, color:C.textMuted }}>{r.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>}

        {/* New from studios */}
        {studioUpdates.length > 0 && <div>
          <SH label="🏢 New from your studios" />
          <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
            {studioUpdates.map((u,i) => (
              <div key={i} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"8px 10px", display:"flex", gap:8, alignItems:"center", cursor:"pointer" }} onClick={()=>onOpenStudio(u.studio.id)}>
                <span style={{ fontSize:18, flexShrink:0 }}>{u.studio.avatar}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:F.body, fontWeight:700, fontSize:10, color:C.accentLight }}>{u.studio.name}</div>
                  <div style={{ fontFamily:F.body, fontSize:10, color:C.textSub, marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.text}</div>
                </div>
                <span style={{ fontFamily:F.mono, fontSize:9, color:C.textMuted, flexShrink:0 }}>{u.time}</span>
              </div>
            ))}
          </div>
        </div>}

        {/* Popular with friends */}
        {popularFriends.length > 0 && <div>
          <SH label="👥 Popular with friends" />
          <div style={{ display:"flex", gap:7, overflowX:"auto", paddingBottom:2 }}>
          {popularFriends.map(g => (
            <div key={g.title} style={{ flexShrink:0, width:80, cursor:"pointer" }} onClick={()=>onOpenGame(g.title)}>
              <div style={{ width:80, height:100, borderRadius:12, border:`1px solid ${C.border}`, position:"relative", overflow:"hidden" }}>
                <GameCover title={g.title} emoji={g.cover} emojiSize={28} />
                <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 55%)" }} />
                <div style={{ position:"absolute", bottom:6, left:0, right:0, display:"flex", justifyContent:"center" }}>
                  {g.avatars.slice(0,3).map((av,j)=>(
                    <div key={j} style={{ width:14, height:14, borderRadius:"50%", background:`linear-gradient(135deg,${av.c}dd,${av.c}77)`, border:`1.5px solid rgba(0,0,0,0.4)`, marginLeft:j>0?-3:0, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:F.body, fontWeight:800, fontSize:6, color:"#fff" }}>{av.a}</div>
                  ))}
                </div>
              </div>
              <div style={{ marginTop:4 }}>
                <div style={{ fontFamily:F.body, fontWeight:700, fontSize:10, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{g.title}</div>
                <div style={{ fontFamily:F.body, fontSize:9, color:C.textMuted, marginTop:1 }}>{g.friends} friend{g.friends>1?"s":""}</div>
              </div>
            </div>
          ))}
        </div>
        </div>}
      </> : null}

    </div>
  );
};

// ─── FEED VIEW ────────────────────────────────────────────────────────────────
const FeedView = ({ onOpenFriend, onOpenStudio, onOpenInfluencer }) => {
  const [filter, setFilter] = useState("All");
  const filters = ["All","Priority","Friends","Creators","Studios","Releases"];

  const [feedItems, setFeedItems] = useState([]);
  useEffect(() => {
    api.getFeed({ limit: 40 })
      .then(items => { if (items.length) setFeedItems(items.map(adaptFeedItem)); })
      .catch(() => {}); // keep static fallback on error
  }, []);

  const filtered = feedItems.filter(i=>{
    if(filter==="All") return true;
    if(filter==="Priority") return i.priority===true;
    if(filter==="Friends") return i.type.startsWith("friend_");
    if(filter==="Creators") return i.type.startsWith("influencer_");
    if(filter==="Studios") return i.type==="studio_event";
    if(filter==="Releases") return i.type==="new_release";
    return true;
  });

  return (
    <div>
      <DiscordPanel onOpenFriend={onOpenFriend} />
      <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4, marginBottom:14 }}>
        {filters.map(f=><Pill key={f} active={filter===f} onClick={()=>setFilter(f)}>{f}</Pill>)}
      </div>
      {filtered.map(item=>{
        const [liked, setLiked] = useState(false);
        const numId = typeof item.id === "number" ? item.id : Math.abs(String(item.id).split("").reduce((h,c)=>h*31+c.charCodeAt(0),0));
        const base = numId*37+14;
        const wrap = c => <div key={item.id} style={{ background:C.surface, border:`1px solid ${item.priority?C.gold+"44":C.border}`, borderRadius:16, overflow:"hidden", marginBottom:12 }}>{c}</div>;

        const UserHeader = ({ user, sub, time }) => (
          <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:12, cursor:"pointer" }} onClick={()=>{ if(user.name) onOpenFriend(user.name); }}>
            <Avatar char={user.avatar} color={user.color} size={36} />
            <div style={{ flex:1 }}>
              <span style={{ fontFamily:F.body, fontWeight:700, fontSize:14, color:C.text }}>{user.name} </span>
              <span style={{ fontSize:13, color:C.textMuted, fontFamily:F.body }}>{sub}</span>
            </div>
            <div style={{ display:"flex", gap:5, alignItems:"center", flexShrink:0 }}>
              {item.priority && <span title="Priority friend" style={{ fontSize:14 }}>⭐</span>}
              <span style={{ fontSize:12, color:C.textMuted, fontFamily:F.mono }}>{time}</span>
            </div>
          </div>
        );

        const Actions = () => (
          <div style={{ display:"flex", gap:16, marginTop:12 }}>
            <button onClick={()=>setLiked(l=>!l)} style={{ background:"none", border:"none", cursor:"pointer", color:liked?"#f472b6":C.textMuted, fontSize:13, fontFamily:F.body, fontWeight:600 }}>{liked?"♥":"♡"} {liked?base+1:base}</button>
            <button style={{ background:"none", border:"none", cursor:"pointer", color:C.textMuted, fontSize:13, fontFamily:F.body, fontWeight:600 }}>💬 Reply</button>
            <button style={{ background:"none", border:"none", cursor:"pointer", color:C.textMuted, fontSize:13, fontFamily:F.body, fontWeight:600 }}>↗ Share</button>
          </div>
        );

        if(item.type==="influencer_live") {
          const inf = item.influencer;
          const liveStream = inf.streams.find(s=>s.live);
          return wrap(
            <div>
              <div style={{ background:`linear-gradient(90deg,${inf.avatarColor}22,${C.surface2})`, padding:"12px 14px", borderBottom:`1px solid ${C.border}`, display:"flex", gap:9, alignItems:"center", cursor:"pointer" }} onClick={()=>onOpenInfluencer(inf.id)}>
                <div style={{ width:36, height:36, borderRadius:"50%", background:`linear-gradient(145deg,${inf.avatarColor}dd,${inf.avatarColor}77)`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:F.body, fontWeight:800, fontSize:14, color:"#fff", flexShrink:0 }}>{inf.avatar}</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                    <span style={{ fontFamily:F.body, fontWeight:800, fontSize:14, color:C.text }}>{inf.name}</span>
                    <span style={{ fontSize:13, color:C.gold }}>✦</span>
                    <span style={{ fontSize:11, color:C.textMuted }}>→</span>
                  </div>
                  <span style={{ fontSize:11, color:C.textMuted, fontFamily:F.body }}>{inf.handle}</span>
                </div>
                <div style={{ display:"flex", gap:5, alignItems:"center", background:`${C.red}22`, border:`1px solid ${C.red}44`, borderRadius:8, padding:"4px 10px" }}>
                  <div style={{ width:7, height:7, borderRadius:"50%", background:C.red }} />
                  <span style={{ fontFamily:F.body, fontWeight:800, fontSize:11, color:C.red }}>LIVE</span>
                  {liveStream && <span style={{ fontSize:11, color:C.red, fontFamily:F.mono }}>{liveStream.viewers}</span>}
                </div>
              </div>
              <div style={{ padding:14 }}>
                {inf.currentGame && (
                  <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:10 }}>
                    <span style={{ fontSize:13, color:C.textMuted, fontFamily:F.body }}>Playing</span>
                    <span style={{ fontFamily:F.body, fontWeight:700, fontSize:13, color:C.text }}>{inf.currentGame}</span>
                    {inf.currentPlatform && <PlatformBadge id={inf.currentPlatform} small />}
                  </div>
                )}
                <p style={{ fontFamily:F.display, fontStyle:"italic", fontSize:14, color:C.textSub, lineHeight:1.65, marginBottom:12 }}>"{item.text}"</p>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {inf.streams.filter(s=>s.live).map(s=><StreamBtn key={s.platform} stream={s} />)}
                </div>
              </div>
            </div>
          );
        }

        if(item.type==="influencer_post") {
          const inf = item.influencer;
          return wrap(
            <div style={{ padding:16 }}>
              <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:12, cursor:"pointer" }} onClick={()=>onOpenInfluencer(inf.id)}>
                <div style={{ width:36, height:36, borderRadius:"50%", background:`linear-gradient(145deg,${inf.avatarColor}dd,${inf.avatarColor}77)`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:F.body, fontWeight:800, fontSize:14, color:"#fff", flexShrink:0 }}>{inf.avatar}</div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                    <span style={{ fontFamily:F.body, fontWeight:700, fontSize:14, color:C.text }}>{inf.name}</span>
                    <span style={{ fontSize:13, color:C.gold }}>✦</span>
                    <span style={{ fontSize:11, color:C.textMuted }}>→</span>
                  </div>
                  <span style={{ fontSize:11, color:C.textMuted, fontFamily:F.body }}>{inf.handle}</span>
                </div>
                <span style={{ fontSize:12, color:C.textMuted, fontFamily:F.mono }}>{item.time}</span>
              </div>
              <div style={{ background:C.surface2, borderRadius:12, padding:14, border:`1px solid ${C.border}` }}>
                {item.cover && <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
                  <div style={{ width:32, height:42, borderRadius:6, overflow:"hidden", flexShrink:0 }}><GameCover title={item.game} emoji={item.cover} emojiSize={16} /></div>
                  <span style={{ fontFamily:F.body, fontWeight:700, fontSize:14, color:C.text }}>{item.game}</span>
                  {item.rating && <StarRow rating={item.rating} />}
                </div>}
                <p style={{ fontFamily:F.display, fontStyle:"italic", fontSize:14, color:C.textSub, lineHeight:1.65 }}>"{item.text}"</p>
              </div>
              <Actions />
            </div>
          );
        }

        if(item.type==="friend_progress") return wrap(
          <div style={{ padding:16 }}>
            <UserHeader user={item.user} sub={`is ${item.game.progress}% through ${item.game.title}`} time={item.time} />
            <div style={{ background:C.surface2, borderRadius:12, padding:14, border:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", gap:12, alignItems:"center", marginBottom:10 }}>
                <div style={{ width:44, height:56, borderRadius:10, overflow:"hidden", flexShrink:0 }}><GameCover title={item.game.title} emoji={item.game.cover} emojiSize={24} /></div>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:F.body, fontWeight:800, fontSize:15, color:C.text }}>{item.game.title}</div>
                  <div style={{ display:"flex", gap:5, marginTop:3 }}><PlatformBadge id={item.game.platform} small /><span style={{ fontSize:11, color:C.textMuted, fontFamily:F.body }}>{item.game.hours}h</span></div>
                </div>
                <div style={{ fontFamily:F.display, fontWeight:700, fontSize:26, color:C.accentLight, fontStyle:"italic" }}>{item.game.progress}%</div>
              </div>
              <ProgressBar pct={item.game.progress} />
            </div>
            {item.blurb&&<p style={{ marginTop:12, fontFamily:F.display, fontStyle:"italic", fontSize:14, color:C.textSub, lineHeight:1.65 }}>"{item.blurb}"</p>}
            <Actions />
          </div>
        );

        if(item.type==="friend_achievement") return wrap(
          <div style={{ padding:16 }}>
            <UserHeader user={item.user} sub={`unlocked in ${item.game.title}`} time={item.time} />
            <div style={{ background:`${C.gold}0e`, border:`1px solid ${C.gold}33`, borderRadius:12, padding:14, display:"flex", gap:12, alignItems:"center" }}>
              <span style={{ fontSize:32 }}>{item.achievement.icon}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:F.body, fontWeight:800, fontSize:15, color:C.gold }}>{item.achievement.name}</div>
                <div style={{ display:"flex", gap:6, marginTop:6, alignItems:"center" }}><Tag color={C.gold}>{item.achievement.rarity}</Tag><span style={{ fontSize:11, color:C.textMuted, fontFamily:F.mono }}>{item.achievement.pct}%</span></div>
              </div>
            </div>
            {item.blurb&&<p style={{ marginTop:12, fontFamily:F.display, fontStyle:"italic", fontSize:14, color:C.textSub, lineHeight:1.65 }}>"{item.blurb}"</p>}
            <Actions />
          </div>
        );

        if(item.type==="friend_review") return wrap(
          <div style={{ padding:16 }}>
            <UserHeader user={item.user} sub={`reviewed ${item.game.title} ${item.game.cover}`} time={item.time} />
            <div style={{ background:C.surface2, borderRadius:12, padding:14, border:`1px solid ${C.border}` }}>
              <StarRow rating={item.rating} />
              <p style={{ marginTop:10, fontFamily:F.display, fontStyle:"italic", fontSize:14, color:C.textSub, lineHeight:1.65 }}>"{item.review}"</p>
            </div>
            <Actions />
          </div>
        );

        if(item.type==="studio_event") {
          const ev=item.event; const isS=ev.type==="livestream";
          return wrap(<>
            <div style={{ background:C.surface2, padding:"12px 14px", borderBottom:`1px solid ${C.border}`, display:"flex", gap:8, alignItems:"center", cursor:"pointer" }} onClick={()=>onOpenStudio(item.studio.id)}>
              <span style={{ fontSize:20 }}>{item.studio.avatar}</span>
              <div style={{ flex:1 }}><div style={{ display:"flex", gap:5 }}><span style={{ fontFamily:F.body, fontWeight:700, fontSize:14, color:C.text }}>{item.studio.name}</span><span style={{ fontSize:11, color:C.accentLight }}>✓</span><span style={{ fontSize:11, color:C.textMuted }}>→</span></div><span style={{ fontSize:11, color:C.textMuted, fontFamily:F.body }}>{item.studio.handle}</span></div>
              <Tag color={isS?C.red:C.accentLight}>{isS?"🔴 Live":"📢 News"}</Tag>
            </div>
            <div style={{ padding:16 }}>
              <div style={{ fontSize:26, marginBottom:8 }}>{ev.image}</div>
              <div style={{ fontFamily:F.body, fontWeight:800, fontSize:16, color:C.text, marginBottom:6 }}>{ev.title}</div>
              <p style={{ fontSize:14, color:C.textSub, lineHeight:1.6, fontFamily:F.body, marginBottom:12 }}>{ev.desc}</p>
              <button style={{ padding:"8px 16px", borderRadius:10, background:isS?`${C.red}22`:C.accentSoft, border:`1px solid ${isS?C.red:C.accentLight}55`, color:isS?C.red:C.accentLight, fontFamily:F.body, fontWeight:700, fontSize:13, cursor:"pointer" }}>{isS?"Set Reminder":"Read More →"}</button>
            </div>
          </>);
        }

        if(item.type==="new_release") {
          const g=item.game;
          return wrap(<>
            <div style={{ background:"linear-gradient(90deg,#0a1c0f,#0d2415)", padding:"10px 14px", borderBottom:"1px solid #1a3d24", display:"flex", gap:8, alignItems:"center", cursor:"pointer" }} onClick={()=>onOpenStudio(item.studio.id)}>
              <span style={{ fontSize:18 }}>{item.studio.avatar}</span>
              <span style={{ fontFamily:F.body, fontWeight:700, fontSize:13, color:C.greenLight }}>{item.studio.name}</span>
              <Tag color={C.greenLight}>New Release</Tag>
            </div>
            <div style={{ padding:"14px 16px", display:"flex", gap:14, alignItems:"center" }}>
              <div style={{ width:60, height:78, borderRadius:14, border:`1px solid ${C.border2}`, overflow:"hidden", flexShrink:0 }}><GameCover title={g.title} emoji={g.cover} emojiSize={26} /></div>
              <div style={{ flex:1 }}><div style={{ fontFamily:F.body, fontWeight:800, fontSize:18, color:C.text }}>{g.title}</div><div style={{ fontSize:13, color:C.textMuted, fontFamily:F.body }}>{g.studio} · {g.genre}</div><div style={{ fontSize:13, color:C.greenLight, fontFamily:F.mono, marginTop:4 }}>Out {g.releaseDate}</div></div>
            </div>
            <div style={{ padding:"0 14px 14px", display:"flex", gap:8 }}>
              <button style={{ flex:1, padding:9, borderRadius:10, background:`${C.green}22`, border:`1px solid ${C.green}55`, color:C.greenLight, fontFamily:F.body, fontWeight:700, fontSize:12, cursor:"pointer" }}>🔔 Notify Me</button>
              <button style={{ flex:1, padding:9, borderRadius:10, background:C.surface2, border:`1px solid ${C.border2}`, color:C.textMuted, fontFamily:F.body, fontWeight:700, fontSize:12, cursor:"pointer" }}>View Game</button>
            </div>
          </>);
        }
        return null;
      })}
    </div>
  );
};

// ─── DISCOVER VIEW ────────────────────────────────────────────────────────────
const DiscoverView = ({ onOpenStudio, onOpenInfluencer }) => {
  const [tab, setTab] = useState("creators");
  const [studioList,  setStudioList]  = useState([]);
  const [follows,     setFollows]     = useState({});
  const [influencers, setInfluencers] = useState([]);
  const [infFollows,  setInfFollows]  = useState({});
  const [gameList,    setGameList]    = useState([]);
  const genres = ["All","RPG","Roguelike","Metroidvania","Action RPG"];
  const [genre, setGenre] = useState("All");

  useEffect(() => {
    // Load studios from API
    api.getStudios().then(studios => {
      if (!studios.length) return;
      setStudioList(studios.map(s => ({
        id: s.id, name: s.name, handle: s.handle, avatar: s.avatar || "🏢",
        followers: s._count?.followers != null ? (s._count.followers >= 1000 ? `${(s._count.followers/1000).toFixed(1)}K` : String(s._count.followers)) : "0",
        verified: true, following: s.following,
      })));
      setFollows(studios.reduce((a,s)=>({...a,[s.id]:s.following}),{}));
    }).catch(() => {});

    // Load games from API
    api.getGames({ limit: 50 }).then(games => {
      if (!games.length) return;
      setGameList(games.map(g => ({
        id: g.id, title: g.title, genre: g.genre || "", cover: g.cover || "🎮",
        rating: g.avgRating ? +g.avgRating.toFixed(1) : 0,
        reviews: g.reviewCount || 0, year: g.year,
        studio: g.studios?.[0]?.studio?.name || "",
        studioId: g.studios?.[0]?.studioId || null,
        platform: "steam", progress: 0, hours: 0,
        trophies: { earned: 0, total: 0, platinum: false }, coop: g.coop || false,
      })));
    }).catch(() => {});

    // Load influencers from API
    api.getUsers({ influencer: true }).then(users => {
      if (!users.length) return;
      setInfluencers(users.map(u => ({
        id: u.username, name: u.username, handle: u.handle,
        avatar: u.avatar || "?", avatarColor: u.avatarColor || C.accent,
        verified: u.isVerified, isInfluencer: true,
        bio: u.bio || "", country: u.country || "", age: u.age || "",
        followers: u._count?.followers != null ? (u._count.followers >= 1000000 ? `${(u._count.followers/1000000).toFixed(1)}M` : u._count.followers >= 1000 ? `${(u._count.followers/1000).toFixed(1)}K` : String(u._count.followers)) : "0",
        following: u._count?.following || 0,
        badges: (u.badges || []).map(b => b.badgeId || b.badge?.id),
        streams: u.streams || [],
        currentGame: u.currentGame, currentPlatform: u.currentPlatform, liveNow: u.liveNow,
        topGames: [], recentActivity: [],
        realName: "", // not stored in DB
      })));
      setInfFollows(users.reduce((a,u)=>({...a,[u.username]:false}),{}));
    }).catch(() => {});
  }, []);

  const toggleStudioFollow = async (studioId) => {
    const current = follows[studioId];
    setFollows(f => ({...f, [studioId]: !current}));
    try {
      if (current) await api.unfollowStudio(studioId);
      else         await api.followStudio(studioId);
    } catch { setFollows(f => ({...f, [studioId]: current})); } // revert on error
  };

  return (
    <div>
      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {["creators","studios","games"].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{ flex:1, padding:"9px 4px", borderRadius:10, background:tab===t?C.accentSoft:C.surface, border:`1px solid ${tab===t?C.accentLight:C.border}`, color:tab===t?C.accentLight:C.textMuted, fontFamily:F.body, fontWeight:700, fontSize:13, cursor:"pointer" }}>
            {t[0].toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      {tab==="creators" && (
        <div>
          <SectionLabel>Gaming Influencers</SectionLabel>
          {influencers.map(inf=>(
            <div key={inf.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"12px 14px", display:"flex", gap:10, alignItems:"center", marginBottom:8, cursor:"pointer" }} onClick={()=>onOpenInfluencer(inf.id)}>
              <div style={{ position:"relative", flexShrink:0 }}>
                <div style={{ width:44, height:44, borderRadius:"50%", background:`linear-gradient(145deg,${inf.avatarColor}dd,${inf.avatarColor}77)`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:F.body, fontWeight:800, fontSize:17, color:"#fff" }}>{inf.avatar}</div>
                {inf.liveNow && <div style={{ position:"absolute", bottom:-1, right:-1, width:12, height:12, borderRadius:"50%", background:C.red, border:`2px solid ${C.surface}` }} />}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                  <span style={{ fontFamily:F.body, fontWeight:700, fontSize:14, color:C.text }}>{inf.name}</span>
                  <span style={{ fontSize:12, color:C.gold }}>✦</span>
                  {inf.liveNow && <Tag color={C.red}>LIVE</Tag>}
                </div>
                <div style={{ fontSize:11, color:C.textMuted, fontFamily:F.body }}>{inf.handle} · {inf.followers} followers</div>
                {inf.liveNow && inf.currentGame && <div style={{ fontSize:11, color:C.greenLight, fontFamily:F.body, marginTop:2 }}>Playing {inf.currentGame}</div>}
              </div>
              <button onClick={e=>{e.stopPropagation();setInfFollows(f=>({...f,[inf.id]:!f[inf.id]}));}} style={{ padding:"6px 14px", borderRadius:99, background:infFollows[inf.id]?C.surface3:C.accentSoft, border:`1px solid ${infFollows[inf.id]?C.border2:C.accentLight}`, color:infFollows[inf.id]?C.textMuted:C.accentLight, fontFamily:F.body, fontWeight:700, fontSize:12, cursor:"pointer" }}>
                {infFollows[inf.id]?"Following":"Follow"}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab==="studios" && (
        <div>
          <SectionLabel>Game Studios</SectionLabel>
          {studioList.map(s=>(
            <div key={s.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"12px 14px", display:"flex", gap:10, alignItems:"center", marginBottom:8, cursor:"pointer" }} onClick={()=>onOpenStudio(s.id)}>
              <span style={{ fontSize:26 }}>{s.avatar}</span>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", gap:5, alignItems:"center" }}><span style={{ fontFamily:F.body, fontWeight:700, fontSize:14, color:C.text }}>{s.name}</span><span style={{ fontSize:11, color:C.accentLight }}>✓</span><span style={{ fontSize:11, color:C.textMuted }}>→</span></div>
                <div style={{ fontSize:12, color:C.textMuted, fontFamily:F.body }}>{s.handle} · {s.followers}</div>
              </div>
              <button onClick={e=>{e.stopPropagation();toggleStudioFollow(s.id);}} style={{ padding:"7px 16px", borderRadius:99, background:follows[s.id]?C.surface3:C.accentSoft, border:`1px solid ${follows[s.id]?C.border2:C.accentLight}`, color:follows[s.id]?C.textMuted:C.accentLight, fontFamily:F.body, fontWeight:700, fontSize:12, cursor:"pointer" }}>
                {follows[s.id]?"Following":"Follow"}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab==="games" && (
        <div>
          <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4, marginBottom:12 }}>
            {genres.map(g=><Pill key={g} active={genre===g} onClick={()=>setGenre(g)}>{g}</Pill>)}
          </div>
          {gameList.filter(g=>genre==="All"||g.genre===genre).map((g,i)=>(
            <div key={g.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:14, display:"flex", gap:12, alignItems:"center", marginBottom:8 }}>
              <span style={{ fontFamily:F.mono, fontSize:16, color:i===0?C.gold:C.border2, width:24 }}>#{i+1}</span>
              <div style={{ width:38, height:50, borderRadius:8, overflow:"hidden", flexShrink:0 }}><GameCover title={g.title} emoji={g.cover} emojiSize={20} /></div>
              <div style={{ flex:1 }}><div style={{ fontFamily:F.body, fontWeight:700, fontSize:15, color:C.text }}>{g.title}</div><StarRow rating={g.rating} /></div>
              <Tag>{g.genre}</Tag>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── STATS TAB (embedded in Profile) ─────────────────────────────────────────
const StatsTab = () => {
  const [year, setYear] = useState("2025");
  const d = WRAPPED_DATA[year];

  const maxH = Math.max(...d.journey.map(j=>j.hours));

  return (
    <div>
      {/* Year picker */}
      <div style={{ display:"flex", gap:6, marginBottom:16, overflowX:"auto" }}>
        {WRAPPED_YEARS.map(y=>(
          <button key={y} onClick={()=>setYear(y)} style={{ flexShrink:0, padding:"6px 14px", borderRadius:99, background:year===y?C.accent:C.surface2, border:`1px solid ${year===y?C.accent:C.border2}`, color:year===y?"#fff":C.textMuted, fontFamily:F.body, fontWeight:700, fontSize:12, cursor:"pointer" }}>{y}</button>
        ))}
      </div>

      {/* Big headline numbers */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:6, marginBottom:14 }}>
        {[
          {v:`${d.totalHours}h`, l:"Played",      col:C.accentLight},
          {v:d.totalGames,       l:"Games",        col:C.text},
          {v:d.completions,      l:"Completed",    col:C.greenLight},
          {v:d.platinums,        l:"Platinums",    col:C.gold},
        ].map(s=>(
          <div key={s.l} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"10px 6px", textAlign:"center" }}>
            <div style={{ fontFamily:F.display, fontStyle:"italic", fontWeight:700, fontSize:18, color:s.col, lineHeight:1 }}>{s.v}</div>
            <div style={{ fontFamily:F.body, fontSize:10, color:C.textMuted, marginTop:3 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Activity bar chart */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"12px 14px", marginBottom:10 }}>
        <div style={{ fontFamily:F.body, fontWeight:700, fontSize:11, color:C.textMuted, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.06em" }}>
          {year==="All Time"?"Activity by year":"Monthly activity"} · peak {d.topMonth.name}
        </div>
        <div style={{ display:"flex", gap:3, alignItems:"flex-end", height:64 }}>
          {d.journey.map((j,i)=>(
            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
              <div style={{ width:"100%", borderRadius:"3px 3px 0 0", background:j.hours===maxH?C.accentLight:`${C.accentLight}40`, minHeight:2, height:j.hours===0?2:Math.max((j.hours/maxH)*52,3) }} />
              <div style={{ fontFamily:F.body, fontSize:8, color:C.textMuted, textAlign:"center" }}>{j.month.slice(0,3)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Two-col: top game + top genre */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:12 }}>
          <div style={{ fontFamily:F.body, fontWeight:700, fontSize:10, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Top game</div>
          <div style={{ fontSize:28, marginBottom:4 }}>{d.topGame.cover}</div>
          <div style={{ fontFamily:F.body, fontWeight:800, fontSize:13, color:C.text, lineHeight:1.2 }}>{d.topGame.title}</div>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.accentLight, marginTop:3 }}>{d.topGame.hours}h</div>
        </div>
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:12 }}>
          <div style={{ fontFamily:F.body, fontWeight:700, fontSize:10, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Top genre</div>
          <div style={{ fontSize:28, marginBottom:4 }}>{d.topGenre.icon}</div>
          <div style={{ fontFamily:F.body, fontWeight:800, fontSize:13, color:C.text, lineHeight:1.2 }}>{d.topGenre.name}</div>
          <div style={{ fontFamily:F.mono, fontSize:11, color:C.accentLight, marginTop:3 }}>{d.topGenre.pct}% of time</div>
        </div>
      </div>

      {/* Genre breakdown */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"12px 14px", marginBottom:10 }}>
        <div style={{ fontFamily:F.body, fontWeight:700, fontSize:11, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>Genre breakdown</div>
        {d.genreBreakdown.map(g=>(
          <div key={g.genre} style={{ marginBottom:7 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
              <span style={{ fontFamily:F.body, fontWeight:600, fontSize:12, color:C.textSub }}>{g.genre}</span>
              <span style={{ fontFamily:F.mono, fontSize:11, color:C.textMuted }}>{g.pct}%</span>
            </div>
            <div style={{ height:5, borderRadius:99, background:C.surface3, overflow:"hidden" }}>
              <div style={{ width:`${g.pct}%`, height:"100%", borderRadius:99, background:g.color }} />
            </div>
          </div>
        ))}
      </div>

      {/* Platform split */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"12px 14px", marginBottom:10 }}>
        <div style={{ fontFamily:F.body, fontWeight:700, fontSize:11, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:10 }}>Platform split</div>
        {d.platformBreakdown.map(p=>{
          const cols={ps5:"#0070d1",xbox:"#107c10",steam:"#66c0f4"};
          const names={ps5:"PlayStation 5",xbox:"Xbox",steam:"Steam"};
          return (
            <div key={p.id} style={{ marginBottom:7 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                <span style={{ fontFamily:F.body, fontWeight:600, fontSize:12, color:C.textSub }}>{names[p.id]}</span>
                <span style={{ fontFamily:F.mono, fontSize:11, color:C.textMuted }}>{p.hours}h · {p.pct}%</span>
              </div>
              <div style={{ height:5, borderRadius:99, background:C.surface3, overflow:"hidden" }}>
                <div style={{ width:`${p.pct}%`, height:"100%", borderRadius:99, background:cols[p.id] }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Highlights row */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:12 }}>
          <div style={{ fontFamily:F.body, fontWeight:700, fontSize:10, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>Longest streak</div>
          <div style={{ fontFamily:F.display, fontStyle:"italic", fontWeight:700, fontSize:26, color:C.orange, lineHeight:1 }}>{d.longestStreak.days}<span style={{ fontSize:14, color:C.textMuted }}> days</span></div>
          <div style={{ fontFamily:F.body, fontSize:11, color:C.textMuted, marginTop:4 }}>{d.longestStreak.cover} {d.longestStreak.game}</div>
        </div>
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:12 }}>
          <div style={{ fontFamily:F.body, fontWeight:700, fontSize:10, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:6 }}>Late nights</div>
          <div style={{ fontFamily:F.display, fontStyle:"italic", fontWeight:700, fontSize:26, color:"#818cf8", lineHeight:1 }}>{d.lateNight.pct}<span style={{ fontSize:14, color:C.textMuted }}>%</span></div>
          <div style={{ fontFamily:F.body, fontSize:11, color:C.textMuted, marginTop:4 }}>{d.lateNight.hour}</div>
        </div>
      </div>

      {/* Rarest achievement */}
      <div style={{ background:`${C.gold}0d`, border:`1px solid ${C.gold}33`, borderRadius:14, padding:"12px 14px", marginBottom:10, display:"flex", gap:12, alignItems:"center" }}>
        <span style={{ fontSize:28 }}>{d.rarest.icon}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:F.body, fontWeight:700, fontSize:10, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.06em" }}>Rarest achievement</div>
          <div style={{ fontFamily:F.body, fontWeight:800, fontSize:14, color:C.gold, marginTop:2 }}>{d.rarest.name}</div>
          <div style={{ fontFamily:F.body, fontSize:11, color:C.textMuted, marginTop:1 }}>{d.rarest.game}</div>
        </div>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <div style={{ fontFamily:F.mono, fontWeight:600, fontSize:16, color:C.gold }}>{d.rarest.pct}%</div>
          <div style={{ fontFamily:F.body, fontSize:10, color:C.textMuted }}>of players</div>
        </div>
      </div>

      {/* Gamer type */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"12px 14px" }}>
        <div style={{ fontFamily:F.body, fontWeight:700, fontSize:10, color:C.textMuted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Gamer type · {year}</div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <span style={{ fontSize:28 }}>{d.personalityType.icon}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:F.body, fontWeight:800, fontSize:14, color:C.text }}>{d.personalityType.label}</div>
            <div style={{ fontFamily:F.body, fontSize:11, color:C.textMuted, marginTop:3, lineHeight:1.5 }}>{d.personalityType.desc}</div>
          </div>
        </div>
        <div style={{ marginTop:10, background:C.surface2, borderRadius:10, padding:"8px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontFamily:F.body, fontSize:11, color:C.textMuted }}>{d.comparedToFriends.label}</span>
          <span style={{ fontFamily:F.display, fontStyle:"italic", fontWeight:700, fontSize:16, color:C.gold }}>Top {100-d.comparedToFriends.percentile}%</span>
        </div>
      </div>
    </div>
  );
};

// ─── PROFILE VIEW ─────────────────────────────────────────────────────────────
// ─── PLATFORM CONNECTIONS ─────────────────────────────────────────────────────
function PlatformConnections({ user, onRefresh }) {
  const [editing, setEditing] = useState(null); // "ps5" | "xbox" | null
  const [psnVal,  setPsnVal]  = useState(user?.psnHandle    || "");
  const [xboxVal, setXboxVal] = useState(user?.xboxGamertag || "");
  const [saving,  setSaving]  = useState(false);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [steamLoading,   setSteamLoading]   = useState(false);
  const [steamGames,     setSteamGames]     = useState(null); // null=not loaded, []=loaded
  const [importingGame,  setImportingGame]  = useState(null);

  const saveHandle = async (platform) => {
    setSaving(true);
    try {
      if (platform === "ps5")  await api.updateMe({ psnHandle:    psnVal.trim() || null });
      if (platform === "xbox") await api.updateMe({ xboxGamertag: xboxVal.trim() || null });
      await onRefresh();
      setEditing(null);
    } catch(_) {}
    setSaving(false);
  };

  const connectDiscord = async () => {
    setDiscordLoading(true);
    try { const { url } = await api.getDiscordAuthUrl(); window.location.href = url; }
    catch(_) { setDiscordLoading(false); }
  };

  const disconnectDiscord = async () => {
    try { await api.disconnectDiscord(); await onRefresh(); } catch(_) {}
  };

  const connectSteam = async () => {
    setSteamLoading(true);
    try { const { url } = await api.getSteamAuthUrl(); window.location.href = url; }
    catch(_) { setSteamLoading(false); }
  };

  const disconnectSteam = async () => {
    try { await api.disconnectSteam(); await onRefresh(); setSteamGames(null); } catch(_) {}
  };

  const loadSteamGames = async () => {
    try { const data = await api.getSteamGames(); setSteamGames(data.games || []); }
    catch(_) { setSteamGames([]); }
  };

  const importSteamGame = async (g) => {
    setImportingGame(g.appId);
    try {
      // Try to find the game in the DB by title, then log it
      const results = await api.getGames({ q: g.title, limit: 1 });
      if (results.length) {
        await api.logGame({ gameId: results[0].id, platform: "steam", hours: g.hoursTotal });
      }
    } catch(_) {}
    setImportingGame(null);
  };

  const inputStyle = { flex:1, background:C.surface3, border:`1px solid ${C.border2}`, borderRadius:8, padding:"6px 10px", color:C.text, fontFamily:F.body, fontSize:13, outline:"none" };

  const rows = [
    { id:"ps5",    icon:"🎮", name:"PlayStation",  connected:!!user?.psnHandle,    detail:user?.psnHandle    || null },
    { id:"xbox",   icon:"🟢", name:"Xbox",          connected:!!user?.xboxGamertag, detail:user?.xboxGamertag || null },
    { id:"discord",icon:"🎧", name:"Discord",       connected:!!user?.discordId,    detail:user?.discordUsername || null },
    { id:"steam",  icon:"🖥️", name:"Steam",         connected:!!user?.steamId, detail:user?.steamUsername || null },
  ];

  return (
    <div style={{ background:C.surface, borderRadius:16, border:`1px solid ${C.border}`, padding:14, marginBottom:14 }}>
      <SectionLabel>Connected Platforms</SectionLabel>
      {rows.map(p => (
        <div key={p.id} style={{ marginBottom: editing === p.id ? 12 : 8 }}>
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <span style={{ fontSize:18 }}>{p.icon}</span>
            <div style={{ flex:1 }}>
              <span style={{ fontFamily:F.body, fontWeight:600, fontSize:13, color:p.connected?C.text:C.textMuted }}>{p.name}</span>
              {p.detail && <span style={{ fontFamily:F.mono, fontSize:11, color:C.textMuted, marginLeft:7 }}>{p.detail}</span>}
            </div>
            {p.id === "discord" ? (
              p.connected
                ? <button onClick={disconnectDiscord} style={{ padding:"5px 12px", borderRadius:8, fontSize:12, fontFamily:F.body, fontWeight:700, cursor:"pointer", background:`${C.green}18`, border:`1px solid ${C.green}44`, color:C.greenLight }}>✓ Connected</button>
                : <button onClick={connectDiscord} disabled={discordLoading} style={{ padding:"5px 12px", borderRadius:8, fontSize:12, fontFamily:F.body, fontWeight:700, cursor:"pointer", background:C.discordSoft, border:`1px solid ${C.discord}55`, color:"#7983f5", opacity:discordLoading?0.6:1 }}>{discordLoading?"…":"Connect"}</button>
            ) : p.id === "steam" ? (
              p.connected
                ? <div style={{ display:"flex", gap:6 }}>
                    <button onClick={()=>steamGames===null?loadSteamGames():setSteamGames(null)} style={{ padding:"5px 10px", borderRadius:8, fontSize:12, fontFamily:F.body, fontWeight:700, cursor:"pointer", background:`${C.green}18`, border:`1px solid ${C.green}44`, color:C.greenLight }}>✓ Library</button>
                    <button onClick={disconnectSteam} style={{ padding:"5px 8px", borderRadius:8, fontSize:11, fontFamily:F.body, fontWeight:600, cursor:"pointer", background:C.surface2, border:`1px solid ${C.border2}`, color:C.textMuted }}>✕</button>
                  </div>
                : <button onClick={connectSteam} disabled={steamLoading} style={{ padding:"5px 12px", borderRadius:8, fontSize:12, fontFamily:F.body, fontWeight:700, cursor:"pointer", background:"#1b2838", border:"1px solid #66c0f455", color:"#66c0f4", opacity:steamLoading?0.6:1 }}>{steamLoading?"…":"Connect"}</button>
            ) : (
              <button onClick={()=>setEditing(editing===p.id?null:p.id)} style={{ padding:"5px 12px", borderRadius:8, fontSize:12, fontFamily:F.body, fontWeight:700, cursor:"pointer", background:p.connected?`${C.green}18`:C.surface2, border:`1px solid ${p.connected?C.green+"44":C.border2}`, color:p.connected?C.greenLight:C.textMuted }}>
                {p.connected ? "✓ Edit" : "Connect"}
              </button>
            )}
          </div>
          {editing === p.id && (
            <div style={{ display:"flex", gap:8, marginTop:8, paddingLeft:28 }}>
              <input
                value={p.id==="ps5"?psnVal:xboxVal}
                onChange={e=>p.id==="ps5"?setPsnVal(e.target.value):setXboxVal(e.target.value)}
                placeholder={p.id==="ps5"?"PSN ID":"Xbox Gamertag"}
                style={inputStyle}
                onKeyDown={e=>e.key==="Enter"&&saveHandle(p.id)}
              />
              <button onClick={()=>saveHandle(p.id)} disabled={saving} style={{ padding:"6px 14px", borderRadius:8, background:C.accent, border:"none", color:"#fff", fontFamily:F.body, fontWeight:700, fontSize:12, cursor:"pointer", opacity:saving?0.6:1 }}>{saving?"…":"Save"}</button>
              <button onClick={()=>setEditing(null)} style={{ padding:"6px 10px", borderRadius:8, background:C.surface2, border:`1px solid ${C.border2}`, color:C.textMuted, fontFamily:F.body, fontWeight:600, fontSize:12, cursor:"pointer" }}>✕</button>
            </div>
          )}
        </div>
      ))}

      {/* Steam library panel */}
      {steamGames !== null && (
        <div style={{ marginTop:10, borderTop:`1px solid ${C.border}`, paddingTop:10 }}>
          <div style={{ fontFamily:F.body, fontWeight:700, fontSize:11, color:"#66c0f4", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>
            🖥️ Steam Library {steamGames.length > 0 && `· ${steamGames.length} games`}
          </div>
          {steamGames.length === 0
            ? <div style={{ fontFamily:F.body, fontSize:12, color:C.textMuted }}>No games found — make sure your Steam profile is set to public.</div>
            : <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:260, overflowY:"auto" }}>
                {steamGames.slice(0,50).map(g => (
                  <div key={g.appId} style={{ display:"flex", gap:10, alignItems:"center" }}>
                    <img src={g.headerImage} alt={g.title} style={{ width:60, height:28, borderRadius:4, objectFit:"cover", background:C.surface3 }} onError={e=>e.target.style.display="none"} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontFamily:F.body, fontWeight:600, fontSize:12, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{g.title}</div>
                      <div style={{ fontFamily:F.mono, fontSize:10, color:C.textMuted }}>{g.hoursTotal}h played</div>
                    </div>
                    <button onClick={()=>importSteamGame(g)} disabled={importingGame===g.appId} style={{ padding:"4px 10px", borderRadius:7, fontSize:11, fontFamily:F.body, fontWeight:700, cursor:"pointer", background:C.accentSoft, border:`1px solid ${C.accent}55`, color:C.accentLight, flexShrink:0, opacity:importingGame===g.appId?0.5:1 }}>
                      {importingGame===g.appId?"…":"+ Log"}
                    </button>
                  </div>
                ))}
              </div>
          }
        </div>
      )}
    </div>
  );
}

const ProfileView = ({ onOpenFriend, onOpenStudio }) => {
  const [tab, setTab] = useState("games");
  const [showEdit, setShowEdit] = useState(false);
  const { user, refreshUser } = useAuth();

  // Map API user → profile shape the edit sheet expects
  const [userProfile, setUserProfile] = useState({
    name:          user?.username    || "me",
    handle:        user?.handle      || "@me",
    bio:           user?.bio         || "",
    country:       user?.country     || "",
    age:           user?.age         || "",
    avatarChar:    user?.avatar      || "?",
    avatarImg:     null,
    isPublic:      user?.isPublic    ?? true,
    allowFollowers:user?.isPublic    ?? true,
  });

  // Keep profile in sync when auth user changes
  useEffect(() => {
    if (user) setUserProfile({
      name:          user.username,
      handle:        user.handle,
      bio:           user.bio         || "",
      country:       user.country     || "",
      age:           user.age         || "",
      avatarChar:    user.avatar      || user.username?.[0]?.toUpperCase() || "?",
      avatarImg:     null,
      isPublic:      user.isPublic    ?? true,
      allowFollowers:user.isPublic    ?? true,
    });
  }, [user?.id]);

  const handleSave = async (form, isPublic, allowFollowers) => {
    setUserProfile(p => ({...p, ...form, isPublic, allowFollowers}));
    try {
      await api.updateMe({
        bio:      form.bio     || null,
        country:  form.country || null,
        age:      form.age     ? parseInt(form.age) : null,
        isPublic,
      });
      await refreshUser();
    } catch (e) { console.error("Profile save failed:", e.message); }
  };

  const PLATFORMS = [
    {id:"ps5",   name:"PlayStation 5",icon:"🎮",connected:!!user?.psnHandle   },
    {id:"xbox",  name:"Xbox",         icon:"🟢",connected:!!user?.xboxGamertag},
    {id:"steam", name:"Steam",        icon:"🖥️",connected:!!user?.steamId     },
    {id:"switch",name:"Switch",       icon:"🔴",connected:false               },
    {id:"discord",name:"Discord",     icon:"🎧",connected:!!user?.discordId   },
  ];

  const ACHIEVEMENTS = [
    {id:1,name:"Elden Lord",icon:"👑",rarity:"Ultra Rare",pct:2.1},
    {id:2,name:"Dragonslayer",icon:"🐉",rarity:"Rare",pct:8.4},
    {id:4,name:"True Ending",icon:"✨",rarity:"Rare",pct:11.2},
  ];

  const [myGames,        setMyGames]        = useState([]);
  const [priorityFriends,setPriorityFriends] = useState([]);

  useEffect(() => {
    api.getMyLibrary().then(logs => {
      if (logs.length) setMyGames(logs.map(adaptLog));
    }).catch(() => {});
    if (user?.id) {
      api.getFollowing(user.id).then(following => {
        const fav = following.filter(f => f.favorited);
        if (!fav.length) return;
        setPriorityFriends(fav.map(f => ({
          name: f.username, handle: f.handle, avatar: f.avatar || "?",
          avatarColor: f.avatarColor || C.accent, status: f.status || "offline",
          statusGame: f.currentGame, statusPlatform: f.currentPlatform, isFavorited: true,
        })));
      }).catch(() => {});
    }
  }, [user?.id]);

  return (
    <div>
      {/* Profile header */}
      <div style={{ background:C.surface, borderRadius:20, border:`1px solid ${C.border}`, overflow:"hidden", marginBottom:14 }}>
        <div style={{ height:70, background:`linear-gradient(120deg,${C.accent}55 0%,${C.surface2} 60%)` }} />
        <div style={{ padding:"0 16px 16px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginTop:-28, marginBottom:10 }}>
            <div style={{ position:"relative" }}>
              <div style={{ width:56, height:56, borderRadius:"50%", background:`linear-gradient(145deg,${C.accent},#4338ca)`, border:`3px solid ${C.surface}`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:F.body, fontWeight:800, fontSize:20, color:"#fff", overflow:"hidden" }}>
                {userProfile.avatarImg ? <img src={userProfile.avatarImg} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : userProfile.avatarChar}
              </div>
              {!userProfile.isPublic && <div style={{ position:"absolute", bottom:-2, right:-2, width:18, height:18, borderRadius:"50%", background:C.surface3, border:`2px solid ${C.surface}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9 }}>🔒</div>}
            </div>
            <button onClick={()=>setShowEdit(true)} style={{ padding:"7px 14px", borderRadius:99, background:C.surface2, border:`1px solid ${C.border2}`, color:C.textMuted, fontFamily:F.body, fontWeight:700, fontSize:12, cursor:"pointer" }}>Edit Profile</button>
          </div>
          <div style={{ fontFamily:F.body, fontWeight:800, fontSize:18, color:C.text }}>{userProfile.name}</div>
          <div style={{ fontSize:13, color:C.textMuted, fontFamily:F.body, marginBottom:4 }}>{userProfile.handle}</div>
          <div style={{ fontSize:12, color:C.textMuted, fontFamily:F.body, marginBottom:8 }}>{userProfile.country && userProfile.country.split(" ")[0]} {userProfile.age && `· Age ${userProfile.age}`}</div>
          <p style={{ fontFamily:F.display, fontStyle:"italic", fontSize:14, color:C.textSub, lineHeight:1.65, marginBottom:10 }}>{userProfile.bio}</p>

          {/* Privacy badge */}
          <div style={{ display:"inline-flex", gap:6, alignItems:"center", background:userProfile.isPublic?`${C.green}18`:`${C.orange}15`, border:`1px solid ${userProfile.isPublic?C.green+"44":C.orange+"44"}`, borderRadius:8, padding:"5px 10px", marginBottom:12 }}>
            <span style={{ fontSize:12 }}>{userProfile.isPublic?"🌐":"🔒"}</span>
            <span style={{ fontFamily:F.body, fontWeight:600, fontSize:12, color:userProfile.isPublic?C.greenLight:C.orange }}>{userProfile.isPublic?"Public profile":"Private profile"}</span>
            {!userProfile.isPublic && <span style={{ fontSize:11, color:C.textMuted, fontFamily:F.body }}>· Followers opt-in off</span>}
          </div>

          <div style={{ display:"flex", gap:18 }}>
            {[{v:user?._count?.following??0,l:"following"},{v:user?._count?.followers??"–",l:"followers"},{v:user?._count?.gameLogs??myGames.length,l:"games"}].map(s=>(
              <div key={s.l}><span style={{ fontFamily:F.body, fontWeight:800, fontSize:15, color:C.text }}>{s.v}</span><span style={{ fontSize:12, color:C.textMuted, fontFamily:F.body }}> {s.l}</span></div>
            ))}
          </div>
        </div>
      </div>

      {/* Priority friends */}
      {priorityFriends.length>0 && (
        <div style={{ background:C.surface, borderRadius:16, border:`1px solid ${C.gold}33`, padding:14, marginBottom:14 }}>
          <SectionLabel>⭐ Priority Friends</SectionLabel>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {priorityFriends.map(f=>(
              <div key={f.name} style={{ display:"flex", gap:10, alignItems:"center", cursor:"pointer" }} onClick={()=>onOpenFriend(f.name)}>
                <div style={{ position:"relative" }}>
                  <Avatar char={f.avatar} color={f.avatarColor} size={38} fontSize={14} />
                  <div style={{ position:"absolute", bottom:-1, right:-1 }}><StatusDot status={f.status} /></div>
                </div>
                <div style={{ flex:1 }}>
                  <span style={{ fontFamily:F.body, fontWeight:700, fontSize:14, color:C.text }}>{f.name}</span>
                  {f.statusGame ? <div style={{ fontSize:12, color:C.textMuted, fontFamily:F.body }}>{f.statusGame} · <PlatformBadge id={f.statusPlatform} small /></div>
                    : <div style={{ fontSize:12, color:C.textMuted, fontFamily:F.body }}>{{ online:"Online",idle:"Idle",dnd:"Busy" }[f.status]||"Offline"}</div>}
                </div>
                <span style={{ fontSize:14 }}>⭐</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Platforms */}
      <PlatformConnections user={user} onRefresh={refreshUser} />

      <DiscordPanel onOpenFriend={onOpenFriend} />

      {/* Tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:14 }}>
        {[["games","Games"],["achievements","Trophies"],["genres","Genres"],["stats","Stats"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{ flex:1, padding:"9px 2px", borderRadius:10, background:tab===id?C.accentSoft:C.surface, border:`1px solid ${tab===id?C.accentLight:C.border}`, color:tab===id?C.accentLight:C.textMuted, fontFamily:F.body, fontWeight:700, fontSize:12, cursor:"pointer" }}>
            {label}
          </button>
        ))}
      </div>

      {tab==="games" && <>
        <SectionLabel>Featured</SectionLabel>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:16 }}>
          {myGames.filter(g=>USER_FEATURED.includes(g.id)).map(g=>(
            <div key={g.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, overflow:"hidden" }}>
              <div style={{ height:80, position:"relative" }}><GameCover title={g.title} emoji={g.cover} emojiSize={26} imgUrl={g.backgroundImage} /></div>
              <div style={{ padding:"8px 6px 10px", textAlign:"center" }}>
                <div style={{ fontFamily:F.body, fontWeight:700, fontSize:11, color:C.text, lineHeight:1.3 }}>{g.title}</div>
                {g.trophies?.platinum&&<div style={{ fontSize:12, marginTop:3 }}>🏆</div>}
              </div>
            </div>
          ))}
        </div>
        <SectionLabel>All Games</SectionLabel>
        {myGames.map(g=>(
          <div key={g.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:12, display:"flex", gap:10, alignItems:"center", marginBottom:6 }}>
            <div style={{ width:36, height:46, borderRadius:8, overflow:"hidden", flexShrink:0 }}><GameCover title={g.title} emoji={g.cover} emojiSize={18} imgUrl={g.backgroundImage} /></div>
            <div style={{ flex:1 }}><div style={{ fontFamily:F.body, fontWeight:700, fontSize:13, color:C.text, marginBottom:5 }}>{g.title}</div><ProgressBar pct={g.progress} /></div>
            <span style={{ fontFamily:F.mono, fontSize:12, color:g.progress===100?C.greenLight:C.accentLight }}>{g.progress}%</span>
          </div>
        ))}
      </>}

      {tab==="achievements" && <>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
          {[{v:ACHIEVEMENTS.length,l:"Earned",col:C.gold},{v:myGames.filter(g=>g.trophies?.platinum).length,l:"Platinums",col:C.accentLight}].map(s=>(
            <div key={s.l} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:14, textAlign:"center" }}>
              <div style={{ fontFamily:F.body, fontWeight:800, fontSize:26, color:s.col }}>{s.v}</div>
              <div style={{ fontSize:12, color:C.textMuted, fontFamily:F.body }}>{s.l}</div>
            </div>
          ))}
        </div>
        {ACHIEVEMENTS.map(a=>(
          <div key={a.id} style={{ background:`${C.gold}0d`, border:`1px solid ${C.gold}33`, borderRadius:12, padding:12, display:"flex", gap:10, alignItems:"center", marginBottom:8 }}>
            <span style={{ fontSize:24 }}>{a.icon}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:F.body, fontWeight:700, fontSize:14, color:C.gold }}>{a.name}</div>
              <div style={{ display:"flex", gap:6, marginTop:4 }}><Tag color={C.gold}>{a.rarity}</Tag><span style={{ fontSize:11, color:C.textMuted, fontFamily:F.mono }}>{a.pct}%</span></div>
            </div>
          </div>
        ))}
      </>}

      {tab==="genres" && <>
        {["RPG","Metroidvania","Roguelike"].map((g,i)=>(
          <div key={g} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"14px 16px", display:"flex", gap:12, alignItems:"center", marginBottom:8 }}>
            <span style={{ fontFamily:F.mono, fontWeight:700, fontSize:16, color:i===0?C.gold:C.textMuted, width:26 }}>#{i+1}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:F.body, fontWeight:700, fontSize:15, color:C.text }}>{g}</div>
              <div style={{ fontSize:12, color:C.textMuted, fontFamily:F.body }}>{myGames.filter(gm=>gm.genre===g).length} games logged</div>
            </div>
          </div>
        ))}
        <button style={{ width:"100%", padding:13, borderRadius:14, background:C.surface, border:`2px dashed ${C.border2}`, color:C.textMuted, fontFamily:F.body, fontWeight:700, fontSize:13, cursor:"pointer" }}>+ Add Favorite Genre</button>
      </>}


      {tab==="stats" && <StatsTab />}

      {showEdit && <EditProfileSheet userProfile={userProfile} onSave={handleSave} onClose={()=>setShowEdit(false)} />}
    </div>
  );
};

const USER_FEATURED = [1, 3, 5];

// ─── WRAPPED DATA ─────────────────────────────────────────────────────────────
const WRAPPED_YEARS = ["2025","2024","2023","All Time"];

const WRAPPED_DATA = {
  "2025": {
    totalHours: 292, totalGames: 12, completions: 4, platinums: 2,
    topGame:    { title:"Elden Ring",    cover:"🌑", hours:94,  genre:"RPG"       },
    topGenre:   { name:"RPG",           pct:48,     icon:"⚔️"  },
    topStudio:  { name:"FromSoftware",  games:3,    icon:"⚔️"  },
    topMonth:   { name:"March",         hours:61,   cover:"🌑" },
    longestStreak: { days:18, game:"Elden Ring", cover:"🌑" },
    lateNight:  { pct:34, hour:"1–3 AM" },
    milestone:  { icon:"🏆", text:"First Platinum of the year", game:"Hollow Knight", cover:"🦋" },
    rarest:     { name:"Elden Lord",   icon:"👑", pct:2.1, game:"Elden Ring"    },
    friendClash:{ friend:"neonpixel",  avatar:"N", color:"#0ea5e9", game:"Elden Ring", cover:"🌑", myHours:94, theirHours:88 },
    genreBreakdown: [
      { genre:"RPG",          pct:48, color:C.accent    },
      { genre:"Metroidvania", pct:22, color:"#a855f7"   },
      { genre:"Roguelike",    pct:18, color:C.gold       },
      { genre:"Action RPG",   pct:12, color:C.orange     },
    ],
    platformBreakdown: [
      { id:"ps5",   pct:55, hours:160 },
      { id:"steam", pct:28, hours:82  },
      { id:"xbox",  pct:17, hours:50  },
    ],
    journey: [
      { month:"Jan", hours:18 }, { month:"Feb", hours:24 }, { month:"Mar", hours:61 },
      { month:"Apr", hours:32 }, { month:"May", hours:29 }, { month:"Jun", hours:17 },
      { month:"Jul", hours:22 }, { month:"Aug", hours:19 }, { month:"Sep", hours:26 },
      { month:"Oct", hours:31 }, { month:"Nov", hours:13 }, { month:"Dec", hours:0  },
    ],
    personalityType: { label:"The Completionist", icon:"✅", desc:"You finish what you start. 100% or bust — partial playthroughs aren't in your vocabulary." },
    comparedToFriends: { percentile:88, label:"Top 12% most dedicated gamer among friends" },
  },
  "2024": {
    totalHours: 341, totalGames: 16, completions: 7, platinums: 3,
    topGame:    { title:"Hollow Knight",  cover:"🦋", hours:52,  genre:"Metroidvania" },
    topGenre:   { name:"Metroidvania",    pct:41,     icon:"🦋"  },
    topStudio:  { name:"Team Cherry",     games:1,    icon:"🦋"  },
    topMonth:   { name:"February",        hours:72,   cover:"🦋" },
    longestStreak: { days:24, game:"Hollow Knight", cover:"🦋" },
    lateNight:  { pct:41, hour:"11 PM–1 AM" },
    milestone:  { icon:"🏆", text:"Earned 3 platinums in a single year", game:"Hollow Knight", cover:"🦋" },
    rarest:     { name:"True Ending",    icon:"✨", pct:11.2, game:"Hollow Knight" },
    friendClash:{ friend:"ctrl_dream",   avatar:"C", color:"#a78bfa", game:"Hollow Knight", cover:"🦋", myHours:52, theirHours:48 },
    genreBreakdown: [
      { genre:"Metroidvania", pct:41, color:"#a855f7"  },
      { genre:"RPG",          pct:33, color:C.accent    },
      { genre:"Roguelike",    pct:16, color:C.gold       },
      { genre:"Other",        pct:10, color:C.textMuted  },
    ],
    platformBreakdown: [
      { id:"ps5",   pct:61, hours:208 },
      { id:"steam", pct:24, hours:82  },
      { id:"xbox",  pct:15, hours:51  },
    ],
    journey: [
      { month:"Jan", hours:22 }, { month:"Feb", hours:72 }, { month:"Mar", hours:44 },
      { month:"Apr", hours:38 }, { month:"May", hours:31 }, { month:"Jun", hours:19 },
      { month:"Jul", hours:27 }, { month:"Aug", hours:24 }, { month:"Sep", hours:21 },
      { month:"Oct", hours:18 }, { month:"Nov", hours:16 }, { month:"Dec", hours:9  },
    ],
    personalityType: { label:"The Deep Diver", icon:"🌊", desc:"You don't dabble. When a game grabs you, it gets everything — every hidden path, every secret ending." },
    comparedToFriends: { percentile:92, label:"Top 8% most dedicated gamer among friends" },
  },
  "2023": {
    totalHours: 198, totalGames: 9, completions: 3, platinums: 1,
    topGame:    { title:"Disco Elysium", cover:"🕵️", hours:68,  genre:"RPG" },
    topGenre:   { name:"RPG",           pct:52,     icon:"⚔️"  },
    topStudio:  { name:"ZA/UM",         games:1,    icon:"🕵️"  },
    topMonth:   { name:"October",       hours:44,   cover:"🕵️" },
    longestStreak: { days:12, game:"Disco Elysium", cover:"🕵️" },
    lateNight:  { pct:29, hour:"Midnight–2 AM" },
    milestone:  { icon:"🎖️", text:"First 60+ hour single-game run", game:"Disco Elysium", cover:"🕵️" },
    rarest:     { name:"The Deserter",  icon:"🎖️", pct:4.7,  game:"Disco Elysium" },
    friendClash:{ friend:"axiom_zero",  avatar:"A", color:"#f59e0b", game:"Celeste", cover:"🏔️", myHours:38, theirHours:44 },
    genreBreakdown: [
      { genre:"RPG",     pct:52, color:C.accent   },
      { genre:"Indie",   pct:28, color:"#a855f7"  },
      { genre:"Action",  pct:20, color:C.orange    },
    ],
    platformBreakdown: [
      { id:"steam", pct:58, hours:115 },
      { id:"ps5",   pct:27, hours:53  },
      { id:"xbox",  pct:15, hours:30  },
    ],
    journey: [
      { month:"Jan", hours:8  }, { month:"Feb", hours:14 }, { month:"Mar", hours:19 },
      { month:"Apr", hours:11 }, { month:"May", hours:16 }, { month:"Jun", hours:12 },
      { month:"Jul", hours:9  }, { month:"Aug", hours:17 }, { month:"Sep", hours:14 },
      { month:"Oct", hours:44 }, { month:"Nov", hours:22 }, { month:"Dec", hours:12 },
    ],
    personalityType: { label:"The Story Seeker", icon:"📖", desc:"Gameplay is the vehicle — narrative is the destination. You'd rather feel something than chase a leaderboard." },
    comparedToFriends: { percentile:74, label:"Top 26% most dedicated gamer among friends" },
  },
  "All Time": {
    totalHours: 1247, totalGames: 48, completions: 21, platinums: 7,
    topGame:    { title:"Elden Ring",    cover:"🌑", hours:94,  genre:"RPG" },
    topGenre:   { name:"RPG",           pct:44,     icon:"⚔️"  },
    topStudio:  { name:"FromSoftware",  games:6,    icon:"⚔️"  },
    topMonth:   { name:"February 2024", hours:72,   cover:"🦋" },
    longestStreak: { days:24, game:"Hollow Knight", cover:"🦋" },
    lateNight:  { pct:37, hour:"11 PM–2 AM" },
    milestone:  { icon:"🌟", text:"1,000 total hours logged", game:"All platforms", cover:"🎮" },
    rarest:     { name:"Elden Lord",    icon:"👑", pct:2.1,  game:"Elden Ring" },
    friendClash:{ friend:"neonpixel",   avatar:"N", color:"#0ea5e9", game:"Elden Ring", cover:"🌑", myHours:94, theirHours:88 },
    genreBreakdown: [
      { genre:"RPG",          pct:44, color:C.accent   },
      { genre:"Metroidvania", pct:21, color:"#a855f7"  },
      { genre:"Roguelike",    pct:17, color:C.gold      },
      { genre:"Action RPG",   pct:18, color:C.orange    },
    ],
    platformBreakdown: [
      { id:"ps5",   pct:57, hours:711 },
      { id:"steam", pct:27, hours:337 },
      { id:"xbox",  pct:16, hours:199 },
    ],
    journey: [
      { month:"2022", hours:180 },{ month:"2023", hours:198 },
      { month:"2024", hours:341 },{ month:"2025", hours:292 },{ month:"2026", hours:236 },
    ],
    personalityType: { label:"The Iron-Willed Veteran", icon:"⚔️", desc:"Years of play, hundreds of hours, and still going. You've built a genuine gaming identity — and your backlog fears you." },
    comparedToFriends: { percentile:95, label:"Top 5% most dedicated gamer among friends" },
  },
};

// ─── WRAPPED VIEW ─────────────────────────────────────────────────────────────


// ─── APP SHELL ────────────────────────────────────────────────────────────────
const NAV = [
  {id:"home",    label:"Home",    icon:"🏠"},
  {id:"games",   label:"My Games",icon:"🎮"},
  {id:"feed",    label:"Feed",    icon:"📡"},
  {id:"discover",label:"Discover",icon:"🔍"},
  {id:"profile", label:"Profile", icon:"👤"},
];

function AppShell() {
  const [tab, setTab] = useState("home");
  const [friendSheet,    setFriendSheet]    = useState(null);
  const [studioSheet,    setStudioSheet]    = useState(null);
  const [influencerSheet,setInfluencerSheet]= useState(null);
  const [gameSheet,      setGameSheet]      = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { user, logout, loading, refreshUser } = useAuth();

  // Check URL for OAuth callbacks (discord, steam)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("discord") === "connected" || params.get("steam") === "connected") {
      refreshUser();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const headerTitle = () => {
    if (tab==="home")    return <><span style={{ color:C.accentLight }}>Game</span>Log</>;
    if (tab==="feed")    return "Feed";
    if (tab==="games")   return "My Games";
    if (tab==="profile") return user?.username || "Profile";
    return "GameLog";
  };

  if (loading) return (
    <div style={{ maxWidth:430, margin:"0 auto", minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <span style={{ fontFamily:F.body, color:C.textMuted }}>Loading…</span>
    </div>
  );

  if (!user) return <AuthGate onAuth={(isNew) => { if (isNew) setShowOnboarding(true); }} />;

  if (showOnboarding || (user && user.onboarded === false))
    return <OnboardingFlow onComplete={() => setShowOnboarding(false)} />;

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:ital,wght@0,600;0,700;1,400;1,600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}body{background:${C.bg};font-family:${F.body}}::-webkit-scrollbar{display:none}button{transition:opacity .12s}button:active{opacity:.72}select option{background:${C.surface2};color:${C.text}}`}</style>

      <div style={{ maxWidth:430, margin:"0 auto", minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column" }}>
        <div style={{ position:"sticky", top:0, zIndex:50, background:`${C.bg}f2`, backdropFilter:"blur(18px)", borderBottom:`1px solid ${C.border}`, padding:"12px 16px 10px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontFamily:F.body, fontWeight:800, fontSize:17, color:C.text, letterSpacing:"-0.4px" }}>
            {headerTitle()}
          </span>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <button style={{ padding:"6px 14px", borderRadius:10, background:C.accent, border:"none", color:"white", fontFamily:F.body, fontWeight:700, fontSize:12, cursor:"pointer" }} onClick={() => setTab("games")}>+ Log</button>
            <button style={{ padding:"6px 10px", borderRadius:10, background:"transparent", border:`1px solid ${C.border}`, color:C.textMuted, fontFamily:F.body, fontWeight:600, fontSize:11, cursor:"pointer" }} onClick={logout} title="Sign out">↩</button>
          </div>
        </div>

        <div style={{ flex:1, padding:"12px 12px 88px", overflowY:"auto" }}>
          {tab==="home"     && <HomeView     onOpenFriend={setFriendSheet} onOpenStudio={setStudioSheet} onOpenInfluencer={setInfluencerSheet} onOpenGame={setGameSheet} />}
          {tab==="feed"     && <FeedView     onOpenFriend={setFriendSheet} onOpenStudio={setStudioSheet} onOpenInfluencer={setInfluencerSheet} />}
          {tab==="games"    && <GamesView    onOpenFriend={setFriendSheet} />}
          {tab==="discover" && <DiscoverView onOpenStudio={setStudioSheet} onOpenInfluencer={setInfluencerSheet} />}
          {tab==="profile"  && <ProfileView  onOpenFriend={setFriendSheet} onOpenStudio={setStudioSheet} />}
        </div>

        <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:`${C.surface}f8`, backdropFilter:"blur(20px)", borderTop:`1px solid ${C.border}`, display:"flex", padding:"8px 0 14px", zIndex:50 }}>
          {NAV.map(({id,label,icon})=>{
            const active=tab===id;
            return (
              <button key={id} onClick={()=>setTab(id)} style={{ flex:1, background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"4px 0" }}>
                <div style={{ width:40, height:28, borderRadius:10, background:active?C.accentSoft:"transparent", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <span style={{ fontSize:17, filter:active?"none":"grayscale(0.4) opacity(0.55)" }}>{icon}</span>
                </div>
                <span style={{ fontFamily:F.body, fontWeight:active?700:500, fontSize:10, color:active?C.accentLight:C.textMuted }}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {friendSheet     && <FriendProfileSheet     profileKey={friendSheet}    onClose={()=>setFriendSheet(null)}     />}
      {studioSheet     && <StudioProfileSheet     studioId={studioSheet}      onClose={()=>setStudioSheet(null)}     />}
      {influencerSheet && <InfluencerProfileSheet influencerId={influencerSheet} onClose={()=>setInfluencerSheet(null)} />}
      {gameSheet       && <GameInfoSheet          title={gameSheet}           onClose={()=>setGameSheet(null)}       onOpenStudio={id=>{setGameSheet(null);setStudioSheet(id);}} />}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

// ─── SEARCH RESULT ROW ────────────────────────────────────────────────────────
// One row in the game search dropdown. Shows cover, title, metacritic score,
// and buttons to Add to Library or Wishlist.
const SearchResultRow = ({ game, library, onAdded }) => {
  const inLib  = library.some(g => g.id === game.id && g.status !== "wishlist");
  const inWish = library.some(g => g.id === game.id && g.status === "wishlist");
  const [adding,    setAdding]    = useState(null); // "library" | "wishlist" | null
  const [addedAs,   setAddedAs]   = useState(inLib ? "library" : inWish ? "wishlist" : null);

  const add = async (status) => {
    setAdding(status);
    try {
      await api.logGame({ gameId: game.id, status });
      setAddedAs(status);
      onAdded();
    } catch(e) { console.error(e); }
    setAdding(null);
  };

  return (
    <div style={{ display:"flex", gap:10, alignItems:"center", padding:"10px 14px", borderBottom:`1px solid ${C.border2}` }}>
      <div style={{ width:40, height:52, borderRadius:8, overflow:"hidden", flexShrink:0 }}>
        <GameCover title={game.title} emoji={game.cover || "🎮"} emojiSize={22} imgUrl={game.backgroundImage} />
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:F.body, fontWeight:700, fontSize:14, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{game.title}</div>
        <div style={{ display:"flex", gap:6, alignItems:"center", marginTop:2 }}>
          {game.genre && <span style={{ fontSize:11, color:C.textMuted, fontFamily:F.body }}>{game.genre}</span>}
          {game.metacritic && <span style={{ fontSize:11, fontFamily:F.mono, color:game.metacritic>=75?C.greenLight:game.metacritic>=50?C.gold:C.red, fontWeight:700 }}>{game.metacritic}</span>}
        </div>
      </div>
      <div style={{ display:"flex", gap:6, flexShrink:0 }}>
        {addedAs === "library" ? (
          <span style={{ fontSize:12, color:C.greenLight, fontFamily:F.body, fontWeight:700 }}>✓ In Library</span>
        ) : addedAs === "wishlist" ? (
          <span style={{ fontSize:12, color:C.gold, fontFamily:F.body, fontWeight:700 }}>🔖 Wishlisted</span>
        ) : (<>
          <button onClick={()=>add("library")} disabled={!!adding}
            style={{ padding:"5px 10px", borderRadius:8, background:C.accent, border:"none", color:"#fff", fontFamily:F.body, fontWeight:700, fontSize:11, cursor:"pointer", opacity:adding?"0.6":"1" }}>
            {adding==="library" ? "..." : "+ Library"}
          </button>
          <button onClick={()=>add("wishlist")} disabled={!!adding}
            style={{ padding:"5px 10px", borderRadius:8, background:C.surface2, border:`1px solid ${C.border2}`, color:C.textMuted, fontFamily:F.body, fontWeight:700, fontSize:11, cursor:"pointer", opacity:adding?"0.6":"1" }}>
            {adding==="wishlist" ? "..." : "🔖"}
          </button>
        </>)}
      </div>
    </div>
  );
};

// ─── GAMES VIEW (self-contained) ──────────────────────────────────────────────
function GamesView({ onOpenFriend }) {
  const [selected,   setSelected]   = useState(null);
  const [filter,     setFilter]     = useState("All");
  const filters = ["All","Playing","Wishlist","Completed","Dropped"];

  const [library, setLibrary] = useState([]);
  const loadLibrary = () => api.getMyLibrary()
    .then(logs => { if (logs.length) setLibrary(logs.map(adaptLog)); })
    .catch(() => {});

  useEffect(() => { loadLibrary(); }, []);

  // Game search state — searches the RAWG-sourced catalog
  const [searchQuery,   setSearchQuery]   = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen,    setSearchOpen]    = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await api.searchGames(searchQuery.trim());
        setSearchResults(results);
      } catch(_) {}
      setSearchLoading(false);
    }, 300); // 300ms debounce — avoids firing on every keystroke
    return () => clearTimeout(t);
  }, [searchQuery]);

  const filtered = library.filter(g=>{
    if(filter==="All")       return true;
    if(filter==="Playing")   return g.status === "playing";
    if(filter==="Wishlist")  return g.status === "wishlist";
    if(filter==="Completed") return g.status === "completed";
    if(filter==="Dropped")   return g.status === "dropped";
    return true;
  });

  const GameSheet = ({ game, onClose }) => {
    const [tab, setTab]         = useState("progress");
    const [blurbText, setBlurb] = useState("");
    const [blurbSent, setBlurbSent] = useState(false);
    const [blurbErr,  setBlurbErr]  = useState(null);
    const [editProgress, setEditProgress] = useState(game.progress);
    const [editHours,    setEditHours]    = useState(game.hours);
    const [savingProgress, setSavingProgress] = useState(false);
    const [progressSaved,  setProgressSaved]  = useState(false);
    const [reviewRating, setReviewRating] = useState(8);
    const [reviewBody,   setReviewBody]   = useState("");
    const [reviewSent,   setReviewSent]   = useState(false);
    const [reviewErr,    setReviewErr]    = useState(null);

    const saveProgress = async () => {
      setSavingProgress(true);
      try {
        await api.updateLog(game.id, { progress: editProgress, hours: editHours });
        setProgressSaved(true);
        setTimeout(() => setProgressSaved(false), 2000);
      } catch(e) { console.error(e); }
      finally { setSavingProgress(false); }
    };

    const postReview = async () => {
      if (!reviewBody.trim()) return;
      try {
        await api.postReview({ gameId: game.id, rating: reviewRating, body: reviewBody.trim() });
        setReviewSent(true); setReviewBody("");
      } catch(e) { setReviewErr(e.message); }
    };

    const postBlurb = async () => {
      if (!blurbText.trim()) return;
      try {
        await api.postBlurb({ gameId: game.id, text: blurbText.trim() });
        setBlurbSent(true); setBlurb("");
      } catch (e) { setBlurbErr(e.message); }
    };
    const onlineFriends = [];
    return (
      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:200, display:"flex", alignItems:"flex-end" }} onClick={onClose}>
        <div onClick={e=>e.stopPropagation()} style={{ width:"100%", maxWidth:430, margin:"0 auto", maxHeight:"88vh", background:C.surface, borderRadius:"20px 20px 0 0", border:`1px solid ${C.border}`, overflowY:"auto" }}>
          <div style={{ padding:"12px 0 0", display:"flex", justifyContent:"center" }}><div style={{ width:36, height:4, borderRadius:99, background:C.border2 }} /></div>
          <div style={{ padding:18 }}>
            <div style={{ display:"flex", gap:14, alignItems:"center", marginBottom:14 }}>
              <div style={{ width:56, height:72, borderRadius:14, overflow:"hidden", flexShrink:0 }}><GameCover title={game.title} emoji={game.cover} emojiSize={36} imgUrl={game.backgroundImage} /></div>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:F.body, fontWeight:800, fontSize:20, color:C.text }}>{game.title}</div>
                <div style={{ fontSize:13, color:C.textMuted, fontFamily:F.body }}>{game.studio} · {game.year}</div>
                <div style={{ display:"flex", gap:6, marginTop:7, flexWrap:"wrap" }}><Tag>{game.genre}</Tag><PlatformBadge id={game.platform} />{game.trophies.platinum&&<Tag color={C.gold}>🏆 Platinum</Tag>}{game.coop&&<Tag color={C.green}>Co-op</Tag>}</div>
              </div>
            </div>
            {onlineFriends.length>0&&(
              <div style={{ background:C.discordSoft, border:`1px solid ${C.discord}33`, borderRadius:12, padding:12, marginBottom:14 }}>
                <div style={{ fontFamily:F.body, fontWeight:700, fontSize:12, color:"#7983f5", marginBottom:8 }}>🎧 Friends playing now</div>
                {onlineFriends.map(f=>(
                  <div key={f.id} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:4, cursor:f.profileKey?"pointer":"default" }} onClick={()=>f.profileKey&&onOpenFriend(f.profileKey)}>
                    <Avatar char={f.avatar} color={f.avatarColor} size={26} fontSize={10} />
                    <span style={{ fontFamily:F.body, fontSize:13, color:C.text, fontWeight:600 }}>{f.name}</span>
                    <span style={{ fontSize:12, color:C.textMuted }}>{f.activity}</span>
                    {f.coop&&<Tag color={C.green}>Co-op</Tag>}
                    <a href="discord://" onClick={e=>{ e.preventDefault(); e.stopPropagation(); window.location.href="discord://"; setTimeout(()=>window.open("https://discord.com","_blank"),600); }} style={{ marginLeft:"auto", fontSize:11, color:"#7983f5", fontFamily:F.body, fontWeight:600, textDecoration:"none", border:`1px solid ${C.discord}44`, borderRadius:7, padding:"3px 8px", background:C.discordSoft }}>Join ↗</a>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
              {[{l:"Progress",v:`${game.progress}%`},{l:"Hours",v:`${game.hours}h`},{l:"Trophies",v:`${game.trophies.earned}/${game.trophies.total}`}].map(s=>(
                <div key={s.l} style={{ background:C.surface2, borderRadius:10, padding:"10px 8px", textAlign:"center" }}>
                  <div style={{ fontFamily:F.body, fontWeight:800, fontSize:17, color:C.accentLight }}>{s.v}</div>
                  <div style={{ fontSize:11, color:C.textMuted, fontFamily:F.body, marginTop:1 }}>{s.l}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:6, marginBottom:14 }}>
              {["progress","review","blurb"].map(t=>(
                <button key={t} onClick={()=>setTab(t)} style={{ flex:1, padding:"9px 4px", borderRadius:10, background:tab===t?C.accentSoft:C.surface2, border:`1px solid ${tab===t?C.accentLight:C.border}`, color:tab===t?C.accentLight:C.textMuted, fontFamily:F.body, fontWeight:700, fontSize:12, cursor:"pointer" }}>
                  {t==="blurb"?"✏️ Blurb":t==="review"?"⭐ Review":t[0].toUpperCase()+t.slice(1)}
                </button>
              ))}
            </div>
            {tab==="progress"&&<div>
              <div style={{ marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ fontSize:13, color:C.textSub, fontFamily:F.body, fontWeight:600 }}>Completion</span>
                  <span style={{ fontFamily:F.mono, fontSize:13, color:C.accent }}>{editProgress}%</span>
                </div>
                <input type="range" min={0} max={100} value={editProgress} onChange={e=>setEditProgress(+e.target.value)} style={{ width:"100%", accentColor:C.accent }} />
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ fontSize:13, color:C.textSub, fontFamily:F.body, fontWeight:600 }}>Hours Played</span>
                  <span style={{ fontFamily:F.mono, fontSize:13, color:C.accentLight }}>{editHours}h</span>
                </div>
                <input type="number" min={0} max={9999} value={editHours} onChange={e=>setEditHours(+e.target.value)} style={{ width:"100%", background:C.surface2, border:`1px solid ${C.border2}`, borderRadius:8, padding:"8px 10px", color:C.text, fontFamily:F.mono, fontSize:14, outline:"none" }} />
              </div>
              <div style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}><span style={{ fontSize:13, color:C.textSub, fontFamily:F.body, fontWeight:600 }}>Trophies</span><span style={{ fontFamily:F.mono, fontSize:13, color:C.gold }}>{game.trophies.earned}/{game.trophies.total}</span></div>
                <ProgressBar pct={(game.trophies.earned/Math.max(game.trophies.total,1))*100} color={C.gold} h={8} />
              </div>
              <button onClick={saveProgress} disabled={savingProgress} style={{ width:"100%", padding:11, borderRadius:10, background:progressSaved?`${C.green}22`:C.accent, border:progressSaved?`1px solid ${C.green}55`:"none", color:progressSaved?C.greenLight:"#fff", fontFamily:F.body, fontWeight:700, fontSize:13, cursor:"pointer" }}>
                {progressSaved?"✓ Saved!":savingProgress?"Saving…":"Save Progress"}
              </button>
            </div>}
            {tab==="review"&&<div>
              <p style={{ fontSize:13, color:C.textMuted, fontFamily:F.body, lineHeight:1.5, marginBottom:12 }}>Rate and review this game. One review per game.</p>
              {reviewSent ? (
                <div style={{ background:`${C.green}18`, border:`1px solid ${C.green}44`, borderRadius:12, padding:14, fontFamily:F.body, fontSize:14, color:C.greenLight }}>✓ Review posted!</div>
              ) : (<>
                <div style={{ marginBottom:12 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                    <span style={{ fontSize:13, color:C.textSub, fontFamily:F.body, fontWeight:600 }}>Rating</span>
                    <span style={{ fontFamily:F.display, fontStyle:"italic", fontWeight:700, fontSize:18, color:C.gold }}>{reviewRating}<span style={{ fontSize:12, color:C.textMuted }}>/10</span></span>
                  </div>
                  <input type="range" min={1} max={10} value={reviewRating} onChange={e=>setReviewRating(+e.target.value)} style={{ width:"100%", accentColor:C.gold }} />
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:10, color:C.textMuted, fontFamily:F.body }}>1 — Terrible</span>
                    <span style={{ fontSize:10, color:C.textMuted, fontFamily:F.body }}>10 — Perfect</span>
                  </div>
                </div>
                <textarea value={reviewBody} onChange={e=>setReviewBody(e.target.value)} maxLength={1000} placeholder={`What did you think of ${game.title}?`} style={{ width:"100%", minHeight:100, background:C.surface2, border:`1px solid ${C.border2}`, borderRadius:12, padding:14, color:C.text, fontFamily:F.display, fontStyle:"italic", fontSize:15, resize:"none", outline:"none", lineHeight:1.6, boxSizing:"border-box", marginBottom:6 }} />
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                  <span style={{ fontFamily:F.body, fontSize:11, color:reviewErr?C.red:C.textMuted }}>{reviewErr || `${reviewBody.length}/1000`}</span>
                </div>
                <button onClick={postReview} disabled={!reviewBody.trim()} style={{ width:"100%", padding:12, background:C.gold, border:"none", borderRadius:10, color:"#1a1200", fontFamily:F.body, fontWeight:800, fontSize:13, cursor:"pointer", opacity:reviewBody.trim()?1:0.5 }}>Post Review</button>
              </>)}
            </div>}
            {tab==="blurb"&&<div>
              <p style={{ fontSize:13, color:C.textMuted, fontFamily:F.body, marginBottom:10 }}>Share your current thoughts — posts to your feed and profile.</p>
              {blurbSent ? (
                <div style={{ background:`${C.green}18`, border:`1px solid ${C.green}44`, borderRadius:12, padding:14, fontFamily:F.body, fontSize:14, color:C.greenLight }}>✓ Blurb posted!</div>
              ) : (<>
                <textarea value={blurbText} onChange={e=>setBlurb(e.target.value)} maxLength={280} placeholder={`How's ${game.title} going?`} style={{ width:"100%", minHeight:100, background:C.surface2, border:`1px solid ${C.border2}`, borderRadius:12, padding:14, color:C.text, fontFamily:F.display, fontStyle:"italic", fontSize:15, resize:"none", outline:"none", lineHeight:1.6, boxSizing:"border-box" }} />
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:6, marginBottom:10 }}>
                  <span style={{ fontFamily:F.body, fontSize:11, color:blurbErr?C.red:C.textMuted }}>{blurbErr || `${blurbText.length}/280`}</span>
                </div>
                <button onClick={postBlurb} disabled={!blurbText.trim()} style={{ width:"100%", padding:12, background:C.accent, border:"none", borderRadius:10, color:"white", fontFamily:F.body, fontWeight:800, fontSize:13, cursor:"pointer", opacity:blurbText.trim()?1:0.5 }}>Post Blurb</button>
              </>)}
            </div>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* ── Search bar ────────────────────────────────────────────────────── */}
      <div style={{ position:"relative", marginBottom:12 }}>
        <input
          ref={searchRef}
          value={searchQuery}
          onChange={e=>{ setSearchQuery(e.target.value); setSearchOpen(true); }}
          onFocus={()=>setSearchOpen(true)}
          placeholder="🔍  Search games to add..."
          style={{ width:"100%", background:C.surface2, border:`1px solid ${C.border2}`, borderRadius:12, padding:"10px 14px", color:C.text, fontFamily:F.body, fontSize:14, outline:"none", boxSizing:"border-box" }}
        />
        {searchQuery && (
          <button onClick={()=>{ setSearchQuery(""); setSearchResults([]); setSearchOpen(false); }}
            style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:C.textMuted, fontSize:16, cursor:"pointer" }}>✕</button>
        )}
      </div>

      {/* ── Search results dropdown ──────────────────────────────────────── */}
      {searchOpen && searchQuery.trim() && (
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, marginBottom:14, maxHeight:320, overflowY:"auto" }}>
          {searchLoading && (
            <div style={{ padding:16, textAlign:"center", color:C.textMuted, fontFamily:F.body, fontSize:13 }}>Searching...</div>
          )}
          {!searchLoading && searchResults.length === 0 && (
            <div style={{ padding:16, textAlign:"center", color:C.textMuted, fontFamily:F.body, fontSize:13 }}>No games found for "{searchQuery}"</div>
          )}
          {searchResults.map(game => (
            <SearchResultRow key={game.id} game={game} library={library} onAdded={()=>{ setSearchQuery(""); setSearchResults([]); setSearchOpen(false); loadLibrary(); }} />
          ))}
        </div>
      )}

      {/* ── Status filter pills ───────────────────────────────────────────── */}
      <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4, marginBottom:12 }}>
        {filters.map(f=><Pill key={f} active={filter===f} onClick={()=>setFilter(f)}>{f}</Pill>)}
      </div>

      {true && <>
        {filtered.map(g=>{
          const friendsHere = [];
          return (
            <div key={g.id} onClick={()=>setSelected(g)} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:14, cursor:"pointer", marginBottom:10 }}>
              <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                <div style={{ width:54, height:70, borderRadius:14, border:`1px solid ${C.border2}`, overflow:"hidden", flexShrink:0 }}><GameCover title={g.title} emoji={g.cover} emojiSize={28} imgUrl={g.backgroundImage} /></div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div style={{ fontFamily:F.body, fontWeight:800, fontSize:15, color:C.text }}>{g.title}</div>
                    <div style={{ display:"flex", gap:5, flexShrink:0 }}>{g.trophies.platinum&&<span style={{ fontSize:13 }}>🏆</span>}<PlatformBadge id={g.platform} small /></div>
                  </div>
                  <div style={{ fontSize:12, color:C.textMuted, fontFamily:F.body, marginBottom:7 }}>{g.studio} · {g.hours}h</div>
                  {g.status === "wishlist" ? (
                    <span style={{ fontSize:11, color:C.gold, fontFamily:F.body, fontWeight:700 }}>🔖 Wishlist</span>
                  ) : g.status === "dropped" ? (
                    <span style={{ fontSize:11, color:C.textMuted, fontFamily:F.body, fontWeight:700 }}>✕ Dropped</span>
                  ) : (
                    <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                      <div style={{ flex:1 }}><ProgressBar pct={g.progress} /></div>
                      <span style={{ fontFamily:F.mono, fontSize:12, color:g.progress===100?C.greenLight:C.accentLight, flexShrink:0 }}>{g.progress===100?"✓":g.progress+"%"}</span>
                    </div>
                  )}
                  {friendsHere.length>0&&(
                    <div style={{ display:"flex", gap:5, alignItems:"center", marginTop:7 }}>
                      <span style={{ fontSize:11, color:"#7983f5" }}>🎧</span>
                      {friendsHere.slice(0,3).map(f=>(
                        <div key={f.id} style={{ position:"relative" }}>
                          <Avatar char={f.avatar} color={f.avatarColor} size={18} fontSize={8} />
                          <div style={{ position:"absolute", bottom:-1, right:-1, width:6, height:6, borderRadius:"50%", background:C.greenLight, border:`1px solid ${C.surface}` }} />
                        </div>
                      ))}
                      <span style={{ fontSize:11, color:C.textMuted, fontFamily:F.body }}>{friendsHere.map(f=>f.name).join(", ")} online</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </>}

      {gameTab==="recs" && (
        <div>
          <div style={{ background:`linear-gradient(120deg,${C.accent}18,${C.surface})`, border:`1px solid ${C.accent}22`, borderRadius:14, padding:"12px 14px", marginBottom:14 }}>
            <div style={{ fontFamily:F.body, fontWeight:800, fontSize:13, color:C.accentLight, marginBottom:3 }}>✦ Picked for you</div>
            <div style={{ fontFamily:F.body, fontSize:12, color:C.textMuted, lineHeight:1.5 }}>Based on your playtime, genres, and completed games — synced from PS5, Xbox & Steam.</div>
          </div>
          <div style={{ display:"flex", gap:7, overflowX:"auto", paddingBottom:4, marginBottom:14 }}>
            {["All","FromSoftware fans","Indie lovers","Story-driven","Based on Hollow Knight"].map((r,i)=>(
              <Pill key={r} active={i===0} onClick={()=>{}}>{r}</Pill>
            ))}
          </div>
          {[].map((g,i) => (
            <div key={g.title} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:14, marginBottom:10, display:"flex", gap:12, alignItems:"center" }}>
              <div style={{ width:58, height:72, borderRadius:12, border:`1px solid ${C.border2}`, overflow:"hidden", flexShrink:0, position:"relative" }}>
                <GameCover title={g.title} emoji={g.cover} emojiSize={26} imgUrl={g.backgroundImage} />
                {g.score && <div style={{ position:"absolute", bottom:0, left:0, right:0, textAlign:"center", fontFamily:F.mono, fontSize:8, color:"#fff", background:"rgba(0,0,0,0.6)", padding:"2px 0" }}>{g.score}</div>}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:F.body, fontWeight:800, fontSize:14, color:C.text }}>{g.title}</div>
                <div style={{ fontFamily:F.body, fontSize:11, color:C.textMuted, marginTop:2 }}>{g.genre}</div>
                <div style={{ display:"flex", gap:5, alignItems:"center", marginTop:6 }}>
                  <span style={{ fontSize:10 }}>✦</span>
                  <span style={{ fontFamily:F.body, fontSize:11, color:C.accentLight, fontWeight:600 }}>{g.reason}</span>
                </div>
              </div>
              <button style={{ padding:"7px 12px", borderRadius:10, background:C.accentSoft, border:`1px solid ${C.accentLight}44`, color:C.accentLight, fontFamily:F.body, fontWeight:700, fontSize:11, cursor:"pointer", flexShrink:0 }}>+ Log</button>
            </div>
          ))}
        </div>
      )}

      {selected&&<GameSheet game={selected} onClose={()=>setSelected(null)} />}
    </div>
  );
}

