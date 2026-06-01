# Tourenzeit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine installierbare, offline-fähige PWA „Tourenzeit", die nach DAV-Methode die Gehzeit berechnet und um Rucksackgewicht, Gelände-/Schnee-/Witterungsfaktoren und Pausenplanung erweitert ist, gehostet auf GitHub Pages.

**Architecture:** Build-free Vanilla-PWA. Reine Rechen-Logik in `js/engine.mjs` (kein DOM, TDD mit `node:test`). DOM-Verdrahtung in `js/ui.mjs`, Persistenz in `js/storage.mjs`. Offline via Service Worker. Statisches Deployment direkt aus `main` auf GitHub Pages.

**Tech Stack:** HTML5, CSS3 (Custom Properties, Dark-Theme), ES-Module (`.mjs`), `node:test` (Bordmittel, keine Dependencies), GitHub Pages.

**Referenz-Spec:** `docs/superpowers/specs/2026-06-01-tourenzeit-design.md`

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `package.json` | `type: module`, `test`-Script (`node --test`) |
| `js/engine.mjs` | Reine Rechen-Logik: DAV-Kombination, Faktoren, Pausen, Zeit-Helfer, `computeTour()` |
| `test/engine.test.mjs` | Unit-/Golden-Tests der Engine |
| `js/storage.mjs` | Zustand laden/speichern (localStorage) |
| `js/ui.mjs` | Inputs lesen → `computeTour` → Ergebnis + Aufschlüsselung rendern; Live-Update |
| `js/sw-register.mjs` | Service-Worker-Registrierung |
| `sw.js` | App-Shell-Cache (offline) |
| `index.html` | Markup: Ergebnis-Karte, 4 Grundwert-Controls, Abschnitte Bedingungen/Pausen/Experten |
| `css/styles.css` | Dunkles iOS-natives Theme, Control-Komponenten, Layout |
| `manifest.webmanifest` | PWA-Manifest |
| `icons/` | Generierte PNGs + SVG-Quelle |
| `tools/generate-icons.mjs` | Icon-Generierung (SVG → PNG) |
| `README.md` | Kurzdoku, Deploy-Hinweise |

---

## Engine-API-Vertrag (für ui.mjs verbindlich)

```
computeTour(input) -> result
input = {
  hmAuf, hmAb, distKm, gewichtKg,
  aktivitaet: 'wandern'|'bergsteigen'|'skitour',
  schneeSpur: 'aper'|'wenigSpur'|'vielSpur'|'vielSpuranlage'|'tiefschneeSpuranlage',
  gelaende: 'T1'|'T2'|'T3'|'T4'|'T5'|'T6',
  witterung: string[],            // Teilmenge aus ['nebel','naesse','dunkelheit']
  gruppe: 'solo'|'klein'|'gross'|'heterogen',
  mittlereHoehe,                  // m
  pauseAutoMinProStunde,          // number
  benanntePausen: [{name, dauerMin}],
  startzeit,                      // 'HH:MM' | null
  useSac,                         // bool
  config,                         // partielle Overrides von DEFAULTS
}
result = { netto, brutto, ankunft, nettoHM, bruttoHM, pauseAutoHM, pauseBenanntHM, aufschluesselung:{...} }
```

---

## Task 0: Scaffolding

**Files:**
- Create: `package.json`

- [ ] **Step 1: package.json anlegen**

```json
{
  "name": "tourenzeit",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Gehzeit- und Tourenzeit-Rechner (PWA)",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add package.json && git commit -m "chore: project scaffolding"
```

---

## Task 1: DAV-Kombination (TDD)

**Files:**
- Create: `js/engine.mjs`, `test/engine.test.mjs`

- [ ] **Step 1: Failing test**

```js
// test/engine.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { davKombination } from '../js/engine.mjs';

test('davKombination: groesserer Wert + halber kleinerer', () => {
  // tVert = 3.3333 + 2.0 = 5.3333 ; tHoriz = 2.0
  // 5.3333 + 0.5*2.0 = 6.3333
  assert.ok(Math.abs(davKombination(1000/300, 1000/500, 8/4) - 6.3333) < 1e-3);
});

test('davKombination: horizontal dominiert', () => {
  // tVert = 0.5+0.2=0.7 ; tHoriz = 3 -> 3 + 0.35 = 3.35
  assert.ok(Math.abs(davKombination(0.5, 0.2, 3) - 3.35) < 1e-9);
});
```

