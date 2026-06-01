// ui.mjs — DOM-Verdrahtung: liest Eingaben, ruft computeTour, rendert Ergebnis.
import { computeTour, DEFAULTS, mergeConfig, formatHM } from './engine.mjs';
import { loadState, saveState, clearState } from './storage.mjs';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const num = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (v) => Math.round(v * 100) / 100;
const disp = (v) => round2(v).toString();

const DEFAULT_STATE = {
  hmAuf: 1000, hmAb: 1000, distKm: 8, gewichtKg: 12,
  aktivitaet: 'wandern', schneeSpur: 'aper', gelaende: 'T1',
  witterung: [], gruppe: 'solo', mittlereHoehe: 1500,
  pauseAutoMinProStunde: 5, benanntePausen: [], startzeit: '', useSac: false,
  config: {},
};

let state = loadState(DEFAULT_STATE);

// ---------- Helfer: Config tief setzen ----------
function setCfg(section, key, value) {
  state.config = state.config || {};
  state.config[section] = { ...(state.config[section] || {}), [key]: value };
}
function effConfig() { return mergeConfig(DEFAULTS, state.config || {}); }

// ---------- Grundwert-Controls ----------
const fieldEls = {};
$$('.field').forEach((box) => {
  const field = box.dataset.field;
  const min = num(box.dataset.min);
  const step = num(box.dataset.step) || 1;
  const valInput = $('.val', box);
  const slider = $('.slider', box);
  fieldEls[field] = { box, min, step, valInput, slider };

  const apply = (v, fromSlider) => {
    state[field] = v;
    if (!fromSlider) slider.value = v;            // Browser klemmt Slider auf [min,max]
    valInput.value = disp(v);
    recompute();
  };

  slider.addEventListener('input', () => apply(num(slider.value), true));
  valInput.addEventListener('input', () => { state[field] = num(valInput.value); slider.value = state[field]; recompute(); });
  valInput.addEventListener('blur', () => { valInput.value = disp(state[field]); });
  $$('.step', box).forEach((btn) => btn.addEventListener('click', () => {
    const dir = num(btn.dataset.dir);
    let v = round2(num(state[field]) + dir * step);
    if (v < min) v = min;
    apply(v, false);
  }));
});

