// ui.mjs — DOM-Verdrahtung: liest Eingaben, ruft computeTour, rendert Ergebnis.
import { computeTour, DEFAULTS, mergeConfig, formatHM } from './engine.mjs';
import { parseGpx } from './gpx.mjs';
import { loadState, saveState, clearState } from './storage.mjs';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const num = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (v) => Math.round(v * 100) / 100;
const disp = (v) => round2(v).toString();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const DEFAULT_STATE = {
  hmAuf: 1000, distAufKm: 4, hmAb: 1000, distAbKm: 4, gewichtKg: 12,
  aktivitaet: 'wandern', schneeSpur: 'aper', lawine: 'na', gelaende: 'T1',
  sicherung: 'kein', witterung: [], wind: 'windstill', gruppe: 'solo', mittlereHoehe: 1500,
  etappen: [],
  pauseAutoMinProStunde: 5, benanntePausen: [], startzeit: '', useSac: false, config: {},
};

let state = loadState(DEFAULT_STATE);

function setCfg(section, key, value) {
  state.config = state.config || {};
  state.config[section] = { ...(state.config[section] || {}), [key]: value };
}
function effConfig() { return mergeConfig(DEFAULTS, state.config || {}); }

// ---------- Grundwert-Controls ----------
const fieldEls = {};
$$('.field').forEach((box) => {
  const field = box.dataset.field;
  if (!field) return; // Parameter-Felder (data-cfg) werden separat verdrahtet
  const min = num(box.dataset.min);
  const step = num(box.dataset.step) || 1;
  const valInput = $('.val', box);
  const slider = $('.slider', box);
  fieldEls[field] = { box, min, step, valInput, slider };

  const apply = (v, fromSlider) => {
    state[field] = v;
    if (!fromSlider) slider.value = v;
    valInput.value = disp(v);
    recompute();
  };
  slider.addEventListener('input', () => apply(num(slider.value), true));
  valInput.addEventListener('input', () => { state[field] = num(valInput.value); slider.value = state[field]; recompute(); });
  valInput.addEventListener('blur', () => { valInput.value = disp(state[field]); });
  $$('.step', box).forEach((btn) => btn.addEventListener('click', () => {
    let v = round2(num(state[field]) + num(btn.dataset.dir) * step);
    if (v < min) v = min;
    apply(v, false);
  }));
});
function initFields() {
  for (const field in fieldEls) {
    fieldEls[field].valInput.value = disp(state[field]);
    fieldEls[field].slider.value = state[field];
  }
}