- [ ] **Step 2: Test schlägt fehl** — `npm test` → FAIL (`davKombination` nicht exportiert)

- [ ] **Step 3: Implementieren**

```js
// js/engine.mjs
export function davKombination(tAuf, tAb, tHoriz) {
  const tVert = tAuf + tAb;
  return Math.max(tVert, tHoriz) + 0.5 * Math.min(tVert, tHoriz);
}
```

- [ ] **Step 4: `npm test`** → PASS

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(engine): DAV-Kombination"`

---

## Task 2: weightFactors (TDD)

- [ ] **Step 1: Failing test** (an `test/engine.test.mjs` anhängen, Import ergänzen: `weightFactors`)

```js
import { weightFactors } from '../js/engine.mjs';
const W = { basislast: 8, pctPerKgAuf: 0.02, pctPerKgHoriz: 0.005 };

test('weightFactors: Basislast = 1.0', () => {
  assert.deepEqual(weightFactors(8, W), { auf: 1, horiz: 1 });
});
test('weightFactors: unter Basislast kein Bonus', () => {
  assert.deepEqual(weightFactors(5, W), { auf: 1, horiz: 1 });
});
test('weightFactors: +2%/kg Aufstieg, +0,5%/kg horizontal', () => {
  const f = weightFactors(58, W); // +50 kg
  assert.ok(Math.abs(f.auf - 2.0) < 1e-9);
  assert.ok(Math.abs(f.horiz - 1.25) < 1e-9);
});
```

- [ ] **Step 2: FAIL** → **Step 3: Implementieren**

```js
export function weightFactors(loadKg, cfg) {
  const over = Math.max(0, loadKg - cfg.basislast);
  return { auf: 1 + over * cfg.pctPerKgAuf, horiz: 1 + over * cfg.pctPerKgHoriz };
}
```

- [ ] **Step 4: `npm test` → PASS** → **Step 5: Commit** `feat(engine): Gewichtsfaktoren`

---

## Task 3: hoeheFactor (TDD)

- [ ] **Step 1: Failing test** (Import `hoeheFactor`)

```js
import { hoeheFactor } from '../js/engine.mjs';
const H = { schwelle: 2500, pctPer1000: 0.05, cap: 0.30 };

test('hoeheFactor: unter Schwelle = 1.0', () => assert.equal(hoeheFactor(2000, H), 1));
test('hoeheFactor: +5% je 1000 Hm ueber 2500', () =>
  assert.ok(Math.abs(hoeheFactor(3500, H) - 1.05) < 1e-9));
test('hoeheFactor: Deckel 30%', () => assert.ok(Math.abs(hoeheFactor(12000, H) - 1.30) < 1e-9));
```

- [ ] **Step 2: FAIL** → **Step 3: Implementieren**

```js
export function hoeheFactor(mittlereHoehe, cfg) {
  const ueber = Math.max(0, (mittlereHoehe || 0) - cfg.schwelle);
  return 1 + Math.min(cfg.cap, (ueber / 1000) * cfg.pctPer1000);
}
```

- [ ] **Step 4: PASS** → **Step 5: Commit** `feat(engine): Hoehenfaktor`

---

## Task 4: witterungFactor (TDD)

- [ ] **Step 1: Failing test** (Import `witterungFactor`)

```js
import { witterungFactor } from '../js/engine.mjs';
const WIT = { nebel: 1.15, naesse: 1.20, dunkelheit: 1.30 };

test('witterungFactor: leer = 1.0', () => assert.equal(witterungFactor([], WIT), 1));
test('witterungFactor: multiplikativ', () =>
  assert.ok(Math.abs(witterungFactor(['nebel', 'dunkelheit'], WIT) - 1.15 * 1.30) < 1e-9));
```

- [ ] **Step 2: FAIL** → **Step 3: Implementieren**

```js
export function witterungFactor(keys = [], cfg) {
  return (keys || []).reduce((f, k) => f * (cfg[k] || 1), 1);
}
```

