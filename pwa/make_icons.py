"""NICU Manual app icon: KP navy with "NICU" over a thin rule and "MANUAL".

Regenerate with: python3 pwa/make_icons.py pwa   (needs Pillow and macOS Arial Bold)
"""
import sys
from PIL import Image, ImageDraw, ImageFont

out = sys.argv[1]
NAVY = (0, 59, 113)
FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def icon(size, pad_frac, rounded):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0) if rounded else NAVY + (255,))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.18), fill=NAVY)
    inner = size * (1 - 2 * pad_frac)
    # "NICU" sized to the safe area, with a thin rule and "MANUAL" underneath
    f1 = ImageFont.truetype(FONT, int(inner * 0.36))
    w1 = d.textlength("NICU", font=f1)
    f1 = ImageFont.truetype(FONT, int(inner * 0.36 * min(1, inner * 0.92 / w1)))
    f2 = ImageFont.truetype(FONT, int(inner * 0.14))
    b1, b2 = d.textbbox((0, 0), "NICU", font=f1), d.textbbox((0, 0), "MANUAL", font=f2)
    h1, h2, gap = b1[3] - b1[1], b2[3] - b2[1], inner * 0.08
    top = (size - (h1 + gap + h2)) / 2
    d.text(((size - (b1[2] - b1[0])) / 2 - b1[0], top - b1[1]), "NICU", font=f1, fill="white")
    y = top + h1 + gap / 2
    d.line([(size * 0.5 - inner * 0.3, y), (size * 0.5 + inner * 0.3, y)], fill=(255, 255, 255, 170),
           width=max(1, size // 128))
    d.text(((size - (b2[2] - b2[0])) / 2 - b2[0], top + h1 + gap - b2[1]), "MANUAL", font=f2, fill=(220, 232, 245))
    return img


# draw large and scale down for smooth edges
for name, px, pad, rounded in [("icon-192.png", 192, 0.10, True), ("icon-512.png", 512, 0.10, True),
                               ("favicon-64.png", 64, 0.06, True),
                               ("icon-maskable-512.png", 512, 0.20, False),  # full-bleed, content in the safe zone
                               ("apple-touch-icon.png", 180, 0.12, False)]:  # iOS rounds the corners itself
    im = icon(2048, pad, rounded).resize((px, px), Image.LANCZOS)
    (im.convert("RGB") if name == "apple-touch-icon.png" else im).save(f"{out}/{name}")
print("ok")