function initFields() {
  for (const field in fieldEls) {
    const { valInput, slider } = fieldEls[field];
    valInput.value = disp(state[field]);
    slider.value = state[field];
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
function bindNumber(id, key, transform = (v) => v) {
  const el = $('#' + id);
  el.addEventListener('input', () => { state[key] = transform(num(el.value)); recompute(); });
}
bindSelect('schneeSpur', 'schneeSpur');
bindSelect('gruppe', 'gruppe');
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
      `<input class="p-name" type="text" placeholder="Pause" value="${(p.name || '').replace(/"/g, '&quot;')}" />` +
      `<input class="p-min" type="number" inputmode="numeric" value="${num(p.dauerMin)}" /> ` +
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

// ---------- Experten ----------
const useSac = $('#useSac');
const sacLocked = ['vAuf', 'vAb', 'vHoriz'];
useSac.addEventListener('change', () => {
  state.useSac = useSac.checked;
  sacLocked.forEach((id) => { $('#' + id).disabled = useSac.checked; });
  recompute();
});
$('#vAuf').addEventListener('input', () => { setCfg('speeds', 'vAuf', num($('#vAuf').value)); recompute(); });
$('#vAb').addEventListener('input', () => { setCfg('speeds', 'vAb', num($('#vAb').value)); recompute(); });
$('#vHoriz').addEventListener('input', () => { setCfg('speeds', 'vHoriz', num($('#vHoriz').value)); recompute(); });
$('#vSki').addEventListener('input', () => { setCfg('speeds', 'vSki', num($('#vSki').value)); recompute(); });
$('#basislast').addEventListener('input', () => { setCfg('weight', 'basislast', num($('#basislast').value)); recompute(); });
$('#pctAuf').addEventListener('input', () => { setCfg('weight', 'pctPerKgAuf', num($('#pctAuf').value) / 100); recompute(); });
$('#pctHoriz').addEventListener('input', () => { setCfg('weight', 'pctPerKgHoriz', num($('#pctHoriz').value) / 100); recompute(); });
$('#reset').addEventListener('click', () => { clearState(); location.reload(); });

function initControls() {
  $('#schneeSpur').value = state.schneeSpur;
  $('#gruppe').value = state.gruppe;
  $('#mittlereHoehe').value = state.mittlereHoehe;
  $('#pauseAuto').value = state.pauseAutoMinProStunde;
  $('#startzeit').value = state.startzeit || '';
  useSac.checked = !!state.useSac;
  const c = effConfig();
  $('#vAuf').value = c.speeds.vAuf;
  $('#vAb').value = c.speeds.vAb;
  $('#vHoriz').value = c.speeds.vHoriz;
  $('#vSki').value = c.speeds.vSki;
  $('#basislast').value = c.weight.basislast;
  $('#pctAuf').value = round2(c.weight.pctPerKgAuf * 100);
  $('#pctHoriz').value = round2(c.weight.pctPerKgHoriz * 100);
  sacLocked.forEach((id) => { $('#' + id).disabled = !!state.useSac; });
  $$('.segmented').forEach(syncSegmented);
}

// ---------- Berechnung & Ausgabe ----------
const FAKTOR_LABEL = {
  gewichtAuf: 'Gewicht (Aufstieg)', schneeSpur: 'Schnee / Spur', hoehe: 'Höhenlage',
  aktivitaet: 'Aktivität', gelaende: 'Gelände', witterung: 'Witterung', gruppe: 'Gruppe',
};

function recompute() {
  const r = computeTour({
    hmAuf: num(state.hmAuf), hmAb: num(state.hmAb), distKm: num(state.distKm), gewichtKg: num(state.gewichtKg),
    aktivitaet: state.aktivitaet, schneeSpur: state.schneeSpur, gelaende: state.gelaende,
    witterung: state.witterung, gruppe: state.gruppe, mittlereHoehe: num(state.mittlereHoehe),
    pauseAutoMinProStunde: num(state.pauseAutoMinProStunde), benanntePausen: state.benanntePausen,
    startzeit: state.startzeit || null, useSac: !!state.useSac, config: state.config || {},
  });

  $('#netto').textContent = r.nettoHM;
  $('#brutto').textContent = r.bruttoHM;
  const ankunftRow = $('#ankunftRow');
  if (r.ankunft) { ankunftRow.hidden = false; $('#ankunft').textContent = r.ankunft; }
  else ankunftRow.hidden = true;

  renderBreakdown(r);
  saveState(state);
}

function bdRow(label, value) { return `<div class="bd-row"><span>${label}</span><strong>${value}</strong></div>`; }

function renderBreakdown(r) {
  const a = r.aufschluesselung;
  const f = a.faktoren;
  let html = '<div class="bd-head">Komponenten (roh → mit Faktoren)</div>';
  html += bdRow('Aufstieg', `${formatHM(a.tAuf)} → ${formatHM(a.tAufAdj)}`);
  html += bdRow('Abstieg', `${formatHM(a.tAb)} → ${formatHM(a.tAbAdj)}`);
  html += bdRow('Horizontal', `${formatHM(a.tHoriz)} → ${formatHM(a.tHorizAdj)}`);
  html += bdRow('Gehzeit (kombiniert)', formatHM(a.gehzeitBasis));

  html += '<div class="bd-head">Globale Faktoren</div>';
  const keys = ['gewichtAuf', 'schneeSpur', 'hoehe', 'aktivitaet', 'gelaende', 'witterung', 'gruppe'];
  for (const k of keys) html += bdRow(FAKTOR_LABEL[k], '×' + f[k].toFixed(2));

  html += '<div class="bd-head">Pausen</div>';
  html += bdRow('Automatisch', r.pauseAutoHM);
  html += bdRow('Geplant', r.pauseBenanntHM);

  $('#breakdownBody').innerHTML = html;
}

// ---------- Start ----------
initFields();
initControls();
renderPausen();
recompute();