- [ ] **Step 4: PASS** → **Step 5: Commit** `feat(engine): Witterungsfaktor`

---

## Task 5: Zeit-Helfer addHours/formatHM (TDD)

- [ ] **Step 1: Failing test** (Import `addHours, formatHM`)

```js
import { addHours, formatHM } from '../js/engine.mjs';

test('formatHM', () => {
  assert.equal(formatHM(6.3333), '6:20');
  assert.equal(formatHM(0), '0:00');
  assert.equal(formatHM(1.5), '1:30');
});
test('addHours', () => {
  assert.equal(addHours('07:00', 6.3333), '13:20');
  assert.equal(addHours('22:30', 4), '02:30'); // Tagesueberlauf
});
```

- [ ] **Step 2: FAIL** → **Step 3: Implementieren**

```js
export function addHours(hhmm, hours) {
  const [h, m] = hhmm.split(':').map(Number);
  let t = h * 60 + m + Math.round(hours * 60);
  t = ((t % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
export function formatHM(hours) {
  const t = Math.round((hours || 0) * 60);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
```

- [ ] **Step 4: PASS** → **Step 5: Commit** `feat(engine): Zeit-Helfer`

---

## Task 6: DEFAULTS, mergeConfig & computeTour (TDD, Integration)

- [ ] **Step 1: Failing tests** (Import `DEFAULTS, mergeConfig, computeTour`)

```js
import { DEFAULTS, mergeConfig, computeTour } from '../js/engine.mjs';

test('mergeConfig: override greift tief, Rest bleibt Default', () => {
  const c = mergeConfig(DEFAULTS, { weight: { basislast: 12 } });
  assert.equal(c.weight.basislast, 12);
  assert.equal(c.weight.pctPerKgAuf, 0.02);
  assert.equal(c.speeds.vAuf, 300);
});

test('computeTour: DAV-Basis (Golden) ohne Faktoren', () => {
  // 1000 auf / 1000 ab / 8 km, Gewicht=Basislast, aper, T1, Wandern, solo, Hoehe<2500
  const r = computeTour({
    hmAuf: 1000, hmAb: 1000, distKm: 8, gewichtKg: 8,
    aktivitaet: 'wandern', schneeSpur: 'aper', gelaende: 'T1',
    witterung: [], gruppe: 'solo', mittlereHoehe: 1500,
    pauseAutoMinProStunde: 0, benanntePausen: [],
  });
  assert.equal(r.nettoHM, '6:20');
});

test('computeTour: Skitour-Abfahrt ist schnell', () => {
  const r = computeTour({
    hmAuf: 0, hmAb: 1500, distKm: 0, gewichtKg: 8, aktivitaet: 'skitour',
    schneeSpur: 'aper', gelaende: 'T1', witterung: [], gruppe: 'solo',
    mittlereHoehe: 2000, pauseAutoMinProStunde: 0, benanntePausen: [],
  });
  // tAb = 1500/1500 = 1.0 h ; tVert=1.0 ; tHoriz=0 -> 1.0 + 0 = 1.0
  assert.equal(r.nettoHM, '1:00');
});

test('computeTour: Pausen & Ankunft', () => {
  const r = computeTour({
    hmAuf: 600, hmAb: 600, distKm: 4, gewichtKg: 8, aktivitaet: 'wandern',
    schneeSpur: 'aper', gelaende: 'T1', witterung: [], gruppe: 'solo',
    mittlereHoehe: 1000, pauseAutoMinProStunde: 5,
    benanntePausen: [{ name: 'Gipfel', dauerMin: 30 }], startzeit: '07:00',
  });
  // tAuf=2, tAb=1.2, tHoriz=1 -> tVert=3.2 ; 3.2 + 0.5*1 = 3.7 h netto
  assert.equal(r.nettoHM, '3:42');
  // pauseAuto = 3.7 * 5/60 = 0.3083 h ; pauseBenannt=0.5 h ; brutto=4.5083 -> 4:31
  assert.equal(r.bruttoHM, '4:31');
  assert.equal(r.ankunft, '11:31');
});

test('computeTour: Gewicht verlangsamt Aufstieg', () => {
  const leicht = computeTour({ hmAuf: 1000, hmAb: 0, distKm: 0, gewichtKg: 8, aktivitaet:'wandern', schneeSpur:'aper', gelaende:'T1', witterung:[], gruppe:'solo', mittlereHoehe:0, pauseAutoMinProStunde:0, benanntePausen:[] });
  const schwer = computeTour({ hmAuf: 1000, hmAb: 0, distKm: 0, gewichtKg: 33, aktivitaet:'wandern', schneeSpur:'aper', gelaende:'T1', witterung:[], gruppe:'solo', mittlereHoehe:0, pauseAutoMinProStunde:0, benanntePausen:[] });
  // +25 kg -> auf-Faktor 1.5
  assert.ok(Math.abs(schwer.netto / leicht.netto - 1.5) < 1e-6);
});
```

