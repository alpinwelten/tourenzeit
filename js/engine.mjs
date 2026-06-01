// engine.mjs — reine Rechen-Logik für Tourenzeit (kein DOM, testbar)
// Methode: DAV-Gehzeitberechnung (300/500/4) erweitert um Rucksackgewicht,
// Gelände-/Schnee-/Witterungs-/Gruppen-/Höhenfaktoren und Pausenplanung.

export const DEFAULTS = {
  speeds: { vAuf: 300, vAb: 500, vHoriz: 4, vSki: 1500 },
  sac:    { vAuf: 400, vAb: 800, vHoriz: 4 },
  weight: { basislast: 8, pctPerKgAuf: 0.02, pctPerKgHoriz: 0.005 },
  schneeSpur: {
    aper: 1.00, wenigSpur: 1.05, vielSpur: 1.15,
    vielSpuranlage: 1.60, tiefschneeSpuranlage: 2.00,
  },
  hoehe: { schwelle: 2500, pctPer1000: 0.05, cap: 0.30 },
  aktivitaet: { wandern: 1.00, bergsteigen: 1.05, skitour: 1.00 },
  gelaende: { T1: 1.00, T2: 1.05, T3: 1.15, T4: 1.30, T5: 1.50, T6: 1.80 },
  witterung: { nebel: 1.15, naesse: 1.20, dunkelheit: 1.30 },
  gruppe: { solo: 1.00, klein: 1.05, gross: 1.15, heterogen: 1.25 },
  pause: { autoMinProStunde: 5 },
};

// Tiefe Zusammenführung von Default-Config und partiellen User-Overrides.
export function mergeConfig(base, override = {}) {
  const out = {};
  for (const k of Object.keys(base)) {
    const b = base[k];
    const o = override[k];
    out[k] = (b && typeof b === 'object' && !Array.isArray(b))
      ? mergeConfig(b, o || {})
      : (o !== undefined ? o : b);
  }
  for (const k of Object.keys(override)) if (!(k in out)) out[k] = override[k];
  return out;
}

// DAV-Kombination: vertikale Gesamtzeit (Auf+Ab) und horizontale Zeit;
// der kleinere der beiden Werte wird halbiert und zum größeren addiert.
export function davKombination(tAuf, tAb, tHoriz) {
  const tVert = tAuf + tAb;
  return Math.max(tVert, tHoriz) + 0.5 * Math.min(tVert, tHoriz);
}

export function weightFactors(loadKg, cfg) {
  const over = Math.max(0, loadKg - cfg.basislast);
  return { auf: 1 + over * cfg.pctPerKgAuf, horiz: 1 + over * cfg.pctPerKgHoriz };
}

export function hoeheFactor(mittlereHoehe, cfg) {
  const ueber = Math.max(0, (mittlereHoehe || 0) - cfg.schwelle);
  return 1 + Math.min(cfg.cap, (ueber / 1000) * cfg.pctPer1000);
}

export function witterungFactor(keys = [], cfg) {
  return (keys || []).reduce((f, k) => f * (cfg[k] || 1), 1);
}

// "HH:MM" + Dezimalstunden -> "HH:MM" (tagesüberlauf-sicher)
export function addHours(hhmm, hours) {
  const [h, m] = hhmm.split(':').map(Number);
  let t = h * 60 + m + Math.round(hours * 60);
  t = ((t % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// Dezimalstunden -> "h:mm"
export function formatHM(hours) {
  const t = Math.round((hours || 0) * 60);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
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
  const tAbAdj = tAb * (isSki ? 1 : fSchnee); // zu Fuß bremst Schnee/Spur auch den Abstieg
  const tHorizAdj = tHoriz * wf.horiz * fSchnee;

  const gehzeitBasis = davKombination(tAufAdj, tAbAdj, tHorizAdj);

  const fAkt = cfg.aktivitaet[input.aktivitaet] ?? 1;
  const fGel = cfg.gelaende[input.gelaende] ?? 1;
  const fWit = witterungFactor(input.witterung, cfg.witterung);
  const fGrp = cfg.gruppe[input.gruppe] ?? 1;

  const netto = gehzeitBasis * fAkt * fGel * fWit * fGrp;

  const autoMin = input.pauseAutoMinProStunde ?? cfg.pause.autoMinProStunde;
  const pauseAuto = netto * (autoMin / 60);
  const pauseBenannt = (input.benanntePausen || [])
    .reduce((s, p) => s + (Number(p.dauerMin) || 0), 0) / 60;
  const brutto = netto + pauseAuto + pauseBenannt;
  const ankunft = input.startzeit ? addHours(input.startzeit, brutto) : null;

  return {
    netto, brutto, ankunft,
    nettoHM: formatHM(netto), bruttoHM: formatHM(brutto),
    pauseAutoHM: formatHM(pauseAuto), pauseBenanntHM: formatHM(pauseBenannt),
    aufschluesselung: {
      tAuf, tAb, tHoriz, tAufAdj, tAbAdj, tHorizAdj, gehzeitBasis,
      faktoren: {
        gewichtAuf: wf.auf, gewichtHoriz: wf.horiz, schneeSpur: fSchnee, hoehe: fHoehe,
        aktivitaet: fAkt, gelaende: fGel, witterung: fWit, gruppe: fGrp,
      },
      pauseAuto, pauseBenannt,
    },
  };
}
