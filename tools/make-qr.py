#!/usr/bin/env python3
"""Erzeugt den QR-Code für die Tourenzeit-App (schlicht + beschriftete Variante).

Aufruf:  python3 tools/make-qr.py [URL]
Default-URL: https://alpinwelten.github.io/tourenzeit/
Ausgabe:  qr-tourenzeit.png  und  qr-tourenzeit-beschriftet.png  (Repo-Wurzel)

Benötigt: pip install qrcode  (PIL/Pillow ist bereits vorhanden)
"""
import sys
from pathlib import Path
import qrcode
from qrcode.constants import ERROR_CORRECT_M
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
URL = sys.argv[1] if len(sys.argv) > 1 else "https://alpinwelten.github.io/tourenzeit/"

INK = (15, 20, 26)       # Anthrazit (App-Hintergrund --bg)
ACCENT = (255, 90, 60)   # Signal-Orange (--accent)
MUTED = (110, 124, 138)  # gedämpfter Untertitel
WHITE = (255, 255, 255)

def make_qr(url, box=20, border=2):
    qr = qrcode.QRCode(version=None, error_correction=ERROR_CORRECT_M,
                       box_size=box, border=border)
    qr.add_data(url)
    qr.make(fit=True)
    return qr.make_image(fill_color=INK, back_color=WHITE).convert("RGB")

def load_font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/SFNSRounded.ttf",
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold
        else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size)
        except OSError:
            continue
    return ImageFont.load_default()

def center_text(draw, cx, y, text, font, fill):
    l, t, r, b = draw.textbbox((0, 0), text, font=font)
    draw.text((cx - (r - l) / 2, y), text, font=font, fill=fill)
    return b - t

# --- 1) Schlichter QR ---
qr = make_qr(URL)
qr.save(ROOT / "qr-tourenzeit.png")
print("qr-tourenzeit.png", qr.size)

# --- 2) Beschriftete Karte ---
W = qr.width
pad = 56
title_f = load_font(64, bold=True)
sub_f = load_font(34)
url_f = load_font(30)

top = pad + 132       # Platz für Titel + Untertitel
bottom = 124          # Platz für URL
card = Image.new("RGB", (W + 2 * pad, qr.height + top + bottom), WHITE)
draw = ImageDraw.Draw(card)
cx = card.width // 2

# Akzent-Leiste oben
draw.rectangle([0, 0, card.width, 12], fill=ACCENT)

center_text(draw, cx, pad, "Tourenzeit", title_f, INK)
center_text(draw, cx, pad + 78, "Gehzeit & Tourdauer · DAV-Methode", sub_f, MUTED)

card.paste(qr, (pad, top))
center_text(draw, cx, top + qr.height + 28,
            URL.replace("https://", ""), url_f, INK)

out = ROOT / "qr-tourenzeit-beschriftet.png"
card.save(out)
print(out.name, card.size)
