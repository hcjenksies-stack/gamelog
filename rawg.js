// ─── RAWG API ─────────────────────────────────────────────────────────────────
const RAWG_KEY  = "50df1040e81d4a06988dbb38b1aa8d1f";
const RAWG_BASE = "https://api.rawg.io/api";

// In-memory result cache: title → rawg game object (or null)
const memCache = new Map();
// In-flight pending promises so we never fire duplicate requests
const pending  = new Map();

// Normalise a RAWG platform slug to our PlatformBadge ids
function normPlatform(slug) {
  if (slug.startsWith("playstation")) return "ps5";
  if (slug.startsWith("xbox"))        return "xbox";
  if (slug === "pc")                  return "steam";
  if (slug === "nintendo-switch")     return "switch";
  return null;
}

export async function rawgFetch(title) {
  if (!title) return null;
  const key = title.toLowerCase();

  if (memCache.has(key)) return memCache.get(key);
  if (pending.has(key))  return pending.get(key);

  const promise = (async () => {
    try {
      const url = `${RAWG_BASE}/games?key=${RAWG_KEY}&search=${encodeURIComponent(title)}&page_size=5`;
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`RAWG ${res.status}`);
      const data = await res.json();

      // Pick the best match: exact title match first, then first result
      const results = data.results || [];
      const exact   = results.find(r => r.name.toLowerCase() === key);
      const hit     = exact || results[0] || null;

      if (!hit) { memCache.set(key, null); return null; }

      // Fetch detailed info for description, developers, playtime
      let detail = hit;
      try {
        const dRes = await fetch(`${RAWG_BASE}/games/${hit.id}?key=${RAWG_KEY}`);
        if (dRes.ok) detail = await dRes.json();
      } catch (_) { /* use search hit */ }

      const platforms = [...new Set(
        (detail.platforms || [])
          .map(p => normPlatform(p.platform.slug))
          .filter(Boolean)
      )];

      const result = {
        id:              detail.id,
        name:            detail.name,
        background_image: detail.background_image || null,
        metacritic:      detail.metacritic || null,
        description_raw: detail.description_raw || null,
        genres:          (detail.genres || []).map(g => g.name),
        platforms,
        developers:      (detail.developers || []).map(d => d.name),
        playtime:        detail.playtime || null,
        released:        detail.released ? detail.released.slice(0, 4) : null,
        rating:          detail.rating   ? Math.round(detail.rating * 10) : null,
        ratings_count:   detail.ratings_count || 0,
      };

      memCache.set(key, result);
      return result;
    } catch (err) {
      console.warn("[rawg] fetch failed for:", title, err);
      memCache.set(key, null);
      return null;
    } finally {
      pending.delete(key);
    }
  })();

  pending.set(key, promise);
  return promise;
}
