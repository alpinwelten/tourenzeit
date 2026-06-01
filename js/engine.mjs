// engine.mjs — reine Rechen-Logik für Tourenzeit (kein DOM, testbar)
// Methode: DAV-Gehzeit (300/500/4), getrennte Etappen-Berechnung für Auf- und
// Abstieg (je eigene Distanz), erweitert um Rucksackgewicht, Gelände-, Schnee-,
// Witterungs-, Wind-, Sicherungs-, Lawinen-, Gruppen- und Höhenfaktoren + Pausen.

export const DEFAULTS = {
  speeds: { vAuf: 300, vAb: 500, vHoriz: 4, vSki: 1500 },
  sac:    { vAuf: 400, vAb: 800, vHoriz: 4 },
  // Gewicht: Basislast ohne Aufschlag; linearer Anteil + progressiver Anteil (Pandolf-Idee)
  weight: { basislast: 8, pctPerKgAuf: 0.018, pctPerKgHoriz: 0.005, progAuf: 0.00013 },
  schneeSpur: {
    aper: 1.00, wenigSpur: 1.05, vielSpur: 1.15,
    vielSpuranlage: 1.60, tiefschneeSpuranlage: 2.00,
  },
  hoehe: { schwelle: 2500, pctPer1000: 0.05, cap: 0.30 },
  aktivitaet: { wandern: 1.00, bergsteigen: 1.05, skitour: 1.00 },
  gelaende: { T1: 1.00, T2: 1.05, T3: 1.15, T4: 1.30, T5: 1.50, T6: 1.80 },
  witterung: { nebel: 1.15, naesse: 1.15, dunkelheit: 1.30 },
  wind: { windstill: 1.00, maessig: 1.05, stark: 1.15, sturm: 1.30 },
  // Trittsicherheit / Material (Sichern kostet am meisten Zeit)
  sicherung: { kein: 1.00, steigeisen: 1.08, seilGelegentlich: 1.20, seillaengen: 1.50 },
  // Lawinen-Gefahrenstufe (Zeitzuschlag durch vorsichtigere Routenwahl)
  lawine: { na: 1.00, s1: 1.00, s2: 1.02, s3: 1.08, s4: 1.20, s5: 1.30 },
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

// Eine Etappe nach DAV kombinieren: vertikale und horizontale Zeit laufen
// gleichzeitig ab → der kleinere Wert wird halbiert und zum größeren addiert.
export function davLeg(tVertikal, tHorizontal) {
  return Math.max(tVertikal, tHorizontal) + 0.5 * Math.min(tVertikal, tHorizontal);
}

// Gewicht: linearer + leicht progressiver Aufschlag oberhalb der Basislast.
export function weightFactors(loadKg, cfg) {
  const over = Math.max(0, loadKg - cfg.basislast);
  const prog = (cfg.progAuf || 0) * over * over; // progressiver Anteil (Pandolf-Idee)
  return { auf: 1 + over * cfg.pctPerKgAuf + prog, horiz: 1 + over * cfg.pctPerKgHoriz };
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
  if (!Number.isFinite(hours)) return '–';
  const [h, m] = hhmm.split(':').map(Number);
  let t = h * 60 + m + Math.round(hours * 60);
  t = ((t % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// Dezimalstunden -> "h:mm" (non-finite -> sichtbarer Platzhalter statt verstecktem 0:00)
export function formatHM(hours) {
  if (!Number.isFinite(hours)) return '–';
  const t = Math.round(Math.max(0, hours) * 60);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export function computeTour(input = {}) {
  const cfg = mergeConfig(DEFAULTS, input.config || {});
  // Eingaben robust machen: nn = nicht-negativ (0 bei NaN/negativ); sp = positiv (Default-Fallback)
  const nn = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
  const sp = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

  const rawBase = input.useSac
    ? { vAuf: cfg.sac.vAuf, vAb: cfg.sac.vAb, vHoriz: cfg.sac.vHoriz, vSki: cfg.speeds.vSki }
    : cfg.speeds;
  const base = {
    vAuf: sp(rawBase.vAuf, DEFAULTS.speeds.vAuf),
    vAb: sp(rawBase.vAb, DEFAULTS.speeds.vAb),
    vHoriz: sp(rawBase.vHoriz, DEFAULTS.speeds.vHoriz),
    vSki: sp(rawBase.vSki, DEFAULTS.speeds.vSki),
  };

  const isSki = input.aktivitaet === 'skitour';
  const vAb = isSki ? base.vSki : base.vAb;

  // komponentenspezifische Faktoren (gelten gleich für alle Etappen des Tages)
  const gKg = Number(input.gewichtKg);
  const wf = weightFactors(Number.isFinite(gKg) ? gKg : cfg.weight.basislast, cfg.weight);
  const fSchnee = cfg.schneeSpur[input.schneeSpur] ?? 1;
  const fHoehe = hoeheFactor(input.mittlereHoehe, cfg.hoehe);

  // Etappen am Tag: Werte oben = Etappe 1, zusätzliche aus input.etappen (defensiv, geklemmt >= 0).
  const extraEtappen = Array.isArray(input.etappen) ? input.etappen : [];
  const segInput = [
    { name: 'Etappe 1', hmAuf: nn(input.hmAuf), hmAb: nn(input.hmAb), distAufKm: nn(input.distAufKm), distAbKm: nn(input.distAbKm) },
    ...extraEtappen.map((e, i) => ({
      name: e.name || `Etappe ${i + 2}`,
      hmAuf: nn(e.hmAuf), hmAb: nn(e.hmAb), distAufKm: nn(e.distAufKm), distAbKm: nn(e.distAbKm),
    })),
  ];

  let aufstiegZeit = 0, abstiegZeit = 0;
  let hmAufTotal = 0, hmAbTotal = 0, distAufTotal = 0, distAbTotal = 0;
  const segmente = segInput.map((s) => {
    const tAufAdj = (s.hmAuf / base.vAuf) * wf.auf * fSchnee * fHoehe;
    const tAbAdj = (s.hmAb / vAb) * (isSki ? 1 : fSchnee); // Skitour-Abfahrt: kein Schnee-Bremsfaktor
    const tHorizAufAdj = (s.distAufKm / base.vHoriz) * wf.horiz * fSchnee;
    const tHorizAbAdj = (s.distAbKm / base.vHoriz) * wf.horiz * fSchnee;
    const aufZeit = davLeg(tAufAdj, tHorizAufAdj);
    const abZeit = davLeg(tAbAdj, tHorizAbAdj);
    aufstiegZeit += aufZeit; abstiegZeit += abZeit;
    hmAufTotal += s.hmAuf; hmAbTotal += s.hmAb; distAufTotal += s.distAufKm; distAbTotal += s.distAbKm;
    return { ...s, aufZeit, abZeit, segZeit: aufZeit + abZeit };
  });
  const gehzeitBasis = aufstiegZeit + abstiegZeit;

  // globale Faktoren
  const fAkt = cfg.aktivitaet[input.aktivitaet] ?? 1;
  const fGel = cfg.gelaende[input.gelaende] ?? 1;
  const fWit = witterungFactor(input.witterung, cfg.witterung);
  const fWind = cfg.wind[input.wind] ?? 1;
  const fSich = cfg.sicherung[input.sicherung] ?? 1;
  const fLaw = cfg.lawine[input.lawine] ?? 1;
  const fGrp = cfg.gruppe[input.gruppe] ?? 1;

  const globalF = fAkt * fGel * fWit * fWind * fSich * fLaw * fGrp;
  const netto = gehzeitBasis * globalF;

  const autoMin = input.pauseAutoMinProStunde ?? cfg.pause.autoMinProStunde;
  const pauseAuto = netto * (autoMin / 60);
  const pauseBenannt = (input.benanntePausen || [])
    .reduce((s, p) => s + (Number(p.dauerMin) || 0), 0) / 60;
  const brutto = netto + pauseAuto + pauseBenannt;
  const ankunft = input.startzeit ? addHours(input.startzeit, brutto) : null;

  // Sicherheits-Hinweise
  const warnungen = [];
  if (['s3', 's4', 's5'].includes(input.lawine)) {
    warnungen.push(`Lawinen-Gefahrenstufe ${input.lawine.slice(1)} – Hangneigung & Routenwahl kritisch prüfen.`);
  }
  if (input.wind === 'stark' || input.wind === 'sturm') {
    warnungen.push('Starker Wind/Sturm – Windchill, Kälte und Balance beachten.');
  }

  return {
    netto, brutto, ankunft,
    nettoHM: formatHM(netto), bruttoHM: formatHM(brutto),
    pauseAutoHM: formatHM(pauseAuto), pauseBenanntHM: formatHM(pauseBenannt),
    aufstiegNettoHM: formatHM(aufstiegZeit * globalF), abstiegNettoHM: formatHM(abstiegZeit * globalF),
    hmAufTotal, hmAbTotal, distAufTotal, distAbTotal,
    segmente: segmente.map((s) => ({
      name: s.name, hmAuf: s.hmAuf, hmAb: s.hmAb, distAufKm: s.distAufKm, distAbKm: s.distAbKm,
      segNettoHM: formatHM(s.segZeit * globalF),
    })),
    warnungen,
    aufschluesselung: {
      aufstiegZeit, abstiegZeit, gehzeitBasis,
      faktoren: {
        gewichtAuf: wf.auf, gewichtHoriz: wf.horiz, schneeSpur: fSchnee, hoehe: fHoehe,
        aktivitaet: fAkt, gelaende: fGel, witterung: fWit, wind: fWind,
        sicherung: fSich, lawine: fLaw, gruppe: fGrp,
      },
      pauseAuto, pauseBenannt,
    },
  };
}