// ---------- Segmented / Toggles ----------
$$('.segmented').forEach((group) => {
  const key = group.dataset.stateKey;
  const multi = group.classList.contains('toggles');
  $$('button', group).forEach((btn) => btn.addEventListener('click', () => {
    const value = btn.dataset.value;
    if (multi) {
      const set = new Set(state[key] || []);
      set.has(value) ? set.delete(value) : set.add(value);
      state[key] = [...set];
    } else {
      state[key] = value;
    }
    syncSegmented(group);
    recompute();
  }));
});
function syncSegmented(group) {
  const key = group.dataset.stateKey;
  const multi = group.classList.contains('toggles');
  $$('button', group).forEach((btn) => {
    const on = multi ? (state[key] || []).includes(btn.dataset.value) : state[key] === btn.dataset.value;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

// ---------- Selects & einfache Inputs ----------
function bindSelect(id, key) {
  const el = $('#' + id);
  el.addEventListener('change', () => { state[key] = el.value; recompute(); });
}
function bindNumber(id, key) {
  const el = $('#' + id);
  el.addEventListener('input', () => { state[key] = num(el.value); recompute(); });
}
['schneeSpur', 'lawine', 'sicherung', 'wind', 'gruppe'].forEach((id) => bindSelect(id, id));
bindNumber('mittlereHoehe', 'mittlereHoehe');
bindNumber('pauseAuto', 'pauseAutoMinProStunde');
$('#startzeit').addEventListener('input', () => { state.startzeit = $('#startzeit').value; recompute(); });

// ---------- Pausen-Liste ----------
const pausenList = $('#pausenList');
function renderPausen() {
  pausenList.innerHTML = '';
  (state.benanntePausen || []).forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'pause-item';
    row.innerHTML =
      `<input class="p-name" type="text" placeholder="Pause" value="${esc(p.name || '')}" />` +
      `<input class="p-min" type="number" inputmode="numeric" value="${num(p.dauerMin)}" />` +
      `<button class="pause-del" type="button" aria-label="entfernen">×</button>`;
    $('.p-name', row).addEventListener('input', (e) => { state.benanntePausen[i].name = e.target.value; saveState(state); });
    $('.p-min', row).addEventListener('input', (e) => { state.benanntePausen[i].dauerMin = num(e.target.value); recompute(); });
    $('.pause-del', row).addEventListener('click', () => { state.benanntePausen.splice(i, 1); renderPausen(); recompute(); });
    pausenList.appendChild(row);
  });
}
$('#addPause').addEventListener('click', () => {
  state.benanntePausen = state.benanntePausen || [];
  state.benanntePausen.push({ name: 'Pause', dauerMin: 15 });
  renderPausen();
  recompute();
});

// ---------- Etappen am Tag ----------
const etappenList = $('#etappenList');
const eNum = [
  { k: 'hmAuf', label: 'Aufstieg', unit: 'Hm' },
  { k: 'distAufKm', label: 'Strecke', unit: 'km' },
  { k: 'hmAb', label: 'Abstieg', unit: 'Hm' },
  { k: 'distAbKm', label: 'Strecke', unit: 'km' },
];
function renderEtappen() {
  etappenList.innerHTML = '';
  (state.etappen || []).forEach((e, i) => {
    const item = document.createElement('div');
    item.className = 'etappe-item';
    const grid = eNum.map((f) =>
      `<label class="e-field"><span>${f.label}</span><span class="field-value"><input class="e-${f.k}" type="number" inputmode="numeric" value="${num(e[f.k])}" /><span class="unit">${f.unit}</span></span></label>`
    ).join('');
    item.innerHTML =
      `<div class="etappe-head"><input class="e-name" type="text" placeholder="Etappe ${i + 2}" value="${esc(e.name || '')}" />` +
      `<button class="etappe-del" type="button" aria-label="Etappe entfernen">×</button></div>` +
      `<div class="etappe-grid">${grid}</div>`;
    $('.e-name', item).addEventListener('input', (ev) => { state.etappen[i].name = ev.target.value; saveState(state); updateEtappenBadge(); });
    eNum.forEach((f) => $('.e-' + f.k, item).addEventListener('input', (ev) => { state.etappen[i][f.k] = num(ev.target.value); recompute(); }));
    $('.etappe-del', item).addEventListener('click', () => { state.etappen.splice(i, 1); renderEtappen(); recompute(); });
    etappenList.appendChild(item);
  });
  updateEtappenBadge();
}
function updateEtappenBadge() {
  const n = (state.etappen || []).length;
  $('#etappenCount').textContent = n ? `${n + 1} Etappen` : '';
}
$('#addEtappe').addEventListener('click', () => {
  state.etappen = state.etappen || [];
  state.etappen.push({ name: '', hmAuf: 0, distAufKm: 0, hmAb: 0, distAbKm: 0 });
  renderEtappen();
  recompute();
});

// ---------- GPX-Import ----------
$('#gpxBtn').addEventListener('click', () => $('#gpxFile').click());
$('#gpxFile').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = ''; // erlaubt erneuten Import derselben Datei
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let r = null;
    try { r = parseGpx(String(reader.result)); } catch { /* fehlerhafte Datei */ }
    if (!r || !r.punkte) { showGpxNote('Keine Trackpunkte im GPX gefunden.', true); return; }
    state.hmAuf = r.hmAuf; state.hmAb = r.hmAb; state.distAufKm = r.distAufKm; state.distAbKm = r.distAbKm;
    initFields();
    recompute();
    showGpxNote(`Importiert: ↑ ${r.hmAuf} Hm · ${r.distAufKm} km · ↓ ${r.hmAb} Hm · ${r.distAbKm} km`, false);
  };
  reader.onerror = () => showGpxNote('Datei konnte nicht gelesen werden.', true);
  reader.readAsText(file);
});
function showGpxNote(msg, isError) {
  const el = $('#gpxNote');
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
}

