import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  davLeg, weightFactors, hoeheFactor, witterungFactor,
  addHours, formatHM, DEFAULTS, mergeConfig, computeTour,
} from '../js/engine.mjs';

// ---------- davLeg (Etappen-Kombination) ----------
test('davLeg: größerer Wert + halber kleinerer', () => {
  assert.ok(Math.abs(davLeg(4, 1) - 4.5) < 1e-9);   // Aufstieg-Etappe
  assert.ok(Math.abs(davLeg(1, 3) - 3.5) < 1e-9);   // horizontal dominiert
});

// ---------- weightFactors (linear + progressiv) ----------
const W = { basislast: 8, pctPerKgAuf: 0.018, pctPerKgHoriz: 0.005, progAuf: 0.00013 };
test('weightFactors: Basislast = 1.0', () => {
  assert.deepEqual(weightFactors(8, W), { auf: 1, horiz: 1 });
});
test('weightFactors: unter Basislast kein Bonus', () => {
  assert.deepEqual(weightFactors(5, W), { auf: 1, horiz: 1 });
});
test('weightFactors: +25 kg ≈ Aufstieg ×1.53, horizontal ×1.125', () => {
  const f = weightFactors(33, W); // +25 kg
  assert.ok(Math.abs(f.auf - 1.531) < 1e-3);
  assert.ok(Math.abs(f.horiz - 1.125) < 1e-9);
});
test('weightFactors: schwere Last wirkt progressiv (60 kg stärker als linear)', () => {
  const f = weightFactors(60, W); // +52 kg
  assert.ok(f.auf > 2.0 && f.auf < 2.6);
});

// ---------- hoeheFactor ----------
const H = { schwelle: 2500, pctPer1000: 0.05, cap: 0.30 };
test('hoeheFactor: unter Schwelle = 1.0', () => assert.equal(hoeheFactor(2000, H), 1));
test('hoeheFactor: +5% je 1000 Hm über 2500', () =>
  assert.ok(Math.abs(hoeheFactor(3500, H) - 1.05) < 1e-9));
test('hoeheFactor: Deckel 30%', () => assert.ok(Math.abs(hoeheFactor(12000, H) - 1.30) < 1e-9));

// ---------- witterungFactor ----------
const WIT = { nebel: 1.15, naesse: 1.15, dunkelheit: 1.30 };
test('witterungFactor: leer = 1.0', () => assert.equal(witterungFactor([], WIT), 1));
test('witterungFactor: multiplikativ', () =>
  assert.ok(Math.abs(witterungFactor(['nebel', 'dunkelheit'], WIT) - 1.15 * 1.30) < 1e-9));

// ---------- Zeit-Helfer ----------
test('formatHM', () => {
  assert.equal(formatHM(6.3333), '6:20');
  assert.equal(formatHM(0), '0:00');
  assert.equal(formatHM(1.5), '1:30');
});
test('addHours', () => {
  assert.equal(addHours('07:00', 6.3333), '13:20');
  assert.equal(addHours('22:30', 4), '02:30');
});

// ---------- mergeConfig ----------
test('mergeConfig: override greift tief, Rest bleibt Default', () => {
  const c = mergeConfig(DEFAULTS, { weight: { basislast: 12 } });
  assert.equal(c.weight.basislast, 12);
  assert.equal(c.weight.pctPerKgAuf, 0.018);
  assert.equal(c.speeds.vAuf, 300);
});

// ---------- computeTour ----------
const baseInput = {
  hmAuf: 0, hmAb: 0, distAufKm: 0, distAbKm: 0, gewichtKg: 8, aktivitaet: 'wandern',
  schneeSpur: 'aper', gelaende: 'T1', witterung: [], wind: 'windstill', sicherung: 'kein',
  lawine: 'na', gruppe: 'solo', mittlereHoehe: 0, pauseAutoMinProStunde: 0, benanntePausen: [],
};

test('computeTour: DAV-Basis (Etappen) ohne Faktoren', () => {
  const r = computeTour({ ...baseInput, hmAuf: 1000, hmAb: 1000, distAufKm: 4, distAbKm: 4, mittlereHoehe: 1500 });
  assert.equal(r.nettoHM, '6:20');
});

test('computeTour: Beispiel Markus 1200/2500/4/6 → 10:15 (Auf 4:30, Ab 5:45)', () => {
  const r = computeTour({ ...baseInput, hmAuf: 1200, hmAb: 2500, distAufKm: 4, distAbKm: 6 });
  assert.equal(r.nettoHM, '10:15');
  assert.equal(r.aufstiegNettoHM, '4:30');
  assert.equal(r.abstiegNettoHM, '5:45');
});

test('computeTour: Skitour-Abfahrt ist schnell', () => {
  const r = computeTour({ ...baseInput, hmAb: 1500, aktivitaet: 'skitour', mittlereHoehe: 2000 });
  assert.equal(r.nettoHM, '1:00');
});

