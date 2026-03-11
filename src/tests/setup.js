// ─── Vitest Setup ─────────────────────────────────────────────────────────────
// Runs before each test file. Provides a manual localStorage mock so tests
// work in the Node environment without needing jsdom or @testing-library.

// Minimal localStorage implementation — matches the browser API exactly
class LocalStorageMock {
  constructor() { this._store = {}; }
  getItem(key)         { return Object.prototype.hasOwnProperty.call(this._store, key) ? this._store[key] : null; }
  setItem(key, value)  { this._store[key] = String(value); }
  removeItem(key)      { delete this._store[key]; }
  clear()              { this._store = {}; }
}

// Attach to globalThis so api.js can call localStorage.getItem() etc.
globalThis.localStorage = new LocalStorageMock();

// Reset storage state between every test so tests don't bleed into each other
beforeEach(() => { globalThis.localStorage.clear(); });
