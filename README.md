# Tourenzeit

Eine installierbare, **offline-fähige Web-App** zur Berechnung von **Gehzeit und Tourdauer** für Bergtouren – nach der **DAV-Methode**, erweitert um **Rucksackgewicht**, **Gelände-/Schnee-/Witterungsbedingungen** und **Pausenplanung**.

**Live:** https://alpinwelten.github.io/tourenzeit/

Optimiert für **iPhone & iPad**: zum Home-Bildschirm hinzufügen, eigenes Icon, läuft **ohne Internet** (z. B. am Berg).

---

## Berechnungsmethode

**Basis (DAV):** Aufstieg 300 Hm/h · Abstieg 500 Hm/h · Horizontal 4 km/h.
Die vertikale Gesamtzeit (Auf + Ab) und die horizontale Zeit werden kombiniert: der **kleinere Wert wird halbiert und zum größeren addiert**. Optional **SAC-Geschwindigkeiten** (400/800 Hm/h) für Trainierte.

**Erweiterungen (alle in den Einstellungen kalibrierbar):**

- **Rucksackgewicht (5–60 kg):** ab einer Basislast (Standard 8 kg) verlangsamt jedes Kilo den Aufstieg (Standard +2 %/kg) und die Horizontalstrecke (+0,5 %/kg).
- **Aktivität:** Wandern · Bergsteigen · Skitour (im Skitour-Modus zählt der Abstieg als schnelle Abfahrt).
- **Schnee & Spur:** von „aper" bis „Tiefschnee, Spuranlage nötig" (bis ×2,0).
- **Geländeschwierigkeit:** SAC-Wanderskala T1–T6.
- **Witterung & Sicht:** Nebel, Nässe/Sturm, Dunkelheit (kombinierbar).
- **Gruppe & Kondition** sowie **Höhenlage** (dünne Luft über 2.500 m).

**Pausen:** automatisch (Standard 5 Min/Std) **plus** frei benannte Pausen (Gipfel, Mittag, Fellwechsel …). Mit optionaler **Startzeit** wird die **voraussichtliche Ankunft** berechnet.

> Hinweis: **Planungshilfe ohne Gewähr.** Tatsächliche Zeiten hängen von Tagesform, Verhältnissen und Entscheidungen vor Ort ab.

---

## Auf dem iPhone/iPad zum Home-Bildschirm hinzufügen

1. Die Live-URL in **Safari** öffnen.
2. **Teilen-Symbol** (Quadrat mit Pfeil) antippen.
3. **„Zum Home-Bildschirm"** wählen → **Hinzufügen**.

Die App startet danach im Vollbild (ohne Browser-Leiste) und funktioniert offline.

---

## Technik

- Build-frei: reines HTML/CSS + ES-Module, **keine Frameworks, keine Abhängigkeiten**.
- Rechen-Logik isoliert in `js/engine.mjs` (testbar, ohne DOM).
- Offline via Service Worker (`sw.js`), Persistenz via `localStorage`.

### Lokal starten

```bash
python3 -m http.server 8080
# dann http://localhost:8080 öffnen
```

### Tests

```bash
npm test        # node:test – deckt die Berechnungslogik ab
```

### Icons neu erzeugen

```bash
node tools/generate-icons.mjs   # benötigt Google Chrome (oder CHROME=<pfad>)
```

---

## Lizenz

Privates Projekt von Markus Schubert (alpinwelten). Berechnungsmethode nach DAV;
Inspiration: Gehzeit-Rechner von Bergfreunde.
