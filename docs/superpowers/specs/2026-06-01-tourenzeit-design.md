# Tourenzeit — Design / Spec

**Datum:** 2026-06-01
**Autor:** Markus Schubert (alpinwelten) · erstellt mit Claude Code
**Status:** Freigegeben (Brainstorming abgeschlossen)

---

## 1. Zweck & Vision

Eine hochprofessionelle, installierbare Web-App (PWA) zur **Gehzeit- und Tourenzeit-Berechnung** für Bergtouren, angelehnt an den Gehzeit-Rechner von Bergfreunde (DAV-Methode), aber deutlich erweitert:

- **Rucksackgewicht** (5–60 kg) als Einflussgröße
- **Geländebedingungen** (Aktivität, Schnee, Spur, Geländeschwierigkeit, Witterung/Sicht, Gruppe, Höhenlage)
- **Pausenplanung** (automatisch + benannte Pausen) und **Ankunftszeit**

Zielgeräte: **iPhone / iPad**. Die App wird auf dem **Home-Bildschirm** abgelegt (eigenes Icon), läuft **offline ohne Empfang** und sieht **nativ-hochwertig** aus.

**Nicht-Ziele (v1):** Kein Konto/Login, keine Cloud-Synchronisation, keine Karten-/GPX-Integration, keine Mehrsprachigkeit (nur Deutsch; später nachrüstbar).

---

## 2. Technischer Ansatz

**Vanilla, build-free Progressive Web App** — HTML + CSS + ES-Module, kein Framework, kein Build-Step.

**Begründung:** Ein-Screen-Rechner, der jahrelang wartungsarm „einfach funktionieren" muss. Lädt blitzschnell, trivial offline-fähig, keine Dependency-Alterung, sofort auf GitHub Pages deploybar.

- Rechen-Logik strikt getrennt in ein **reines Modul `engine.mjs`** (keine DOM-Zugriffe) → testbar.
- Tests mit Node-Bordmitteln (`node:test`, `node --test`), keine externen Abhängigkeiten.
- UI-Verdrahtung in `ui.mjs`, Persistenz in `storage.mjs`.

---

## 3. Rechenkern (`engine.mjs`)

### 3.1 Basis-Gehzeit (DAV)

Eingaben: `hmAuf` (Hm), `hmAb` (Hm), `distKm` (km).
Geschwindigkeiten (Defaults, im Experten-Bereich editierbar):