- [ ] **Step 2: FAIL** → **Step 3: Implementieren** (DEFAULTS, mergeConfig, computeTour ans Ende von `js/engine.mjs`)

```js
export const DEFAULTS = {
  speeds: { vAuf: 300, vAb: 500, vHoriz: 4, vSki: 1500 },
  sac:    { vAuf: 400, vAb: 800, vHoriz: 4 },
  weight: { basislast: 8, pctPerKgAuf: 0.02, pctPerKgHoriz: 0.005 },
  schneeSpur: { aper: 1.00, wenigSpur: 1.05, vielSpur: 1.15, vielSpuranlage: 1.60, tiefschneeSpuranlage: 2.00 },
  hoehe: { schwelle: 2500, pctPer1000: 0.05, cap: 0.30 },
  aktivitaet: { wandern: 1.00, bergsteigen: 1.05, skitour: 1.00 },
  gelaende: { T1: 1.00, T2: 1.05, T3: 1.15, T4: 1.30, T5: 1.50, T6: 1.80 },
  witterung: { nebel: 1.15, naesse: 1.20, dunkelheit: 1.30 },
  gruppe: { solo: 1.00, klein: 1.05, gross: 1.15, heterogen: 1.25 },
  pause: { autoMinProStunde: 5 },
};

export function mergeConfig(base, override = {}) {
  const out = {};
  for (const k of Object.keys(base)) {
    const b = base[k], o = override[k];
    out[k] = (b && typeof b === 'object' && !Array.isArray(b)) ? mergeConfig(b, o || {}) : (o !== undefined ? o : b);
  }
  for (const k of Object.keys(override)) if (!(k in out)) out[k] = override[k];
  return out;
}

export function computeTour(input = {}) {
  const cfg = mergeConfig(DEFAULTS, input.config || {});
  const base = input.useSac
    ? { vAuf: cfg.sac.vAuf, vAb: cfg.sac.vAb, vHoriz: cfg.sac.vHoriz, vSki: cfg.speeds.vSki }
    : cfg.speeds;
  const isSki = input.aktivitaet === 'skitour';
  const vAb = isSki ? base.vSki : base.vAb;

  const tAuf = (input.hmAuf || 0) / base.vAuf;
  const tAb = (input.hmAb || 0) / vAb;
  const tHoriz = (input.distKm || 0) / base.vHoriz;

  const wf = weightFactors(input.gewichtKg ?? cfg.weight.basislast, cfg.weight);
  const fSchnee = cfg.schneeSpur[input.schneeSpur] ?? 1;
  const fHoehe = hoeheFactor(input.mittlereHoehe, cfg.hoehe);

  const tAufAdj = tAuf * wf.auf * fSchnee * fHoehe;
  const tAbAdj = tAb * (isSki ? 1 : fSchnee);
  const tHorizAdj = tHoriz * wf.horiz * fSchnee;

  const gehzeitBasis = davKombination(tAufAdj, tAbAdj, tHorizAdj);

  const fAkt = cfg.aktivitaet[input.aktivitaet] ?? 1;
  const fGel = cfg.gelaende[input.gelaende] ?? 1;
  const fWit = witterungFactor(input.witterung, cfg.witterung);
  const fGrp = cfg.gruppe[input.gruppe] ?? 1;

  const netto = gehzeitBasis * fAkt * fGel * fWit * fGrp;
  const autoMin = input.pauseAutoMinProStunde ?? cfg.pause.autoMinProStunde;
  const pauseAuto = netto * (autoMin / 60);
  const pauseBenannt = (input.benanntePausen || []).reduce((s, p) => s + (Number(p.dauerMin) || 0), 0) / 60;
  const brutto = netto + pauseAuto + pauseBenannt;
  const ankunft = input.startzeit ? addHours(input.startzeit, brutto) : null;

  return {
    netto, brutto, ankunft,
    nettoHM: formatHM(netto), bruttoHM: formatHM(brutto),
    pauseAutoHM: formatHM(pauseAuto), pauseBenanntHM: formatHM(pauseBenannt),
    aufschluesselung: {
      tAuf, tAb, tHoriz, tAufAdj, tAbAdj, tHorizAdj, gehzeitBasis,
      faktoren: { gewichtAuf: wf.auf, gewichtHoriz: wf.horiz, schneeSpur: fSchnee, hoehe: fHoehe, aktivitaet: fAkt, gelaende: fGel, witterung: fWit, gruppe: fGrp },
      pauseAuto, pauseBenannt,
    },
  };
}
```

