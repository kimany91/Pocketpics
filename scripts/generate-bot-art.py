"""Illustrations des cartes des adversaires du mode solo (python3 scripts/generate-bot-art.py).

Paysages en aplats superposés, un thème par arène, 4 variantes chacun.
Sortie : assets/bots/a<arène>-<carte>.jpg (320 × 448).
"""
import math
import random

from PIL import Image, ImageDraw, ImageFilter

W, H = 320, 448
S = 2  # suréchantillonnage pour des bords propres
OUT = "assets/bots"


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(top, bottom, w=W * S, h=H * S):
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=mix(top, bottom, y / (h - 1)))
    return img


def ridge(rnd, base, amp, rough, w=W * S, h=H * S):
    """Ligne de crête : somme de sinus + bruit, fermée vers le bas."""
    pts = []
    ph = [rnd.uniform(0, 6.3) for _ in range(3)]
    steps = 60
    for i in range(steps + 1):
        x = w * i / steps
        u = i / steps
        y = base + amp * (0.55 * math.sin(u * 3.1 + ph[0]) + 0.3 * math.sin(u * 7.3 + ph[1]) + 0.15 * math.sin(u * 13 + ph[2]))
        y += rnd.uniform(-rough, rough)
        pts.append((x, y))
    return pts + [(w, h), (0, h)]


def peaks(rnd, base, height, count, w=W * S, h=H * S):
    pts = [(0, base)]
    for i in range(count):
        x0 = w * (i + rnd.uniform(0.2, 0.8)) / count
        pts.append((x0, base - height * rnd.uniform(0.55, 1.0)))
        pts.append((w * (i + 1) / count, base - height * rnd.uniform(0.0, 0.25)))
    return pts + [(w, h), (0, h)]


def grain(img, amount=10, seed=0):
    rnd = random.Random(seed)
    noise = Image.effect_noise(img.size, amount).convert("L")
    noise = noise.point(lambda v: v)
    tint = Image.merge("RGB", (noise, noise, noise))
    return Image.blend(img, tint, 0.06 + rnd.random() * 0.02)


def circle(d, cx, cy, r, fill):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)


THEMES = {
    1: dict(sky=("#9ED8FF", "#E8F7FF"), layers=("#7BC67E", "#5AAE62", "#3F8F4C"), sun="#FFF3B0", motif="park"),
    2: dict(sky=("#FF9E7A", "#FFE1A8"), layers=("#3B8FC2", "#F2D59B", "#E6C181"), sun="#FFF1C9", motif="beach"),
    3: dict(sky=("#FFB36B", "#FFE2B8"), layers=("#C9573A", "#9E3F2C", "#5A2A22"), sun="#FFF0D0", motif="market"),
    4: dict(sky=("#B8E3C6", "#F1FAEC"), layers=("#3E8E5E", "#2C6B47", "#1C4A31"), sun="#FBF6D9", motif="forest"),
    5: dict(sky=("#6EB6F0", "#D8EEFF"), layers=("#2F6FA8", "#245A8A", "#173E61"), sun="#FFFFFF", motif="port"),
    6: dict(sky=("#7FA7DE", "#E6EEFA"), layers=("#E9F0FA", "#8EA6C8", "#4C6488"), sun="#FFFDF0", motif="mountain"),
    7: dict(sky=("#3A1220", "#FF7A3D"), layers=("#4A1C1C", "#2B1012", "#160809"), sun="#FFD08A", motif="volcano"),
    8: dict(sky=("#2B2550", "#7E6FC9"), layers=("#3C3470", "#2A2452", "#181433"), sun="#E9E4FF", motif="storm"),
    9: dict(sky=("#F7E3A8", "#FFF8E6"), layers=("#E8C873", "#C9A24A", "#8E6E2A"), sun="#FFFFFF", motif="palace"),
    10: dict(sky=("#07061A", "#2A1550"), layers=("#3B1F6E", "#251248", "#120A26"), sun="#FFE6F4", motif="cosmos"),
}


