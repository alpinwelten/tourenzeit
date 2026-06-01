import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  davKombination, weightFactors, hoeheFactor, witterungFactor,
  addHours, formatHM, DEFAULTS, mergeConfig, computeTour,
} from '../js/engine.mjs';

// ---------- davKombination ----------
test('davKombination: groesserer Wert + halber kleinerer', () => {
  // tVert = 1000/300 + 1000/500 = 5.3333 ; tHoriz = 8/4 = 2.0 -> 5.3333 + 1.0 = 6.3333
  assert.ok(Math.abs(davKombination(1000 / 300, 1000 / 500, 8 / 4) - 6.3333) < 1e-3);
});
test('davKombination: horizontal dominiert', () => {
  // tVert = 0.5 + 0.2 = 0.7 ; tHoriz = 3 -> 3 + 0.35 = 3.35
  assert.ok(Math.abs(davKombination(0.5, 0.2, 3) - 3.35) < 1e-9);
});

// ---------- weightFactors ----------
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

// ---------- hoeheFactor ----------
const H = { schwelle: 2500, pctPer1000: 0.05, cap: 0.30 };
test('hoeheFactor: unter Schwelle = 1.0', () => assert.equal(hoeheFactor(2000, H), 1));
test('hoeheFactor: +5% je 1000 Hm ueber 2500', () =>
  assert.ok(Math.abs(hoeheFactor(3500, H) - 1.05) < 1e-9));
test('hoeheFactor: Deckel 30%', () => assert.ok(Math.abs(hoeheFactor(12000, H) - 1.30) < 1e-9));

// ---------- witterungFactor ----------
const WIT = { nebel: 1.15, naesse: 1.20, dunkelheit: 1.30 };
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
  assert.equal(addHours('22:30', 4), '02:30'); // Tagesueberlauf
});

// ---------- mergeConfig ----------
test('mergeConfig: override greift tief, Rest bleibt Default', () => {
  const c = mergeConfig(DEFAULTS, { weight: { basislast: 12 } });
  assert.equal(c.weight.basislast, 12);
  assert.equal(c.weight.pctPerKgAuf, 0.02);
  assert.equal(c.speeds.vAuf, 300);
});

// ---------- computeTour ----------
const baseInput = {
  hmAuf: 0, hmAb: 0, distKm: 0, gewichtKg: 8, aktivitaet: 'wandern',
  schneeSpur: 'aper', gelaende: 'T1', witterung: [], gruppe: 'solo',
  mittlereHoehe: 0, pauseAutoMinProStunde: 0, benanntePausen: [],
};

test('computeTour: DAV-Basis (Golden) ohne Faktoren', () => {
  const r = computeTour({ ...baseInput, hmAuf: 1000, hmAb: 1000, distKm: 8, mittlereHoehe: 1500 });
  assert.equal(r.nettoHM, '6:20');
});

test('computeTour: Skitour-Abfahrt ist schnell', () => {
  const r = computeTour({ ...baseInput, hmAb: 1500, aktivitaet: 'skitour', mittlereHoehe: 2000 });
  // tAb = 1500/1500 = 1.0 ; tVert = 1.0 ; tHoriz = 0 -> 1.0
  assert.equal(r.nettoHM, '1:00');
});

test('computeTour: Pausen & Ankunft', () => {
  const r = computeTour({
    ...baseInput, hmAuf: 600, hmAb: 600, distKm: 4, mittlereHoehe: 1000,
    pauseAutoMinProStunde: 5, benanntePausen: [{ name: 'Gipfel', dauerMin: 30 }], startzeit: '07:00',
  });
  // tAuf=2, tAb=1.2, tHoriz=1 -> tVert=3.2 ; 3.2 + 0.5*1 = 3.7 netto
  assert.equal(r.nettoHM, '3:42');
  // pauseAuto = 3.7*5/60 = 0.30833 ; pauseBenannt = 0.5 ; brutto = 4.50833 -> 4:31
  assert.equal(r.bruttoHM, '4:31');
  assert.equal(r.ankunft, '11:31');
});

test('computeTour: Gewicht verlangsamt Aufstieg um Faktor 1.5 bei +25 kg', () => {
  const leicht = computeTour({ ...baseInput, hmAuf: 1000, gewichtKg: 8 });
  const schwer = computeTour({ ...baseInput, hmAuf: 1000, gewichtKg: 33 });
  assert.ok(Math.abs(schwer.netto / leicht.netto - 1.5) < 1e-6);
});

test('computeTour: SAC-Preset ist schneller als DAV', () => {
  const dav = computeTour({ ...baseInput, hmAuf: 1200, useSac: false });
  const sac = computeTour({ ...baseInput, hmAuf: 1200, useSac: true });
  assert.ok(sac.netto < dav.netto);
});

test('computeTour: Spuranlage im Tiefschnee verdoppelt den Aufstiegsanteil', () => {
  const spur = computeTour({ ...baseInput, hmAuf: 1000, schneeSpur: 'aper' });
  const tief = computeTour({ ...baseInput, hmAuf: 1000, schneeSpur: 'tiefschneeSpuranlage' });
  assert.ok(Math.abs(tief.netto / spur.netto - 2.0) < 1e-6);
});