- [ ] **Step 4: `npm test` → alle PASS**

- [ ] **Step 5: Golden-Verifikation gegen Bergfreunde** — Mit `WebFetch`/Inspektion der Bergfreunde-JS 2–3 Referenztouren prüfen; falls die exakte Halbierungsvariante abweicht, NUR `davKombination` anpassen und Tests aktualisieren. Ergebnis im Commit dokumentieren.

- [ ] **Step 6: Commit** `feat(engine): computeTour + Golden-Tests`

---

## Task 7: storage.mjs

**Files:** Create: `js/storage.mjs`

- [ ] **Step 1: Datei erstellen** (vollständig)

```js
// js/storage.mjs — Zustand in localStorage
const KEY = 'tourenzeit.v1';

export function loadState(fallback) {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch { return { ...fallback }; }
}

export function saveState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export function clearState() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
```

- [ ] **Step 2: Commit** `feat: localStorage-Persistenz`

---

## Task 8: index.html (Markup)

**Files:** Create: `index.html`

Verbindliche Struktur (vollständiges, semantisches Markup erstellen, kein Framework):

- `<head>`: `charset`, `viewport` mit `viewport-fit=cover`, `theme-color #0f141a`, `<link rel="manifest" href="manifest.webmanifest">`, Apple-Meta (`apple-mobile-web-app-capable=yes`, `…status-bar-style=black-translucent`, `apple-mobile-web-app-title=Tourenzeit`), `apple-touch-icon` (180), `<link rel="stylesheet" href="css/styles.css">`.
- `<body>`:
  - `<header class="app-header">` Titel „Tourenzeit", Untertitel „Gehzeit · Pausen · Ankunft".
  - `<section class="result-card">` mit Plätzen `#netto`, `#brutto`, `#ankunftRow`/`#ankunft`, und `<details class="breakdown"><summary>Aufschlüsselung</summary>…#breakdownBody…</details>`.
  - `<section class="grundwerte">` — vier **Control-Komponenten** nach diesem Muster (genau diese `data-field`-Keys: `hmAuf`, `hmAb`, `distKm`, `gewichtKg`):

  ```html
  <div class="field" data-field="hmAuf" data-min="0" data-max="3000" data-step="50">
    <div class="field-head">
      <label>Aufstieg</label>
      <div class="field-value">
        <input class="val" type="number" inputmode="numeric" value="1000">
        <span class="unit">Hm</span>
      </div>
    </div>
    <div class="field-controls">
      <button class="step" data-dir="-1" aria-label="weniger">−</button>
      <input class="slider" type="range" min="0" max="3000" step="50" value="1000">
      <button class="step" data-dir="1" aria-label="mehr">+</button>
    </div>
  </div>
  ```
  Werte: `hmAb` (Abstieg, 0–3000, Schritt 50, Hm), `distKm` (Distanz, 0–50, Schritt 0.5, km), `gewichtKg` (Gewicht, 5–60, Schritt 1, kg).
  - `<details class="section" id="bedingungen"><summary>Bedingungen</summary>` mit Segmented-Controls/Selects:
    - Aktivität (`#aktivitaet`): Wandern/Bergsteigen/Skitour
    - Schnee & Spur (`#schneeSpur`): aper / wenig+Spur / viel+Spur / viel+Spuranlage / Tiefschnee+Spuranlage
    - Gelände (`#gelaende`): T1…T6
    - Witterung (`#witterung`, Checkboxen): Nebel/Sicht, Nässe/Sturm, Dunkelheit
    - Gruppe (`#gruppe`): Solo/2er, Gruppe 3–5, Gruppe 6+, heterogen/erschöpft
    - Mittlere Höhe (`#mittlereHoehe`, Number, m)
  - `<details class="section" id="pausenSection"><summary>Pausen</summary>`: Auto Min/Std (`#pauseAuto`), Liste benannter Pausen (`#pausenList` + Button `#addPause`), Startzeit (`#startzeit`, `type=time`).
  - `<details class="section" id="experten"><summary>Experten</summary>`: SAC-Toggle (`#useSac`), Geschwindigkeiten `#vAuf/#vAb/#vHoriz/#vSki`, Faktor-Kalibrierung (Basislast `#basislast`, `#pctPerKgAuf` …), Button `#reset`.
  - `<script type="module" src="js/ui.mjs"></script>` und `<script type="module" src="js/sw-register.mjs"></script>`.