| Größe | DAV-Default | SAC-Preset („Trainierte") |
|---|---|---|
| Aufstieg | 300 Hm/h | 400 Hm/h |
| Abstieg | 500 Hm/h | 800 Hm/h |
| Horizontal | 4 km/h | 4 km/h |

Komponentenzeiten (Stunden):
- `tAuf = hmAuf / vAuf`
- `tAb = hmAb / vAb`
- `tHoriz = distKm / vHoriz`

**DAV-Kombination:** der kleinere Wert wird halbiert und zum größeren addiert.
Standardannahme (Golden-Tests, s. u.):
```
tVertikal = tAuf + tAb
gehzeitBasis = max(tVertikal, tHoriz) + 0.5 * min(tVertikal, tHoriz)
```
> **Verifikation:** Die exakte DAV-Kombinationsvariante (welcher Teilwert halbiert wird) wird beim Bauen anhand **Referenzwerten aus dem Live-Rechner von Bergfreunde** als Golden-Tests abgesichert. Die Kombination ist eine einzelne, klar isolierte Funktion und damit leicht justierbar.

**Skitour-Sonderfall:** Im Modus *Skitour* ist der Abstieg eine Abfahrt → eigener, schneller Abfahrtswert (Default **1500 Hm/h**, editierbar) statt 500 Hm/h.

### 3.2 Faktormodell (transparent, kalibrierbar)

Zwei Stufen, jede Komponente bleibt in der Aufschlüsselung sichtbar:

**Stufe A — komponentenspezifische Multiplikatoren** (auf `tAuf` / `tAb` / `tHoriz` vor der Kombination):

| Faktor | Wirkt auf | Default (kalibrierbar) |
|---|---|---|
| **Rucksackgewicht** | Aufstieg (+horiz) | Basislast **8 kg** = 1,0; darüber **+2 %/kg** auf Aufstieg, **+0,5 %/kg** horizontal. Unter Basislast = 1,0 (kein Bonus). 60 kg ⇒ Aufstieg ≈ +104 %. |
| **Schnee × Spur** | Aufstieg + horiz | aper 1,00 · wenig+Spur 1,05 · viel+Spur 1,15 · viel+Spuranlage 1,60 · Tiefschnee+Spuranlage 2,00 |
| **Höhenlage** | Aufstieg | < 2.500 m = 1,0; darüber **+5 % je 1.000 Hm** mittlerer Höhe über 2.500 m, gedeckelt bei +30 % |

**Stufe B — globale Multiplikatoren** (auf die kombinierte Netto-Gehzeit):

| Faktor | Default (kalibrierbar) |
|---|---|
| **Aktivität** | Wandern 1,00 · Bergsteigen 1,05 · Skitour 1,00 (Abfahrtsmodell s. o.) |
| **Geländeschwierigkeit (SAC T1–T6)** | T1 1,00 · T2 1,05 · T3 1,15 · T4 1,30 · T5 1,50 · T6 1,80 |
| **Witterung / Sicht / Tageszeit** | Mehrfach kombinierbar: Nebel/schlechte Sicht ×1,15 · Nässe/Sturm ×1,20 · Dunkelheit (Stirnlampe) ×1,30 |
| **Gruppe / Kondition** | Solo/2er 1,00 · Gruppe 3–5 1,05 · Gruppe 6+ 1,15 · heterogen/erschöpft bis 1,25 |

Berechnung:
```
tAuf'   = tAuf  * fGewichtAuf * fSchneeSpur * fHoehe
tAb'    = tAb   * (Skitour ? 1 : fSchneeSpur_ab)
tHoriz' = tHoriz* fGewichtHoriz * fSchneeSpur
gehzeitBasis' = davKombination(tAuf', tAb', tHoriz')
gehzeitNetto  = gehzeitBasis' * fAktivität * fGelände * fWitterung * fGruppe
```
Alle Faktorwerte sind in den **App-Einstellungen** sichtbar und justierbar (localStorage). Standardwerte wie oben.

### 3.3 Pausen & Ankunftszeit

- **Auto-Pausen:** `pAuto` Minuten je Gehstunde (Default **5**, editierbar) ⇒ `pauseAuto = gehzeitNetto[h] * pAuto/60` (Stunden).
- **Benannte Pausen:** Liste von `{ name, dauerMin }` (z. B. Gipfel, Mittag, Fellwechsel) ⇒ `pauseBenannt = Σ dauerMin`.
- **Brutto-Tourdauer:** `brutto = gehzeitNetto + pauseAuto + pauseBenannt`.
- **Startzeit (optional):** `HH:MM` ⇒ **voraussichtliche Ankunft** = Startzeit + Brutto.

### 3.4 Ausgabe (Rückgabeobjekt der Engine)

```
{
  netto,                      // Std (Dezimal) und formatiert h:mm
  brutto,
  ankunft,                    // optional HH:MM
  aufschluesselung: {
    tAuf, tAb, tHoriz,        // roh
    tAufAdj, tAbAdj, tHorizAdj,
    gehzeitBasis,
    faktoren: { gewicht, schneeSpur, hoehe, aktivitaet, gelaende, witterung, gruppe },
    pauseAuto, pauseBenannt
  }
}
```

---

## 4. Eingaben & Bedienung (UI)

Mobil-first, **ein Screen**, iOS-nativer Look, dunkles Premium-Theme (Schiefer + Alpenrot-Akzent, passend zum Icon), große Tap-Flächen, Safe-Area-Insets, Live-Aktualisierung bei jeder Änderung.

### 4.1 Grundwerte (immer sichtbar) — einheitliches Auswahl-Element

Jeder Wert: **großer Zahlenwert + Minus/Plus-Stepper + Schieberegler**, Zahl **antippbar zur Direkteingabe** (kein Deckel — Extremwerte möglich).

| Wert | Schieberegler-Bereich | Schritt (±) | Direkteingabe |
|---|---|---|---|
| Aufstieg | 0 – 3.000 Hm | 50 Hm | beliebig |
| Abstieg | 0 – 3.000 Hm | 50 Hm | beliebig |
| Distanz | 0 – 50 km | 0,5 km | beliebig |
| Gewicht | 5 – 60 kg | 1 kg | – |

### 4.2 Aufklappbare Abschnitte

- **Bedingungen:** Aktivität (Wandern/Bergsteigen/Skitour) · Schneelage · Spur · Geländeschwierigkeit (T1–T6) · Witterung/Sicht/Tageszeit (Mehrfachauswahl) · Gruppe/Kondition · Höhenlage (mittlere Höhe der Tour).
- **Pausen:** Auto Min/Std · benannte Pausen hinzufügen/entfernen · Startzeit.
- **Experten:** Geschwindigkeiten (DAV/SAC-Preset, einzeln editierbar) · Skitour-Abfahrtswert · Kalibrierung aller Faktorwerte · „Zurücksetzen auf Standard".

### 4.3 Ergebnis-Karte

Große Anzeige **Netto-Gehzeit** und **Brutto-Tourdauer**, optional **Ankunft HH:MM**, plus aufklappbare **Aufschlüsselung** jeder Komponente und jedes Faktors.

### 4.4 Persistenz

Letzte Eingaben und alle Einstellungen/Kalibrierungen werden in **localStorage** gespeichert und beim Start wiederhergestellt.

---

## 5. PWA / Installierbarkeit / Offline

- `manifest.webmanifest`: `name "Tourenzeit"`, `short_name "Tourenzeit"`, `display: standalone`, `orientation: portrait`, `theme_color`/`background_color` (dunkel), Icons inkl. **maskable**.
- Apple-spezifisch: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon` in 180/167/152/120, optional `apple-touch-startup-image` (Splash).
- **Service Worker (`sw.js`):** Cache-first für die App-Shell (HTML/CSS/JS/Icons), versionierter Cache ⇒ **vollständig offline**. Update-Strategie: neue Version ersetzt Cache beim nächsten Laden.
- Pfade **subpfad-sicher** (App läuft unter `/tourenzeit/`): relative URLs, `start_url`/`scope` korrekt gesetzt.

### Icon

Stil **„Gipfel + Höhenprofil, dunkel-premium"**: stilisierter Berggrat mit aufsteigender Höhen-/Zeitlinie, dunkler Schiefer-Hintergrund, kräftiger Alpenrot/Orange-Akzent. Erzeugung per Skript `tools/generate-icons.mjs` (SVG-Quelle → PNGs in allen benötigten Größen). **Echte Entwürfe werden vor der Finalisierung zur Auswahl gezeigt.**

---

## 6. Hosting & Deployment

- Repo **`tourenzeit`** (öffentlich, GitHub-Account `alpinwelten`).
- **GitHub Pages** direkt aus `main` (Root) — kein Build nötig.
- Web-Adresse: **https://alpinwelten.github.io/tourenzeit/**
- Eigene Domain optional später nachrüstbar (CNAME).

---

## 7. Tests

- `test/engine.test.mjs` mit `node:test`:
  - Basis-DAV (mehrere Touren) inkl. **Golden-Tests gegen Bergfreunde-Referenzwerte**
  - Gewichtsskalierung (Basislast, +2 %/kg, 5/30/60 kg)
  - Schnee×Spur-Matrix, Höhenlage, Gelände, Witterung (multiplikativ), Gruppe
  - Skitour-Abfahrtsmodell
  - Pausen (auto + benannt), Brutto, Ankunftszeit
  - Rundungen/Formatierung h:mm
- Engine wird **testgetrieben** entwickelt (TDD), da sicherheitsrelevant (Tourenplanung).
- Manuelle Sichtprüfung der gebauten App auf iPhone-Viewport.

---

## 8. Projektstruktur

```
tourenzeit/
  index.html
  css/styles.css
  js/engine.mjs          # reine Rechen-Logik (kein DOM)
  js/ui.mjs              # DOM-Verdrahtung, Live-Update
  js/storage.mjs         # localStorage laden/speichern
  js/sw-register.mjs     # Service-Worker-Registrierung
  sw.js                  # Service Worker (offline)
  manifest.webmanifest
  icons/                 # generierte PNGs + SVG-Quelle
  test/engine.test.mjs   # node:test
  tools/generate-icons.mjs
  README.md
  docs/superpowers/specs/2026-06-01-tourenzeit-design.md
```

Lokaler Ordner: `~/tourenzeit`.

---

## 9. Offene Punkte / spätere Erweiterungen (nicht v1)

- Mehrsprachigkeit (DE/EN umschaltbar)
- GPX-Import / Höhenprofil-Auslesung
- Touren speichern/teilen
- Eigene Domain