def draw_card(arena, idx):
    th = THEMES[arena]
    rnd = random.Random(arena * 100 + idx)
    shift = (idx - 1.5) * 0.08
    top, bottom = hex_rgb(th["sky"][0]), hex_rgb(th["sky"][1])
    top = mix(top, (0, 0, 0) if shift < 0 else (255, 255, 255), abs(shift))
    img = gradient(top, bottom)
    d = ImageDraw.Draw(img)
    w, h = W * S, H * S
    motif = th["motif"]

    # Astre (soleil, lune, planète)
    if motif == "cosmos":
        for _ in range(140):
            x, y, r = rnd.uniform(0, w), rnd.uniform(0, h * 0.8), rnd.choice((1, 1, 2, 3))
            circle(d, x, y, r * S * 0.6, mix((255, 255, 255), hex_rgb("#C9B8FF"), rnd.random()))
        glow = Image.new("RGB", (w, h))
        gd = ImageDraw.Draw(glow)
        for _ in range(3):
            circle(gd, rnd.uniform(0, w), rnd.uniform(h * 0.1, h * 0.6), rnd.uniform(120, 220) * S * 0.6, hex_rgb(rnd.choice(("#C94BFF", "#4B8BFF", "#FF4FA8"))))
        img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(60 * S)), 0.45)
        d = ImageDraw.Draw(img)
        px, py, pr = rnd.uniform(w * 0.25, w * 0.75), rnd.uniform(h * 0.2, h * 0.4), rnd.uniform(50, 80) * S
        circle(d, px, py, pr, hex_rgb(th["sun"]))
        circle(d, px + pr * 0.35, py - pr * 0.2, pr * 0.85, mix(hex_rgb(th["sun"]), hex_rgb("#B07DFF"), 0.35))
        if idx % 2 == 0:
            d.ellipse([px - pr * 1.8, py - pr * 0.35, px + pr * 1.8, py + pr * 0.35], outline=hex_rgb("#FFE6F4"), width=4 * S)
    else:
        sx, sy = rnd.uniform(w * 0.2, w * 0.8), rnd.uniform(h * 0.14, h * 0.32)
        sr = rnd.uniform(34, 52) * S
        halo = Image.new("RGB", (w, h))
        circle(ImageDraw.Draw(halo), sx, sy, sr * 2.2, hex_rgb(th["sun"]))
        img = Image.blend(img, halo.filter(ImageFilter.GaussianBlur(40 * S)), 0.25)
        d = ImageDraw.Draw(img)
        circle(d, sx, sy, sr, hex_rgb(th["sun"]))

    if motif == "storm":
        for _ in range(4):
            x = rnd.uniform(0, w)
            circle(d, x, rnd.uniform(h * 0.05, h * 0.2), rnd.uniform(60, 110) * S, mix(hex_rgb("#4B4383"), top, 0.3))
        x, y = rnd.uniform(w * 0.3, w * 0.7), h * 0.18
        bolt = [(x, y)]
        for _ in range(5):
            x += rnd.uniform(-40, 40) * S
            y += rnd.uniform(40, 60) * S
            bolt.append((x, y))
        d.line(bolt, fill=hex_rgb("#FFF6B0"), width=7 * S, joint="curve")

    # Plans successifs, du plus loin au plus proche
    layers = [hex_rgb(c) for c in th["layers"]]
    bases = [h * 0.56, h * 0.68, h * 0.82]
    for li, (col, base) in enumerate(zip(layers, bases)):
        far = mix(col, bottom, 0.25 * (2 - li) / 2)
        if motif == "volcano" and li == 0:
            cx = w * rnd.uniform(0.4, 0.6)
            top_y = base - h * rnd.uniform(0.24, 0.3)
            pts = [(0, base + 20 * S), (cx - w * 0.42, base), (cx - w * 0.09, top_y), (cx + w * 0.09, top_y), (cx + w * 0.42, base), (w, base + 20 * S), (w, h), (0, h)]
        elif motif == "mountain" and li == 0:
            pts = peaks(rnd, base, h * 0.32, 2)
        elif motif == "beach" and li == 0:
            pts = [(0, base), (w, base), (w, h), (0, h)]
        else:
            pts = ridge(rnd, base, h * (0.05 + 0.03 * li), 2 * S)
        d.polygon(pts, fill=far)
        if motif == "mountain" and li == 0:
            for i in range(1, len(pts) - 2):
                x, y = pts[i]
                if y < base - h * 0.15:
                    d.polygon([(x, y), (x - 38 * S, y + 50 * S), (x + 38 * S, y + 50 * S)], fill=hex_rgb("#FFFFFF"))
        if motif == "volcano" and li == 0:
            cx, top_y = (pts[2][0] + pts[3][0]) / 2, pts[2][1]
            d.ellipse([cx - w * 0.09, top_y - 8 * S, cx + w * 0.09, top_y + 8 * S], fill=hex_rgb("#FF8A3D"))
            for k in range(3):
                x0 = cx + (k - 1) * w * 0.05
                pts_l = [(x0 - 7 * S, top_y)]
                x, y = x0, top_y
                while y < base - 4 * S:
                    y += 18 * S
                    x += (k - 1) * 9 * S + rnd.uniform(-6, 6) * S
                    pts_l.append((x, y))
                d.line(pts_l, fill=hex_rgb("#FF6B2D"), width=int((9 - k) * S), joint="curve")
            for _ in range(12):
                circle(d, cx + rnd.uniform(-70, 70) * S, top_y - rnd.uniform(10, 130) * S, rnd.uniform(3, 8) * S, hex_rgb("#FFB35C"))
        if motif == "forest" and li >= 1:
            for _ in range(7 + li * 3):
                x = rnd.uniform(0, w)
                th_h = rnd.uniform(70, 130) * S * (0.7 + li * 0.3)
                yb = base + rnd.uniform(0, 30) * S
                d.polygon([(x, yb - th_h), (x - th_h * 0.28, yb), (x + th_h * 0.28, yb)], fill=mix(col, (0, 0, 0), 0.15))
        if motif == "park" and li == 1:
            for _ in range(5):
                x = rnd.uniform(0, w)
                yb = base + rnd.uniform(0, 20) * S
                d.rectangle([x - 4 * S, yb - 40 * S, x + 4 * S, yb], fill=hex_rgb("#6B4A2E"))
                circle(d, x, yb - 55 * S, rnd.uniform(24, 34) * S, mix(col, (0, 0, 0), 0.2))
        if motif == "beach" and li == 0:
            for k in range(6):
                y = base + 12 * S + k * 16 * S
                d.line([(rnd.uniform(0, w * 0.4), y), (rnd.uniform(w * 0.6, w), y)], fill=mix(col, (255, 255, 255), 0.35), width=3 * S)
        if motif == "port" and li == 0:
            lx = w * (0.25 + 0.5 * rnd.random())
            d.rectangle([lx - 12 * S, base - 150 * S, lx + 12 * S, base + 40 * S], fill=hex_rgb("#F5F3EE"))
            for k in range(3):
                d.rectangle([lx - 12 * S, base - 130 * S + k * 45 * S, lx + 12 * S, base - 115 * S + k * 45 * S], fill=hex_rgb("#E5484D"))
            d.polygon([(lx - 16 * S, base - 150 * S), (lx + 16 * S, base - 150 * S), (lx, base - 176 * S)], fill=hex_rgb("#2B2B33"))
            d.polygon([(lx, base - 165 * S), (lx - 120 * S, base - 200 * S), (lx - 120 * S, base - 130 * S)], fill=mix(hex_rgb("#FFF6C2"), top, 0.5))
        if motif == "market" and li == 0:
            stripe = 26 * S
            for k in range(0, w // stripe + 1):
                c = hex_rgb("#F5F3EE") if k % 2 == 0 else hex_rgb("#E5484D")
                d.rectangle([k * stripe, h * 0.42, (k + 1) * stripe, h * 0.5], fill=c)
            for k in range(0, w // stripe + 1):
                c = hex_rgb("#F5F3EE") if k % 2 == 0 else hex_rgb("#E5484D")
                d.pieslice([k * stripe, h * 0.5 - stripe / 2, (k + 1) * stripe, h * 0.5 + stripe / 2], 0, 180, fill=c)
        if motif == "market" and li == 2:
            for _ in range(14):
                circle(d, rnd.uniform(0, w), base + rnd.uniform(10, 120) * S, rnd.uniform(16, 30) * S, hex_rgb(rnd.choice(("#E5484D", "#F7C948", "#7BC67E", "#FF9A3D"))))
        if motif == "palace" and li == 0:
            cols = 5
            for k in range(cols):
                x = w * (k + 0.5) / cols
                d.rectangle([x - 14 * S, base - 170 * S, x + 14 * S, base + 10 * S], fill=hex_rgb("#FFF8E6"))
                d.rectangle([x - 20 * S, base - 180 * S, x + 20 * S, base - 168 * S], fill=hex_rgb("#F2DFA6"))
            d.polygon([(0, base - 180 * S), (w, base - 180 * S), (w / 2, base - 250 * S)], fill=hex_rgb("#F2DFA6"))
        if motif == "storm" and li == 2:
            for _ in range(60):
                x, y = rnd.uniform(0, w), rnd.uniform(0, h)
                d.line([(x, y), (x - 8 * S, y + 26 * S)], fill=mix(hex_rgb("#B9B0FF"), top, 0.4), width=2 * S)
        if motif == "cosmos" and li == 2:
            for _ in range(30):
                circle(d, rnd.uniform(0, w), base + rnd.uniform(0, 140) * S, rnd.uniform(2, 5) * S, hex_rgb("#C9A6FF"))

    img = img.resize((W, H), Image.LANCZOS)
    return grain(img, 40, arena * 10 + idx)


if __name__ == "__main__":
    import os

    os.makedirs(OUT, exist_ok=True)
    for arena in THEMES:
        for idx in range(4):
            draw_card(arena, idx).save(f"{OUT}/a{arena}-{idx}.jpg", quality=80, optimize=True, progressive=True)
    print("ok")