- [ ] **Step 1: `index.html` mit obiger Struktur vollständig erstellen** (alle Felder vorhanden, sinnvolle Defaults).
- [ ] **Step 2: Sichtprüfung** — `python3 -m http.server 8080` im Repo, `http://localhost:8080` öffnen; Seite lädt ohne Konsolenfehler (UI-Logik folgt in Task 10).
- [ ] **Step 3: Commit** `feat(ui): HTML-Struktur`

---

## Task 9: css/styles.css (Theme)

**Files:** Create: `css/styles.css`

Anforderungen (vollständiges Stylesheet erstellen):
- **Design-Tokens** (`:root`): `--bg:#0f141a; --surface:#171f29; --surface-2:#1f2a36; --text:#eef2f6; --muted:#9fb0c0; --accent:#ff5a3c (Alpenrot); --accent-2:#ff8a4c; --radius:16px; --safe-top:env(safe-area-inset-top)` etc.
- `body` dunkel, System-Font-Stack (`-apple-system, …`), Safe-Area-Padding, max-width 560px zentriert.
- **Ergebnis-Karte:** prominent, große Netto-Zeit (≥ 2.4rem), Brutto/Ankunft sekundär; Akzentfarbe für die Hauptzahl; `position: sticky; top:0` optional.
- **Control-Komponente `.field`:** Karte mit `--surface`; `.field-head` (Label + großer Wert rechts, Wert-Input rechtsbündig, transparenter Hintergrund); `.field-controls` als Grid `auto 1fr auto`; `.step`-Buttons rund, 44×44px (Touch-Target), Akzent-Rand; `.slider` mit gestyltem `::-webkit-slider-thumb` in Akzentfarbe.
- **`details.section`:** Karten mit `summary` als Touch-Header (Pfeil/Chevron, 44px Höhe), Inhalt mit Abstand.
- **Segmented-Control** (`.segmented`): horizontale Button-Gruppe, aktiver Zustand in Akzentfarbe (`[aria-pressed=true]`).
- Inputs/Selects dunkel gestylt, große Tap-Targets, `font-size:16px` (kein iOS-Zoom).
- **Aufschlüsselung** (`.breakdown` Tabelle/Definition-Liste) dezent, `--muted`.
- Reduzierte Bewegung respektieren; ausreichend Kontrast (WCAG AA).

- [ ] **Step 1: `css/styles.css` erstellen**
- [ ] **Step 2: Sichtprüfung** im lokalen Server (Mobile-Viewport 390×844): natives, dunkles Erscheinungsbild, keine horizontalen Scrollbalken, Touch-Targets ≥ 44px.
- [ ] **Step 3: Commit** `feat(ui): Dark-Theme & Controls`

---

## Task 10: js/ui.mjs (Verdrahtung)

**Files:** Create: `js/ui.mjs`

