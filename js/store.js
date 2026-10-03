// Stockage local (sur l'iPhone) + synchronisation vers le Google Sheet.
const KEY = 'shotpro-live-v1';

const DEFAULT_STATE = {
  sessions: [],
  draft: null,
  calib: null,     // { rim:{xl,xr,y}, ball:{h,s,v}|null, aspect, deviceId, savedAt }
  settings: {
    voice: true, beeps: true, sayEachShot: false,
    rest: 45, startDelay: 8,
    sheetUrl: '', sheetKey: '',
    motionThr: 16, hueTol: 17,
    deviceId: '', facing: 'environment',
  },
  queue: [],
  badges: {},       // badge:niveau → date de déblocage
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const s = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_STATE), ...s, settings: { ...DEFAULT_STATE.settings, ...(s.settings || {}) } };
  } catch (e) { return structuredClone(DEFAULT_STATE); }
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
}

export const store = {
  get state() { return state; },
  get settings() { return state.settings; },
  setSetting(k, v) { state.settings[k] = v; save(); },
  setCalib(c) { state.calib = c; save(); },
  setDraft(d) { state.draft = d; save(); },
  addSession(s) {
    state.sessions = state.sessions.filter(x => x.id !== s.id);
    state.sessions.push(s);
    if (!state.queue.includes(s.id)) state.queue.push(s.id);
    state.draft = null; save();
  },
  removeSession(id) {
    state.sessions = state.sessions.filter(x => x.id !== id);
    state.queue = state.queue.filter(x => x !== id); save();
  },
  replaceAll(data) {
    state = { ...structuredClone(DEFAULT_STATE), ...data, settings: { ...DEFAULT_STATE.settings, ...(data.settings || {}) } };
    save();
  },
  reset() { const keep = state.settings; state = structuredClone(DEFAULT_STATE); state.settings = keep; save(); },
};

// Demande à Safari de ne pas effacer les données (efficace surtout une fois l'appli sur l'écran d'accueil).
export async function askPersistence() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) {}
  return false;
}

// ---------- Synchronisation Google Sheet (via le script Apps Script fourni) ----------
export async function syncPending(onStatus) {
  const { sheetUrl, sheetKey } = state.settings;
  if (!sheetUrl || !state.queue.length) { onStatus && onStatus(state.queue.length ? 'off' : 'ok'); return; }
  if (!navigator.onLine) { onStatus && onStatus('offline'); return; }
  onStatus && onStatus('sync');
  for (const id of [...state.queue]) {
    const s = state.sessions.find(x => x.id === id);
    if (!s) { state.queue = state.queue.filter(x => x !== id); continue; }
    try {
      const res = await fetch(sheetUrl, { method: 'POST', body: JSON.stringify({ key: sheetKey, session: s }) });
      const j = await res.json().catch(() => null);
      if (!j || !j.ok) throw new Error(j && j.error ? j.error : 'Réponse inattendue du Google Sheet');
      state.queue = state.queue.filter(x => x !== id);
      s.synced = true; save();
    } catch (e) {
      save(); onStatus && onStatus('error', e.message || String(e)); return;
    }
  }
  onStatus && onStatus('ok');
}

export async function testSheet(url, key) {
  const res = await fetch(url, { method: 'POST', body: JSON.stringify({ key, ping: true }) });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || 'Erreur');
  return j;
}