test('computeTour: Pausen & Ankunft', () => {
  const r = computeTour({
    ...baseInput, hmAuf: 600, hmAb: 600, distAufKm: 2, distAbKm: 2,
    pauseAutoMinProStunde: 5, benanntePausen: [{ name: 'Gipfel', dauerMin: 30 }], startzeit: '07:00',
  });
  assert.equal(r.nettoHM, '3:42');   // 2.25 + 1.45 = 3.7 h
  assert.equal(r.bruttoHM, '4:31');
  assert.equal(r.ankunft, '11:31');
});

test('computeTour: SAC-Preset ist schneller als DAV', () => {
  const dav = computeTour({ ...baseInput, hmAuf: 1200, useSac: false });
  const sac = computeTour({ ...baseInput, hmAuf: 1200, useSac: true });
  assert.ok(sac.netto < dav.netto);
});

test('computeTour: Wind/Sturm, Lawine, Sicherung als globale Faktoren', () => {
  const ref = computeTour({ ...baseInput, hmAuf: 1000, distAufKm: 2 });
  const sturm = computeTour({ ...baseInput, hmAuf: 1000, distAufKm: 2, wind: 'sturm' });
  const law = computeTour({ ...baseInput, hmAuf: 1000, distAufKm: 2, lawine: 's4' });
  const sich = computeTour({ ...baseInput, hmAuf: 1000, distAufKm: 2, sicherung: 'seillaengen' });
  assert.ok(Math.abs(sturm.netto / ref.netto - 1.30) < 1e-6);
  assert.ok(Math.abs(law.netto / ref.netto - 1.20) < 1e-6);
  assert.ok(Math.abs(sich.netto / ref.netto - 1.50) < 1e-6);
});

test('computeTour: Warnungen bei hoher Lawinenstufe und Sturm', () => {
  const r = computeTour({ ...baseInput, hmAuf: 500, distAufKm: 1, lawine: 's4', wind: 'sturm' });
  assert.equal(r.warnungen.length, 2);
});

// ---------- Etappen am Tag ----------
test('computeTour: Etappen am Tag werden summiert', () => {
  // Etappe 1 nur Aufstieg 1000/4, Etappe 2 nur Abstieg 1000/4 → wie 1000/1000/4/4
  const r = computeTour({
    ...baseInput, hmAuf: 1000, distAufKm: 4, hmAb: 0, distAbKm: 0,
    etappen: [{ name: 'Abfahrt', hmAuf: 0, distAufKm: 0, hmAb: 1000, distAbKm: 4 }],
  });
  assert.equal(r.nettoHM, '6:20');
  assert.equal(r.segmente.length, 2);
  assert.equal(r.aufstiegNettoHM, '3:50'); // 3.833 h
  assert.equal(r.abstiegNettoHM, '2:30');  // 2.5 h
});

test('computeTour: zwei identische Etappen verdoppeln die Gehzeit', () => {
  const eine = computeTour({ ...baseInput, hmAuf: 600, distAufKm: 2, hmAb: 600, distAbKm: 2 });
  const zwei = computeTour({
    ...baseInput, hmAuf: 600, distAufKm: 2, hmAb: 600, distAbKm: 2,
    etappen: [{ hmAuf: 600, distAufKm: 2, hmAb: 600, distAbKm: 2 }],
  });
  assert.ok(Math.abs(zwei.netto - 2 * eine.netto) < 1e-9);
  assert.equal(zwei.segmente.length, 2);
});

// ---------- Robustheit / Edge-Cases ----------
test('formatHM: nicht-endliche Werte zeigen Platzhalter statt 0:00', () => {
  assert.equal(formatHM(NaN), '–');
  assert.equal(formatHM(Infinity), '–');
});

test('computeTour: NaN-Gewicht vergiftet die Rechnung nicht', () => {
  const r = computeTour({ ...baseInput, hmAuf: 1000, distAufKm: 2, gewichtKg: NaN });
  const ref = computeTour({ ...baseInput, hmAuf: 1000, distAufKm: 2, gewichtKg: 8 });
  assert.ok(Number.isFinite(r.netto));
  assert.equal(r.nettoHM, ref.nettoHM); // NaN -> Basislast
});

test('computeTour: negative Eingaben werden auf 0 geklemmt', () => {
  const r = computeTour({ ...baseInput, hmAuf: -1000, distAufKm: -4, hmAb: 500, distAbKm: 2 });
  const ref = computeTour({ ...baseInput, hmAuf: 0, distAufKm: 0, hmAb: 500, distAbKm: 2 });
  assert.ok(r.netto >= 0);
  assert.equal(r.nettoHM, ref.nettoHM);
});

test('computeTour: Geschwindigkeit 0 fällt auf Default zurück (kein Infinity)', () => {
  const r = computeTour({ ...baseInput, hmAuf: 1200, config: { speeds: { vAuf: 0 } } });
  assert.ok(Number.isFinite(r.netto));
  assert.notEqual(r.nettoHM, '–');
});

test('computeTour: etappen als Nicht-Array wirft nicht', () => {
  const r = computeTour({ ...baseInput, hmAuf: 1000, distAufKm: 2, etappen: {} });
  assert.equal(r.segmente.length, 1);
  assert.ok(Number.isFinite(r.netto));
});
