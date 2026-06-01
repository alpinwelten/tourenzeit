export const meta = {
  name: 'tourenzeit-review',
  description: 'Adversariale Review des Etappen-Umbaus (Engine, UI, PWA) vor dem Deploy',
  phases: [{ title: 'Review', detail: 'drei Dimensionen parallel' }],
}

const REPO = '/Users/markusschubert/tourenzeit'

const SCHEMA = {
  type: 'object',
  required: ['dimension', 'findings'],
  properties: {
    dimension: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'file', 'issue', 'suggestion'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
          file: { type: 'string' },
          location: { type: 'string' },
          issue: { type: 'string' },
          suggestion: { type: 'string' },
        },
      },
    },
    summary: { type: 'string' },
  },
}

const common = `Du reviewst eine Vanilla-JS-PWA unter ${REPO} (Gehzeit-Rechner "Tourenzeit"). Gerade wurde eingebaut: getrennte Auf-/Abstiegsdistanz und "Etappen am Tag" (mehrere Auf-/Abstiege; Werte oben = Etappe 1, weitere in input.etappen[]). Lies die relevanten Dateien selbst (Read/Grep). Melde NUR echte, konkrete Probleme mit Datei+Stelle. Keine Stilmeinungen ohne Substanz. Wenn alles in Ordnung ist, gib eine leere findings-Liste zurück.`

const dims = [
  {
    key: 'engine',
    prompt: `${common}\n\nDIMENSION: Rechenkern-Korrektheit & Edge-Cases. Lies js/engine.mjs und test/engine.test.mjs. Prüfe: (1) computeTour bei fehlenden/teilweisen input.etappen, leeren Arrays, NaN/negativen/sehr großen Werten, Geschwindigkeit 0 (Division durch 0 → Infinity?). (2) Stimmt die Etappen-Summierung (Summe der davLeg-Etappen) methodisch? (3) Werden globale Faktoren korrekt auf alle Etappen verteilt und nicht doppelt? (4) Skitour-Abfahrt pro Etappe korrekt? (5) Gewichtsmodell linear+progressiv plausibel? (6) Decken die Tests die Mehr-Etappen-Logik ab; fehlen Fälle? Gib für jedes Problem severity/file/location/issue/suggestion.`,
  },
  {
    key: 'ui',
    prompt: `${common}\n\nDIMENSION: UI-Verdrahtung & Konsistenz. Lies js/ui.mjs, index.html, js/storage.mjs. Prüfe: (1) Hat JEDER \$('#id')-Zugriff ein passendes Element in index.html (z.B. #etappenList, #etappenCount, #addEtappe, #summaryBody, #warnungen)? (2) Passt renderBreakdown zur NEUEN aufschluesselung-Struktur (keine Referenz auf entfernte Felder wie tAuf/tHorizAuf)? (3) renderSummary für 1 vs. mehrere Etappen korrekt? (4) State-Migration: alter localStorage (tourenzeit.v2 ohne 'etappen') → bekommt etappen:[] via Fallback? Bricht etwas, wenn state.etappen fehlt? (5) Event-Listener-Indizes nach splice (Entfernen) korrekt (kein veralteter Closure-Index)? (6) esc()/XSS bei Etappen-Namen. Gib konkrete Funde.`,
  },
  {
    key: 'pwa',
    prompt: `${common}\n\nDIMENSION: PWA/Deploy/Offline. Lies sw.js, manifest.webmanifest, index.html (head). Prüfe: (1) Wurde der Service-Worker-CACHE-Name erhöht (v3), damit Nutzer die neue Version bekommen und nicht die alte aus dem Cache? (2) Sind alle ausgelieferten Assets relativ (subpfad-sicher unter /tourenzeit/)? (3) Cachet sw.js die richtigen Dateien; bricht ein fehlendes Asset die Installation? (4) Stimmen die Icon-/Manifest-Verweise noch? Gib konkrete Funde.`,
  },
]

const results = await parallel(dims.map((d) => () =>
  agent(d.prompt, { label: `review:${d.key}`, phase: 'Review', schema: SCHEMA })
))

return results.filter(Boolean)