Verbindliches Verhalten (vollständig implementieren):
- Beim Laden: `loadState(DEFAULT_STATE)` (storage.mjs) → Inputs befüllen.
- `DEFAULT_STATE` enthält alle `computeTour`-Inputs mit sinnvollen Defaults (z. B. `hmAuf:1000, hmAb:1000, distKm:8, gewichtKg:12, aktivitaet:'wandern', schneeSpur:'aper', gelaende:'T1', witterung:[], gruppe:'solo', mittlereHoehe:1500, pauseAutoMinProStunde:5, benanntePausen:[], startzeit:'', useSac:false, config:{}`).
- **Grundwert-Controls:** für jedes `.field`: Slider ↔ Zahl-Input synchron; `.step`-Buttons addieren/subtrahieren `data-step` und respektieren `data-min`; Direkteingabe erlaubt Werte über `data-max` (Slider klemmt visuell, Wert bleibt erhalten). Jede Änderung → `state` aktualisieren → `recompute()`.
- **Bedingungen/Pausen/Experten:** alle Inputs an `state` binden (`change`/`input`). Witterung als Array aus den drei Checkboxen. Benannte Pausen: Add/Remove rendert `#pausenList` neu (jede Zeile: Name-Input + Dauer-Min-Input + Entfernen-Button).
- **Experten:** `useSac` togglet SAC-Geschwindigkeiten; Geschwindigkeits-/Faktor-Inputs schreiben nach `state.config` (deep). `#reset` → `clearState()` + Reload der Defaults.
- `recompute()`: baut `input` aus `state`, ruft `computeTour(input)`, schreibt `#netto`=`nettoHM`, `#brutto`=`bruttoHM`, `#ankunft` (Zeile nur sichtbar wenn `startzeit` gesetzt), und rendert `#breakdownBody` (Komponentenzeiten roh/adjustiert + jeder Faktor als ×-Wert + Pausen). Danach `saveState(state)`.
- Defensive Zahl-Parsing (Komma/Punkt), `NaN` → 0.

- [ ] **Step 1: `js/ui.mjs` implementieren**
- [ ] **Step 2: Manuelle Prüfung** im lokalen Server: Werte ändern → Ergebnis aktualisiert live; Pausen hinzufügen/entfernen; SAC-Toggle ändert Zeit; Reload behält Eingaben (localStorage).
- [ ] **Step 3: Commit** `feat(ui): Live-Berechnung, Persistenz, Pausen`

---

## Task 11: PWA (Manifest + Service Worker)

**Files:** Create: `manifest.webmanifest`, `sw.js`, `js/sw-register.mjs`

- [ ] **Step 1: `manifest.webmanifest`**