// ---------- Experten: Parameter als Auswahl-Controls (Stepper + Slider) ----------
const useSac = $('#useSac');
const SAC_LOCK = ['speeds.vAuf', 'speeds.vAb', 'speeds.vHoriz'];
const paramBoxes = [];
const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

$$('.field[data-cfg]').forEach((box) => {
  const path = box.dataset.cfg;
  const [sec, key] = path.split('.');
  const min = num(box.dataset.min);
  const max = num(box.dataset.max);
  const step = num(box.dataset.step) || 1;
  const scale = num(box.dataset.scale) || 1;
  const valInput = $('.val', box);
  const slider = $('.slider', box);
  slider.min = min; slider.max = max; slider.step = step;

  const show = (display) => { valInput.value = disp(display); slider.value = display; };
  const apply = (display) => { setCfg(sec, key, display / scale); recompute(); };

  slider.addEventListener('input', () => { const v = num(slider.value); valInput.value = disp(v); apply(v); });
  valInput.addEventListener('input', () => { const v = num(valInput.value); slider.value = v; apply(v); });
  valInput.addEventListener('blur', () => { show(clamp(num(valInput.value), min, max)); });
  $$('.step', box).forEach((btn) => btn.addEventListener('click', () => {
    const v = clamp(round2(num(valInput.value) + num(btn.dataset.dir) * step), min, max);
    show(v); apply(v);
  }));

  paramBoxes.push({ box, path, sec, key, scale, valInput, slider, show });
});

function updateSacLock() {
  const off = !!state.useSac;
  paramBoxes.forEach((p) => {
    if (!SAC_LOCK.includes(p.path)) return;
    p.box.classList.toggle('locked', off);
    p.valInput.disabled = off;
    p.slider.disabled = off;
    $$('.step', p.box).forEach((b) => { b.disabled = off; });
  });
}

useSac.addEventListener('change', () => { state.useSac = useSac.checked; updateSacLock(); recompute(); });
$('#reset').addEventListener('click', () => { clearState(); location.reload(); });

function initControls() {
  ['schneeSpur', 'lawine', 'sicherung', 'wind', 'gruppe'].forEach((id) => { $('#' + id).value = state[id]; });
  $('#mittlereHoehe').value = state.mittlereHoehe;
  $('#pauseAuto').value = state.pauseAutoMinProStunde;
  $('#startzeit').value = state.startzeit || '';
  useSac.checked = !!state.useSac;
  const c = effConfig();
  paramBoxes.forEach((p) => p.show(round2(c[p.sec][p.key] * p.scale)));
  updateSacLock();
  $$('.segmented').forEach(syncSegmented);
}

// ---------- Berechnung & Ausgabe ----------
const FAKTOR_LABEL = {
  gewichtAuf: 'Gewicht (Aufstieg)', schneeSpur: 'Schnee / Spur', hoehe: 'Höhenlage',
  aktivitaet: 'Aktivität', gelaende: 'Gelände', witterung: 'Witterung', wind: 'Wind / Kälte',
  sicherung: 'Trittsicherheit / Material', lawine: 'Lawine', gruppe: 'Gruppe',
};

function buildInput() {
  return {
    hmAuf: num(state.hmAuf), hmAb: num(state.hmAb),
    distAufKm: num(state.distAufKm), distAbKm: num(state.distAbKm),
    gewichtKg: num(state.gewichtKg),
    aktivitaet: state.aktivitaet, schneeSpur: state.schneeSpur, gelaende: state.gelaende,
    witterung: state.witterung, wind: state.wind, sicherung: state.sicherung, lawine: state.lawine,
    gruppe: state.gruppe, mittlereHoehe: num(state.mittlereHoehe), etappen: state.etappen || [],
    pauseAutoMinProStunde: num(state.pauseAutoMinProStunde), benanntePausen: state.benanntePausen,
    startzeit: state.startzeit || null, useSac: !!state.useSac, config: state.config || {},
  };
}

function recompute() {
  const r = computeTour(buildInput());
  $('#netto').textContent = r.nettoHM;
  $('#brutto').textContent = r.bruttoHM;
  const ankunftRow = $('#ankunftRow');
  if (r.ankunft) { ankunftRow.hidden = false; $('#ankunft').textContent = r.ankunft; }
  else ankunftRow.hidden = true;

  renderBreakdown(r);
  renderSummary(r);
  renderWarnungen(r);
  saveState(state);
}

