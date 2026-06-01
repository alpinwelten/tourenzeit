import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGpx, parseGpxPoints, haversineKm } from '../js/gpx.mjs';

const GPX = `<?xml version="1.0"?><gpx><trk><trkseg>
<trkpt lat="47.0000" lon="11.0000"><ele>1000</ele></trkpt>
<trkpt lat="47.0100" lon="11.0000"><ele>1300</ele></trkpt>
<trkpt lat="47.0200" lon="11.0000"><ele>1100</ele></trkpt>
</trkseg></trk></gpx>`;

test('parseGpxPoints: extrahiert lat/lon/ele (attributreihenfolge-tolerant)', () => {
  const pts = parseGpxPoints(GPX);
  assert.equal(pts.length, 3);
  assert.equal(pts[0].lat, 47.0);
  assert.equal(pts[1].ele, 1300);
});

test('parseGpxPoints: lon vor lat und fehlende Höhe', () => {
  const pts = parseGpxPoints('<gpx><trkpt lon="11.5" lat="47.5"/></gpx>');
  assert.equal(pts.length, 1);
  assert.equal(pts[0].lat, 47.5);
  assert.equal(pts[0].ele, null);
});

test('haversineKm: ~1.11 km für 0.01° Breite', () => {
  assert.ok(Math.abs(haversineKm(47.0, 11.0, 47.01, 11.0) - 1.112) < 0.02);
});

test('parseGpx: Hm auf/ab und getrennte Distanz', () => {
  const r = parseGpx(GPX);
  assert.equal(r.hmAuf, 300);
  assert.equal(r.hmAb, 200);
  assert.ok(r.distAufKm > 1.0 && r.distAufKm < 1.3);
  assert.ok(r.distAbKm > 1.0 && r.distAbKm < 1.3);
  assert.equal(r.punkte, 3);
});

test('parseGpx: leere/ungültige GPX -> Nullwerte, kein Wurf', () => {
  assert.deepEqual(parseGpx('<gpx></gpx>'), { hmAuf: 0, hmAb: 0, distAufKm: 0, distAbKm: 0, punkte: 0 });
  assert.deepEqual(parseGpx(''), { hmAuf: 0, hmAb: 0, distAufKm: 0, distAbKm: 0, punkte: 0 });
});

test('parseGpx: Höhenrauschen unter Schwelle wird ignoriert', () => {
  const noisy = `<gpx><trkseg>
  <trkpt lat="47.0" lon="11.0"><ele>1000</ele></trkpt>
  <trkpt lat="47.001" lon="11.0"><ele>1001</ele></trkpt>
  <trkpt lat="47.002" lon="11.0"><ele>1000.5</ele></trkpt>
  </trkseg></gpx>`;
  const r = parseGpx(noisy, 3);
  assert.equal(r.hmAuf, 0);
  assert.equal(r.hmAb, 0);
});