```json
{
  "name": "Tourenzeit",
  "short_name": "Tourenzeit",
  "description": "Gehzeit- und Tourenzeit-Rechner",
  "start_url": ".",
  "scope": ".",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0f141a",
  "theme_color": "#0f141a",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 2: `js/sw-register.mjs`**

```js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
```

- [ ] **Step 3: `sw.js`** (App-Shell, cache-first, versioniert)

```js
const CACHE = 'tourenzeit-v1';
const ASSETS = [
  '.', 'index.html', 'css/styles.css',
  'js/engine.mjs', 'js/ui.mjs', 'js/storage.mjs', 'js/sw-register.mjs',
  'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
```

- [ ] **Step 4: Apple-/Manifest-Links in `index.html` prüfen** (bereits in Task 8 angelegt) — `apple-touch-icon` zeigt auf `icons/icon-180.png`.
- [ ] **Step 5: Commit** `feat(pwa): Manifest, Service Worker, Offline`

---

## Task 12: Icon-Generierung

**Files:** Create: `tools/generate-icons.mjs`, `icons/icon.svg`, generierte PNGs

Stil: „Gipfel + Höhenprofil, dunkel-premium" (Schiefer-Hintergrund, Berggrat, aufsteigende Akzentlinie in Alpenrot/Orange).

- [ ] **Step 1: SVG-Quelle(n) erstellen** — 2–3 Varianten als `icons/icon-a.svg`, `icons/icon-b.svg` (512×512, abgerundeter Hintergrund), je Gipfelsilhouette + Höhen-/Zeitlinie + Akzent.
- [ ] **Step 2: Generator schreiben** `tools/generate-icons.mjs` — rendert die gewählte SVG in PNGs (Größen 1024, 512, 192, 180, 167, 152, 120) + `icon-maskable-512.png` (mit Sicherheitsrand). Bevorzugt mit `sharp`, falls verfügbar; sonst Fallback über `sips`/`rsvg-convert` (macOS) — Methode beim Bauen wählen und dokumentieren.
- [ ] **Step 3: Entwürfe zeigen** — die SVG-Varianten als PNG rendern und dem Nutzer zur **Auswahl** vorlegen (Read rendert Bilder). Gewählte Variante als finales `icons/icon.svg` setzen.
- [ ] **Step 4: Finale PNGs generieren** und in `icons/` ablegen; `favicon.ico`/`icon-32.png` optional.
- [ ] **Step 5: Commit** `feat: App-Icon (Gipfel/Höhenprofil)`

---

## Task 13: README

**Files:** Create: `README.md`

- [ ] **Step 1: README schreiben** — Zweck, Berechnungsmethode (DAV + Faktoren, Quelle Bergfreunde/DAV), Live-URL, „Zum Home-Bildschirm hinzufügen"-Anleitung (iOS Safari → Teilen → „Zum Home-Bildschirm"), lokale Entwicklung (`python3 -m http.server`), Tests (`npm test`), Lizenz/Hinweis „Planungshilfe, keine Garantie".
- [ ] **Step 2: Commit** `docs: README`

---

## Task 14: Deployment (GitHub Pages)

- [ ] **Step 1: Repo anlegen & pushen**

```bash
cd ~/tourenzeit
gh repo create tourenzeit --public --source=. --remote=origin --description "Gehzeit- und Tourenzeit-Rechner (PWA)" --push
```

- [ ] **Step 2: GitHub Pages aktivieren** (main / root)

```bash
gh api -X POST repos/alpinwelten/tourenzeit/pages -f source.branch=main -f source.path=/ || \
gh api -X PUT  repos/alpinwelten/tourenzeit/pages -f source.branch=main -f source.path=/
```

- [ ] **Step 3: Auf Erreichbarkeit prüfen** — nach ~1–2 Min `https://alpinwelten.github.io/tourenzeit/` per `curl -sI` (HTTP 200) testen; ggf. erneut prüfen.
- [ ] **Step 4: Commit/Push** etwaiger Anpassungen (Pfade subpfad-sicher: alle Asset-URLs relativ, `start_url`/`scope` = `.`).

---

## Task 15: Geräte-Verifikation & Abschluss

- [ ] **Step 1:** Live-URL auf iPhone-Viewport prüfen (Layout, Touch, Live-Update, Offline nach erstem Laden via DevTools „Offline").
- [ ] **Step 2:** „Zum Home-Bildschirm" testen → Icon + Standalone-Start (kein Browser-UI).
- [ ] **Step 3:** `npm test` final grün; alles committet & gepusht.
- [ ] **Step 4:** Nutzer informieren: Live-URL + Installationsanleitung + Frage nach gewünschten Faktor-Anpassungen.

---

## Self-Review-Ergebnis

- **Spec-Abdeckung:** DAV-Basis (T1,T6), Gewicht (T2,T6), Schnee×Spur (T6 via DEFAULTS+computeTour), Höhe (T3,T6), Witterung (T4,T6), Aktivität/Skitour (T6), Gruppe (T6), Pausen+Ankunft (T6,T10), 4 Auswahl-Controls (T8), Experten/SAC/Kalibrierung (T8,T10), PWA/Offline/Icon (T11,T12), Hosting (T14) — vollständig abgedeckt.
- **Platzhalter:** keine („Golden-Verifikation" und „Icon-Auswahl" sind konkrete Schritte mit Methode).
- **Typ-Konsistenz:** Engine-Exporte (`davKombination, weightFactors, hoeheFactor, witterungFactor, addHours, formatHM, DEFAULTS, mergeConfig, computeTour`) und `data-field`-Keys (`hmAuf, hmAb, distKm, gewichtKg`) durchgängig identisch verwendet.