function bdRow(label, value) { return `<div class="bd-row"><span>${label}</span><strong>${value}</strong></div>`; }

function renderBreakdown(r) {
  const a = r.aufschluesselung;
  const f = a.faktoren;
  let html = '<div class="bd-head">Gehzeit (vor globalen Faktoren)</div>';
  html += bdRow('Aufstieg gesamt', formatHM(a.aufstiegZeit));
  html += bdRow('Abstieg gesamt', formatHM(a.abstiegZeit));
  html += bdRow('Gehzeit (Basis)', formatHM(a.gehzeitBasis));

  html += '<div class="bd-head">Globale Faktoren</div>';
  for (const k of ['gewichtAuf', 'schneeSpur', 'hoehe', 'aktivitaet', 'gelaende', 'witterung', 'wind', 'sicherung', 'lawine', 'gruppe']) {
    if (f[k] !== undefined) html += bdRow(FAKTOR_LABEL[k], '×' + f[k].toFixed(2));
  }
  html += '<div class="bd-head">Pausen</div>';
  html += bdRow('Automatisch', r.pauseAutoHM);
  html += bdRow('Geplant', r.pauseBenanntHM);
  $('#breakdownBody').innerHTML = html;
}

function legRow(name, detail, time) {
  return `<div class="sum-leg"><div><div class="leg-name">${name}</div><div class="leg-detail">${detail}</div></div><div class="leg-time">${time}</div></div>`;
}

function renderSummary(r) {
  const a = r.aufschluesselung;
  const pauseGesamt = formatHM(a.pauseAuto + a.pauseBenannt);
  const c = effConfig();
  const vAuf = state.useSac ? c.sac.vAuf : c.speeds.vAuf;
  const vAb = state.aktivitaet === 'skitour' ? c.speeds.vSki : (state.useSac ? c.sac.vAb : c.speeds.vAb);
  const vHoriz = state.useSac ? c.sac.vHoriz : c.speeds.vHoriz;
  const preset = state.useSac ? 'SAC' : 'DAV';

  let html = '';
  if (r.segmente.length > 1) {
    r.segmente.forEach((s, i) => {
      const name = s.name || `Etappe ${i + 1}`;
      const detail = `↑ ${disp(s.hmAuf)} Hm · ${disp(s.distAufKm)} km · ↓ ${disp(s.hmAb)} Hm · ${disp(s.distAbKm)} km`;
      html += legRow(esc(name), detail, s.segNettoHM);
    });
    html += legRow('Auf-/Abstieg gesamt', `↑ ${disp(r.hmAufTotal)} Hm · ↓ ${disp(r.hmAbTotal)} Hm`, `${r.aufstiegNettoHM} / ${r.abstiegNettoHM}`);
    html += legRow('Gehzeit (netto)', 'alle Etappen', r.nettoHM);
  } else {
    html += legRow('Aufstieg', `${disp(r.hmAufTotal)} Hm · ${disp(r.distAufTotal)} km`, r.aufstiegNettoHM);
    html += legRow('Abstieg', `${disp(r.hmAbTotal)} Hm · ${disp(r.distAbTotal)} km`, r.abstiegNettoHM);
    html += legRow('Gehzeit (netto)', 'Auf- + Abstieg', r.nettoHM);
  }
  html += legRow('Pausen', `${num(state.pauseAutoMinProStunde)} Min/Std + geplant`, pauseGesamt);
  html += `<div class="sum-total"><div class="leg-name">Tourdauer</div><div class="leg-time">${r.bruttoHM}</div></div>`;
  if (r.ankunft) html += legRow('Ankunft', `Start ${state.startzeit} Uhr`, r.ankunft);
  html += `<div class="sum-meta">Tempo (${preset}): Aufstieg ${vAuf} Hm/h · Abstieg ${vAb} Hm/h · Horizontal ${vHoriz} km/h · Gewicht ${disp(state.gewichtKg)} kg</div>`;
  $('#summaryBody').innerHTML = html;
}

function renderWarnungen(r) {
  const box = $('#warnungen');
  if (!r.warnungen || !r.warnungen.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = r.warnungen.map((w) => `<div class="warn">${esc(w)}</div>`).join('');
}

// ---------- Start ----------
initFields();
initControls();
renderPausen();
renderEtappen();
recompute();
