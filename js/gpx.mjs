// gpx.mjs — reine, testbare GPX-Auswertung (kein DOM, kein XML-Parser nötig).
// Extrahiert aus einem GPX-Track die Höhenmeter Auf/Ab und die horizontale
// Strecke getrennt nach Auf- und Abstiegsphase. Höhenrauschen wird per
// Schwellwert-Hysterese gefiltert.

export function parseGpxPoints(gpx) {
  const pts = [];
  const chunks = String(gpx).split(/<trkpt\b/i).slice(1);
  for (const c of chunks) {
    const lat = parseFloat((c.match(/\blat\s*=\s*"([\-0-9.]+)"/i) || [])[1]);
    const lon = parseFloat((c.match(/\blon\s*=\s*"([\-0-9.]+)"/i) || [])[1]);
    const eleM = c.match(/<ele>\s*([\-0-9.eE]+)\s*<\/ele>/i);
    const ele = eleM ? parseFloat(eleM[1]) : NaN;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      pts.push({ lat, lon, ele: Number.isFinite(ele) ? ele : null });
    }
  }
  return pts;
}

// Großkreis-Distanz in km
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function gpxStats(pts, thresholdM = 3) {
  let hmAuf = 0, hmAb = 0, distAuf = 0, distAb = 0;
  let ref = null, phase = 'auf';
  for (const p of pts) { if (Number.isFinite(p.ele)) { ref = p.ele; break; } }

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const d = haversineKm(a.lat, a.lon, b.lat, b.lon);
    if (Number.isFinite(b.ele) && Number.isFinite(ref)) {
      if (b.ele >= ref + thresholdM) { hmAuf += b.ele - ref; ref = b.ele; phase = 'auf'; }
      else if (b.ele <= ref - thresholdM) { hmAb += ref - b.ele; ref = b.ele; phase = 'ab'; }
    }
    if (Number.isFinite(d)) (phase === 'ab' ? (distAb += d) : (distAuf += d));
  }

  const r1 = (v) => Math.round(v * 10) / 10;
  return { hmAuf: Math.round(hmAuf), hmAb: Math.round(hmAb), distAufKm: r1(distAuf), distAbKm: r1(distAb), punkte: pts.length };
}

export function parseGpx(gpx, thresholdM = 3) {
  return gpxStats(parseGpxPoints(gpx), thresholdM);
}
