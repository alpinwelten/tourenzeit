// storage.mjs — Zustand in localStorage (laden/speichern/zurücksetzen)
const KEY = 'tourenzeit.v1';

export function loadState(fallback) {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

export function saveState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Speicher voll/blockiert */ }
}

export function clearState() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
