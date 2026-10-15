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


# ---------------------------------------------------------------------------
# Mondes 11 à 20 : même décor en aplats, mais chaque carte montre son sujet
# (le nom de la carte) au premier plan. La carte 3 sert aussi de portrait rond
# de l'adversaire : son sujet est centré et lisible en petit.
# Les coordonnées sont exprimées en pixels finaux (320 × 448).
# ---------------------------------------------------------------------------

from PIL import ImageChops  # noqa: E402

SS = 3  # suréchantillonnage des nouveaux mondes
ZOOM = [0.0, 0.0, 1.0]  # agrandissement (ox, oy, k) appliqué aux tracés, cf. zoom()


class zoom:
    """Agrandit d'un facteur k autour de (ox, oy) tout ce qui est tracé dans le bloc."""

    def __init__(self, ox, oy, k):
        self.z = [ox, oy, k]

    def __enter__(self):
        self.prev = ZOOM[:]
        ZOOM[:] = self.z

    def __exit__(self, *exc):
        ZOOM[:] = self.prev


def zx(x, y):
    ox, oy, k = ZOOM
    return (ox + (x - ox) * k) * SS, (oy + (y - oy) * k) * SS


def zw(v):
    return v * ZOOM[2] * SS


class Canvas:
    def __init__(self, img):
        self.img = img
        self.d = ImageDraw.Draw(img)

    def _reset(self, img):
        self.img = img
        self.d = ImageDraw.Draw(img)

    @staticmethod
    def xy(pts):
        return [zx(x, y) for x, y in pts]

    @staticmethod
    def box(x0, y0, x1, y1):
        (ax, ay), (bx, by) = zx(x0, y0), zx(x1, y1)
        return [min(ax, bx), min(ay, by), max(ax, bx), max(ay, by)]

    def poly(self, pts, fill):
        self.d.polygon(self.xy(pts), fill=fill)

    def line(self, pts, fill, width, round_caps=False):
        w = max(1, round(zw(width)))
        self.d.line(self.xy(pts), fill=fill, width=w, joint="curve")
        if round_caps:
            for x, y in (pts[0], pts[-1]):
                self.circ(x, y, width / 2, fill)

    def circ(self, cx, cy, r, fill=None, outline=None, width=1):
        self.ell(cx - r, cy - r, cx + r, cy + r, fill, outline, width)

    def ell(self, x0, y0, x1, y1, fill=None, outline=None, width=1):
        self.d.ellipse(self.box(x0, y0, x1, y1), fill=fill, outline=outline, width=max(1, round(zw(width))))

    def rect(self, x0, y0, x1, y1, fill):
        self.d.rectangle(self.box(x0, y0, x1, y1), fill=fill)

    def rrect(self, x0, y0, x1, y1, r, fill=None, outline=None, width=1):
        self.d.rounded_rectangle(self.box(x0, y0, x1, y1), radius=zw(r), fill=fill, outline=outline, width=max(1, round(zw(width))))

    def pie(self, x0, y0, x1, y1, a0, a1, fill):
        self.d.pieslice(self.box(x0, y0, x1, y1), a0, a1, fill=fill)

    def chord(self, x0, y0, x1, y1, a0, a1, fill):
        self.d.chord(self.box(x0, y0, x1, y1), a0, a1, fill=fill)

    def arc(self, x0, y0, x1, y1, a0, a1, fill, width):
        self.d.arc(self.box(x0, y0, x1, y1), a0, a1, fill=fill, width=max(1, round(zw(width))))

    def vgrad(self, x0, y0, x1, y1, top, bottom):
        (ax, ay), (bx, by) = zx(x0, y0), zx(x1, y1)
        g = gradient(hex_rgb(top), hex_rgb(bottom), w=int(bx - ax), h=int(by - ay))
        self.img.paste(g, (int(ax), int(ay)))

    def layer(self, mode="RGB"):
        return Canvas(Image.new(mode, self.img.size, 0 if mode != "RGBA" else (0, 0, 0, 0)))

    def glow(self, fn, blur, strength=1.0):
        """Lumière additive : fn dessine sur un calque noir, flouté puis ajouté."""
        lay = self.layer()
        fn(lay)
        g = lay.img.filter(ImageFilter.GaussianBlur(zw(blur)))
        if strength != 1.0:
            g = g.point(lambda v: min(255, int(v * strength)))
        self._reset(ImageChops.add(self.img, g))

    def alpha(self, fn, blur=0):
        """Calque translucide (couleurs RGBA)."""
        lay = self.layer("RGBA")
        fn(lay)
        im = lay.img
        if blur:
            im = im.filter(ImageFilter.GaussianBlur(zw(blur)))
        self._reset(Image.alpha_composite(self.img.convert("RGBA"), im).convert("RGB"))

    def clip(self, mask_fn, fn, opacity=1.0, blur=0):
        """Dessine fn uniquement à l'intérieur de la forme tracée par mask_fn."""
        m = self.layer("L")
        mask_fn(m)
        mask = m.img
        if blur:
            mask = mask.filter(ImageFilter.GaussianBlur(zw(blur)))
        if opacity != 1.0:
            mask = mask.point(lambda v: int(v * opacity))
        top = Canvas(self.img.copy())
        fn(top)
        self._reset(Image.composite(top.img, self.img, mask))

    def rotated(self, size, fn, cx, cy, angle):
        """Dessine fn sur une vignette (w, h) puis la colle tournée, centrée en (cx, cy)."""
        k = ZOOM[2]
        px, py = zx(cx, cy)
        lay = Canvas(Image.new("RGBA", (int(zw(size[0])), int(zw(size[1]))), (0, 0, 0, 0)))
        with zoom(0, 0, k):
            fn(lay)
        im = lay.img.rotate(angle, resample=Image.BICUBIC, expand=True)
        base = self.img.convert("RGBA")
        base.alpha_composite(im, (int(px - im.width / 2), int(py - im.height / 2)))
        self._reset(base.convert("RGB"))


# --- formes utiles --------------------------------------------------------

def hills(rnd, base, amp, rough=0.0):
    return ridge(rnd, base, amp, rough, w=W, h=H)


def leaf(cx, cy, ang, length, width, bend=0.0, n=18, fat=0.8):
    """Feuille / pétale / plume / flamme : fuseau qui part de (cx, cy)."""
    x, y = cx, cy
    step = length / n
    left, right = [], []
    for i in range(1, n + 1):
        t = i / n
        a = math.radians(ang + bend * t)
        x += math.cos(a) * step
        y += math.sin(a) * step
        hw = width / 2 * math.sin(math.pi * t) ** fat
        nx, ny = -math.sin(a), math.cos(a)
        left.append((x + nx * hw, y + ny * hw))
        right.append((x - nx * hw, y - ny * hw))
    return [(cx, cy)] + left + right[::-1]


def bez(p0, p1, p2, p3, n=24):
    pts = []
    for i in range(n + 1):
        t = i / n
        a, b, c_, d_ = (1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3
        pts.append((a * p0[0] + b * p1[0] + c_ * p2[0] + d_ * p3[0], a * p0[1] + b * p1[1] + c_ * p2[1] + d_ * p3[1]))
    return pts


def star_pts(cx, cy, ro, ri, n=5, rot=-90):
    pts = []
    for k in range(n * 2):
        r = ro if k % 2 == 0 else ri
        a = math.radians(rot + k * 180 / n)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def blob(rnd, cx, cy, rx, ry, jitter=0.15, n=18):
    pts = []
    ph = rnd.uniform(0, 6.3)
    for k in range(n):
        a = 2 * math.pi * k / n
        f = 1 + jitter * (0.6 * math.sin(3 * a + ph) + 0.4 * rnd.uniform(-1, 1))
        pts.append((cx + rx * f * math.cos(a), cy + ry * f * math.sin(a)))
    return pts


def tube(p0, p1, r0, r1):
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L, dx / L
    return [(p0[0] + nx * r0, p0[1] + ny * r0), (p1[0] + nx * r1, p1[1] + ny * r1),
            (p1[0] - nx * r1, p1[1] - ny * r1), (p0[0] - nx * r0, p0[1] - ny * r0)]


def lerp(p, q, t):
    return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)


def hx(c, t, other="#000000"):
    """Couleur hex mélangée vers `other` (noir par défaut)."""
    return mix(hex_rgb(c), hex_rgb(other), t)


def sun_disk(c, x, y, r, col, halo=0.45):
    c.glow(lambda g: g.circ(x, y, r * 1.9, col), r * 0.9, halo)
    c.circ(x, y, r, col)


def sparkle(c, x, y, r, col):
    c.poly([(x, y - r), (x + r * 0.22, y - r * 0.22), (x + r, y), (x + r * 0.22, y + r * 0.22),
            (x, y + r), (x - r * 0.22, y + r * 0.22), (x - r, y), (x - r * 0.22, y - r * 0.22)], col)


def stars(c, rnd, n, y_max, cols=("#FFFFFF",), rmax=1.4):
    for _ in range(n):
        c.circ(rnd.uniform(0, W), rnd.uniform(0, y_max), rnd.uniform(0.4, rmax), rnd.choice(cols))


def puff(c, cx, cy, s, col, shade=None):
    """Petit nuage en boules."""
    parts = [(-26, 4, 14), (-10, -6, 18), (10, -10, 20), (28, 2, 14), (0, 6, 16)]
    if shade:
        for dx, dy, r in parts:
            c.circ(cx + dx * s, cy + (dy + 4) * s, r * s, shade)
    for dx, dy, r in parts:
        c.circ(cx + dx * s, cy + dy * s, r * s, col)


# --- 11 · Le Lac -----------------------------------------------------------

def lilypad(c, x, y, rx, notch=90, col="#4FA65A", dark="#2F7F44"):
    ry = rx * 0.36
    c.ell(x - rx, y - ry + 3, x + rx, y + ry + 3, dark)
    c.pie(x - rx, y - ry, x + rx, y + ry, notch + 16, notch - 16 + 360, col)
    for a in (notch + 70, notch + 130, notch + 180, notch + 230, notch + 290):
        t = math.radians(a)
        c.line([(x, y), (x + rx * 0.8 * math.cos(t), y + ry * 0.8 * math.sin(t))], hx(col, 0.15), max(0.8, rx / 60))


def reeds(c, rnd, x0, x1, base, n, hmin, hmax, col="#3E7A3A", tip="#7A4A2A"):
    for _ in range(n):
        x = rnd.uniform(x0, x1)
        hgt = rnd.uniform(hmin, hmax)
        lean = rnd.uniform(-14, 14)
        c.poly(leaf(x, base, -90 + lean * 0.4, hgt * 0.9, hgt * 0.06, bend=rnd.uniform(-25, 25), fat=0.5), hx(col, 0.25, "#9BD36A"))
        c.line(bez((x, base), (x, base - hgt * 0.4), (x + lean, base - hgt * 0.7), (x + lean, base - hgt), 10), col, max(1.2, hgt / 70))
        if rnd.random() < 0.6:
            c.ell(x + lean - hgt * 0.025 - 1.5, base - hgt * 0.98, x + lean + hgt * 0.025 + 1.5, base - hgt * 0.8, tip)


def lake_bg(c, rnd, sun, sun_r=24):
    sx, sy = sun
    for _ in range(3):
        puff(c, rnd.uniform(20, 300), rnd.uniform(40, 150), rnd.uniform(0.5, 0.9), "#FFFFFF", "#D6EEF5")
    sun_disk(c, sx, sy, sun_r, "#FFF6D6", 0.35)
    c.poly(hills(rnd, 222, 16, 0.4), "#A5D4C2")
    c.poly(hills(rnd, 240, 10, 0.4), "#72B9A0")
    for _ in range(12):
        r = rnd.uniform(8, 15)
        c.circ(rnd.uniform(0, W), 246 - r * 0.5, r, "#57A288")
    c.vgrad(0, 248, W, H, "#8FDCEA", "#2B88A8")
    c.rect(0, 248, W, 250, "#D6F5F8")
    for k in range(7):
        y = 256 + k * 9
        hw = max(4, sun_r * 1.1 - k * 3 + rnd.uniform(-3, 3))
        c.line([(sx - hw, y), (sx + hw, y)], "#E9FBFC", 2)
    for _ in range(16):
        y = rnd.uniform(262, 440)
        x = rnd.uniform(-20, 300)
        c.line([(x, y), (x + rnd.uniform(16, 46) * (0.6 + (y - 250) / 200), y)], hx("#B9EDF4", 0.1 * (y - 250) / 200), 1.5)


def water_lily(c, x, y, s=1.0):
    for a in (-178, -2, 168, 12):
        c.poly(leaf(x, y, a, 52 * s, 24 * s, fat=0.6), "#F7C4DA")
    for a in (-160, -135, -112, -90, -68, -45, -20):
        c.poly(leaf(x, y, a, 62 * s, 25 * s, fat=0.6), "#F9B3D1")
    for a in (-150, -122, -58, -30):
        c.poly(leaf(x, y + 2, a, 50 * s, 22 * s, fat=0.6), "#F27FB2")
    for a in (-104, -76):
        c.poly(leaf(x, y + 2, a, 44 * s, 20 * s, fat=0.6), "#FFD6E8")
    c.ell(x - 15 * s, y - 9 * s, x + 15 * s, y + 5 * s, "#FFC93D")
    for k in range(7):
        a = math.radians(-180 + k * 30)
        c.circ(x + 10 * s * math.cos(a), y - 2 * s + 4 * s * math.sin(a), 1.8 * s, "#F29A2E")


def lake_card(c, rnd, idx):
    if idx == 0:  # Nénuphar
        lake_bg(c, rnd, (250, 95))
        for x, y, r in ((40, 292, 22), (262, 282, 15), (292, 318, 26), (70, 330, 18)):
            lilypad(c, x, y, r, rnd.uniform(0, 360))
        reeds(c, rnd, -10, 40, 330, 7, 60, 120)
        reeds(c, rnd, 285, 330, 320, 6, 60, 110)
        lilypad(c, 160, 382, 132, 100)
        water_lily(c, 160, 352, 1.25)
        for x, y in ((242, 344), (90, 412)):
            water_lily(c, x, y, 0.42)
    elif idx == 1:  # Grenouille
        lake_bg(c, rnd, (78, 92))
        for x, y, r in ((250, 290, 20), (52, 300, 16)):
            lilypad(c, x, y, r, rnd.uniform(0, 360))
        reeds(c, rnd, 270, 330, 330, 8, 80, 150)
        lilypad(c, 160, 386, 124, 70)
        g, dk, belly = "#5CC25E", "#3A9447", "#D9F0A0"
        c.ell(92, 330, 150, 368, dk)  # pattes arrière
        c.ell(170, 330, 228, 368, dk)
        c.ell(108, 290, 212, 372, g)  # corps
        c.ell(130, 318, 190, 370, belly)
        c.ell(96, 252, 224, 318, g)  # tête
        for ex in (124, 196):
            c.circ(ex, 258, 21, g)
            c.circ(ex, 256, 14, "#FFFFFF")
            c.ell(ex - 7, 251, ex + 7, 261, "#1F2A22")
            c.circ(ex - 3, 253, 2.2, "#FFFFFF")
        c.arc(122, 262, 198, 304, 25, 155, "#2C6B33", 3)
        c.ell(110, 290, 124, 298, "#F49AA8")
        c.ell(196, 290, 210, 298, "#F49AA8")
        for fx in (128, 192):
            c.ell(fx - 13, 360, fx + 13, 374, dk)
            for k in (-9, 0, 9):
                c.circ(fx + k, 373, 3.4, dk)
    elif idx == 2:  # Pédalo
        lake_bg(c, rnd, (240, 100))
        reeds(c, rnd, -10, 50, 320, 8, 60, 130)
        for x, y, r in ((270, 300, 18), (290, 410, 26)):
            lilypad(c, x, y, r, rnd.uniform(0, 360))
        c.alpha(lambda o: o.ell(48, 340, 290, 378, (14, 70, 92, 90)))
        for k in range(4):
            c.line([(20 - k * 4, 352 + k * 9), (60, 350 + k * 4)], "#CFF3F8", 1.5)
        hull = [(46, 318), (250, 318), (288, 298), (282, 322), (262, 350), (74, 352), (46, 334)]
        c.poly(hull, "#F6F7F2")
        c.poly([(52, 338), (272, 338), (262, 350), (74, 352)], "#D3DAD8")
        c.line([(48, 328), (282, 316)], "#E5484D", 5)
        c.rrect(102, 300, 210, 320, 6, "#2563B8")
        for bx in (104, 152):
            c.rrect(bx, 254, bx + 34, 318, 10, "#2F7FD8")
            c.rrect(bx + 6, 260, bx + 28, 300, 7, "#5FA2EC")
        c.pie(194, 286, 258, 350, 180, 360, "#E5484D")
        c.arc(194, 286, 258, 350, 180, 360, "#FFFFFF", 3)
        c.arc(206, 298, 246, 338, 180, 360, "#FFFFFF", 2)
        c.circ(226, 318, 5, "#FFFFFF")
        for k in range(3):
            c.rect(204 + k * 16, 342, 214 + k * 16, 352, "#2563B8")
        c.circ(274, 306, 4, "#F7C948")
        for k in range(5):
            c.circ(240 + k * 9, 352 + (k % 2) * 3, 4 - k * 0.5, "#E9FBFC")
    else:  # Héron
        lake_bg(c, rnd, (186, 118), sun_r=62)
        reeds(c, rnd, -15, 60, 450, 10, 120, 220)
        reeds(c, rnd, 262, 335, 450, 10, 120, 220)
        with zoom(160, 384, 1.22):
            heron(c)


def heron(c):
    """Héron cendré debout dans l'eau, de profil."""
    leg = "#D8B04A"
    c.line([(150, 262), (146, 322), (152, 384)], leg, 3.5)
    c.line([(168, 262), (174, 322), (180, 384)], leg, 3.5)
    for cx in (152, 180):
        c.ell(cx - 22, 380, cx + 22, 390, None, "#D9F6FA", 1.6)
    c.poly([(92, 290), (126, 256), (166, 232), (204, 234), (214, 252), (196, 274), (150, 282)], "#93A5BA")
    c.poly([(96, 290), (138, 258), (186, 248), (198, 262), (162, 280)], "#6C7F98")
    c.poly([(88, 296), (120, 274), (140, 284)], "#2E3A4C")
    neck = bez((198, 242), (232, 214), (160, 196), (190, 148))
    c.line(neck, "#E8EDF2", 15, True)
    for k in range(4, 18, 3):
        x, y = neck[k]
        c.line([(x + 2, y - 1), (x + 4, y + 3)], "#55657A", 1.6)
    c.ell(176, 134, 206, 156, "#F4F6F8")
    c.line([(194, 140), (168, 136), (148, 144)], "#1E2430", 3.2)
    c.poly([(202, 140), (254, 148), (202, 153)], "#F2B33D")
    c.circ(197, 143, 3.6, "#F7D24A")
    c.circ(197, 143, 2, "#1E2430")


# --- 12 · La Foire ---------------------------------------------------------

def tent(c, x, base, w, h, col, stripe):
    c.rect(x - w / 2, base - h * 0.45, x + w / 2, base, col)
    sw = w / 6
    for k in range(0, 6, 2):
        c.rect(x - w / 2 + k * sw, base - h * 0.45, x - w / 2 + (k + 1) * sw, base, stripe)
    c.poly([(x - w / 2 - 6, base - h * 0.45), (x, base - h), (x + w / 2 + 6, base - h * 0.45)], col)
    for k in range(6):
        c.pie(x - w / 2 - 6 + k * (w + 12) / 6, base - h * 0.45 - (w + 12) / 12, x - w / 2 - 6 + (k + 1) * (w + 12) / 6, base - h * 0.45 + (w + 12) / 12, 0, 180, stripe if k % 2 else col)
    c.line([(x, base - h), (x, base - h - 14)], col, 1.5)
    c.poly([(x, base - h - 14), (x + 12, base - h - 10), (x, base - h - 6)], stripe)


BULBS = ("#FFE36B", "#FF7EB6", "#6BE4FF", "#FFFFFF", "#FF9A3D")


def garland(c, rnd, x0, y0, x1, y1, sag, n):
    pts = [(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + sag * 4 * t * (1 - t)) for t in (k / 40 for k in range(41))]
    c.line(pts, "#2A1740", 1.2)
    bulbs = [(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + sag * 4 * t * (1 - t) + 3, BULBS[k % len(BULBS)]) for k, t in enumerate((k + 0.5) / n for k in range(n))]
    c.glow(lambda g: [g.circ(x, y, 6, col) for x, y, col in bulbs], 5, 0.9)
    for x, y, col in bulbs:
        c.circ(x, y, 2.6, col)


def foire_bg(c, rnd, sun=True, garlands=True):
    stars(c, rnd, 28, 150, ("#FFFFFF", "#FFD6EC"), 1.2)
    if sun:
        sun_disk(c, rnd.uniform(70, 250), 282, 44, "#FFC48A", 0.4)
    c.poly(hills(rnd, 300, 6, 0), "#8C4C9E")
    for x, w, hgt in ((30, 70, 80), (250, 90, 100), (130, 60, 64), (320, 60, 70)):
        tent(c, x, 312, w, hgt, "#7A3F92", "#93549F")
    c.poly(hills(rnd, 330, 6, 0), "#5A2C78")
    for x, w, hgt in ((80, 80, 90), (205, 70, 76)):
        tent(c, x, 345, w, hgt, "#6A2F86", "#E86AA8")
    c.vgrad(0, 350, W, H, "#3A1E58", "#1E1033")
    c.poly([(130, 350), (190, 350), (260, H), (60, H)], "#4A2A6A")
    if garlands:
        garland(c, rnd, -10, 92, 330, 108, 46, 15)
        garland(c, rnd, -10, 186, 160, 214, 26, 7)
        garland(c, rnd, 160, 214, 330, 182, 26, 7)


def bumper_car(c, x, base, facing, col, dark):
    c.alpha(lambda o: o.ell(x - 74, base - 8, x + 74, base + 10, (0, 0, 0, 90)))
    rear = x - facing * 46
    c.line([(rear, base - 60), (rear, 34)], "#A9AEC0", 3)
    c.glow(lambda g: g.circ(rear, 36, 9, "#FFF3A0"), 6, 1.3)
    sparkle(c, rear, 36, 10, "#FFF6C8")
    c.rrect(x - 64, base - 62, x + 64, base - 18, 22, col)
    c.rrect(x - facing * 52 - 14, base - 98, x - facing * 52 + 14, base - 46, 10, dark)
    c.rrect(x - 50, base - 50, x + 50, base - 40, 4, hx(col, 0.15))
    c.ell(x + facing * 34 - 26, base - 72, x + facing * 34 + 26, base - 44, hx(col, 0.3, "#FFFFFF"))
    c.line([(x + facing * 4, base - 56), (x + facing * 16, base - 80)], "#2A2633", 3)
    c.ell(x + facing * 16 - 5, base - 92, x + facing * 16 + 5, base - 72, "#2A2633")
    c.rrect(x - 72, base - 28, x + 72, base, 14, "#26222E")
    c.line([(x - 60, base - 22), (x + 60, base - 22)], "#4A4458", 2)
    c.circ(x - facing * 6, base - 40, 9, "#FFFFFF")
    sparkle(c, x - facing * 6, base - 40, 6, col)


def foire_card(c, rnd, idx):
    if idx == 0:  # Barbe à papa
        foire_bg(c, rnd)
        cone = [(136, 262), (184, 262), (160, 406)]
        c.poly(cone, "#FFF4E6")
        c.clip(lambda m: m.poly(cone, 255), lambda t: [t.line([(100, 240 + k * 26), (220, 300 + k * 26)], "#F27FB2", 6) for k in range(-2, 7)])
        parts = [(0, 0, 50), (-44, 10, 38), (44, 8, 40), (-26, -38, 36), (28, -40, 38), (0, -58, 30),
                 (-58, -22, 26), (60, -20, 26), (-28, 40, 32), (30, 40, 32), (0, 46, 30)]
        cx, cy = 160, 214
        for dx, dy, r in parts:
            c.circ(cx + dx + 5, cy + dy + 6, r, "#E06AAA")
        for dx, dy, r in parts:
            c.circ(cx + dx, cy + dy, r, "#FF9ACB")
        for dx, dy, r in parts:
            c.circ(cx + dx - r * 0.25, cy + dy - r * 0.3, r * 0.55, "#FFC2E0")
        for _ in range(18):
            a, d = rnd.uniform(0, 6.3), rnd.uniform(0, 60)
            c.circ(cx + d * math.cos(a), cy - 10 + d * math.sin(a) * 0.9, 1.6, "#FFFFFF")
        for x, y, r in ((62, 150, 9), (262, 132, 11), (252, 300, 7), (70, 290, 7)):
            sparkle(c, x, y, r, "#FFF3A0")
    elif idx == 1:  # Ticket d'or
        foire_bg(c, rnd, sun=False)
        c.alpha(lambda o: [o.poly([(160, 225), (160 + 260 * math.cos(math.radians(a - 7)), 225 + 260 * math.sin(math.radians(a - 7))),
                                   (160 + 260 * math.cos(math.radians(a + 7)), 225 + 260 * math.sin(math.radians(a + 7)))], (255, 226, 120, 46)) for a in range(0, 360, 30)])
        c.glow(lambda g: g.rrect(60, 175, 260, 275, 20, "#FFC83D"), 18, 0.7)

        def ticket(t):
            t.rrect(0, 0, 220, 112, 12, "#F7C948")
            t.poly([(30, 0), (80, 0), (40, 112), (-10, 112)], "#FFE07A")
            t.rrect(0, 0, 220, 112, 12, None, "#E0A21E", 3)
            t.rrect(10, 10, 210, 102, 8, None, "#C98A1E", 2)
            for y in (56,):
                t.circ(0, y, 13, (0, 0, 0, 0))
                t.circ(220, y, 13, (0, 0, 0, 0))
            for k in range(9):
                t.circ(160, 14 + k * 10.5, 2.2, (0, 0, 0, 0))
            t.poly(star_pts(82, 56, 34, 14), "#FFF3B8")
            t.poly(star_pts(82, 56, 26, 10.5), "#E9A91E")
            for k in range(3):
                t.rrect(178, 30 + k * 20, 196, 38 + k * 20, 3, "#D6951E")
            t.circ(128, 34, 4, "#E9A91E")
            t.circ(128, 78, 4, "#E9A91E")
        c.rotated((220, 112), ticket, 160, 226, 14)
        for x, y, r in ((58, 140, 12), (268, 300, 14), (232, 140, 8), (88, 318, 8)):
            sparkle(c, x, y, r, "#FFF6C8")
        for _ in range(26):
            x, y = rnd.uniform(10, 310), rnd.uniform(60, 440)
            if abs(x - 160) < 120 and abs(y - 226) < 80:
                continue
            a = rnd.uniform(0, 3.1)
            c.line([(x, y), (x + 7 * math.cos(a), y + 7 * math.sin(a))], rnd.choice(BULBS), 3)
    elif idx == 2:  # Autos tamponneuses
        foire_bg(c, rnd, sun=False, garlands=False)
        c.rect(0, 0, W, 34, "#21143A")
        for k in range(0, W + 1, 20):
            c.line([(k, 0), (k, 34)], "#3E2D63", 1.5)
        for k in range(0, 34, 11):
            c.line([(0, k), (W, k)], "#3E2D63", 1.5)
        c.glow(lambda g: [g.circ(x, 36, 4, BULBS[i % 5]) for i, x in enumerate(range(10, W, 25))], 4, 1.0)
        for i, x in enumerate(range(10, W, 25)):
            c.circ(x, 36, 2.4, BULBS[i % 5])
        c.vgrad(0, 340, W, H, "#4A2C70", "#2A1748")
        for k in range(5):
            c.line([(0, 352 + k * 22), (W, 352 + k * 22)], "#563782", 1)
        bumper_car(c, 90, 392, 1, "#E5484D", "#9E2A33")
        bumper_car(c, 230, 392, -1, "#3FA9F5", "#1F66A8")
        c.glow(lambda g: g.poly(star_pts(160, 340, 34, 14, 8, -12), "#FFE36B"), 8, 0.9)
        c.poly(star_pts(160, 340, 30, 13, 8, -12), "#FFE36B")
        c.poly(star_pts(160, 340, 16, 7, 8, 10), "#FFFFFF")
        for y in (300, 318):
            c.line([(18, y), (40, y)], "#FFD6EC", 2)
            c.line([(280, y), (302, y)], "#FFD6EC", 2)
    else:  # Grande roue
        foire_bg(c, rnd, sun=False, garlands=False)
        cx, cy, R = 160, 206, 112
        for lx in (96, 224):
            c.line([(cx, cy), (lx, 396)], "#3A2458", 9)
            c.line([(cx, cy), (lx, 396)], "#5E3F86", 4)
        c.rrect(70, 390, 250, 404, 4, "#3A2458")
        for k in range(12):
            a = math.radians(k * 360 / 12)
            c.line([(cx, cy), (cx + R * math.cos(a), cy + R * math.sin(a))], "#F6D9EC", 2)
        c.circ(cx, cy, R, None, "#FFE3F1", 5)
        c.circ(cx, cy, R * 0.82, None, "#F6C1DF", 2.5)
        cols = ("#FF6FA8", "#FFD84D", "#5FD8F0", "#FF9A3D", "#9B7BFF")
        n = 10
        c.glow(lambda g: [g.circ(cx + R * math.cos(math.radians(k * 15)), cy + R * math.sin(math.radians(k * 15)), 5, BULBS[k % 5]) for k in range(24)], 5, 1.1)
        for k in range(24):
            a = math.radians(k * 15)
            c.circ(cx + R * math.cos(a), cy + R * math.sin(a), 2.6, BULBS[k % 5])
        for k in range(n):
            a = math.radians(k * 360 / n + 9)
            px, py = cx + R * math.cos(a), cy + R * math.sin(a)
            c.line([(px, py), (px, py + 8)], "#3A2458", 2)
            c.pie(px - 13, py + 2, px + 13, py + 16, 180, 360, hx(cols[k % 5], 0.25))
            c.rrect(px - 11, py + 8, px + 11, py + 26, 5, cols[k % 5])
            c.rect(px - 7, py + 12, px + 7, py + 18, "#FFF4FA")
        c.circ(cx, cy, 15, "#FFE3F1")
        c.circ(cx, cy, 7, "#C24F8E")


# --- 13 · La Ferme ---------------------------------------------------------

def barn(c, x, base, s):
    c.rect(x + 40 * s, base - 70 * s, x + 58 * s, base, "#C3C6CF")
    c.pie(x + 40 * s, base - 79 * s, x + 58 * s, base - 61 * s, 180, 360, "#9EA3B0")
    c.rect(x - 40 * s, base - 48 * s, x + 40 * s, base, "#C8413A")
    c.poly([(x - 46 * s, base - 46 * s), (x - 34 * s, base - 72 * s), (x, base - 86 * s), (x + 34 * s, base - 72 * s), (x + 46 * s, base - 46 * s)], "#7E2B27")
    c.rect(x - 14 * s, base - 34 * s, x + 14 * s, base, "#F5F0E6")
    c.rect(x - 11 * s, base - 31 * s, x + 11 * s, base, "#A8342F")
    c.line([(x - 11 * s, base - 31 * s), (x + 11 * s, base)], "#F5F0E6", 2 * s)
    c.line([(x + 11 * s, base - 31 * s), (x - 11 * s, base)], "#F5F0E6", 2 * s)
    c.rect(x - 7 * s, base - 64 * s, x + 7 * s, base - 52 * s, "#F5F0E6")
    c.rect(x - 5 * s, base - 62 * s, x + 5 * s, base - 54 * s, "#5A1E1B")


def farm_bg(c, rnd, sun, sun_r=26, barn_at=None, barn_s=0.8):
    for _ in range(3):
        puff(c, rnd.uniform(20, 300), rnd.uniform(40, 140), rnd.uniform(0.5, 0.85), "#FFFFFF", "#E7F2F7")
    sun_disk(c, sun[0], sun[1], sun_r, "#FFF0B8", 0.4)
    c.poly(hills(rnd, 232, 12, 0.3), "#A9D18E")
    for _ in range(7):
        x, r = rnd.uniform(0, W), rnd.uniform(8, 13)
        c.rect(x - 1.5, 236 - r, x + 1.5, 244, "#6B4A2E")
        c.circ(x, 234 - r, r, "#6FA857")
    if barn_at is not None:
        barn(c, barn_at, 262, barn_s)
    field = hills(rnd, 262, 6, 0)
    c.poly(field, "#E7C766")
    for k in range(-6, 8):
        c.line([(160 + k * 34, 262), (160 + k * 110, 340)], "#D4AF4E", 1.4)
    c.poly(hills(rnd, 330, 8, 0), "#86BF5E")
    for _ in range(40):
        x, y = rnd.uniform(0, W), rnd.uniform(345, 445)
        c.poly([(x - 3, y), (x, y - 7), (x + 3, y)], "#6FA84B")


def fence(c, y, posts=range(10, 330, 52)):
    c.rect(0, y + 8, W, y + 14, "#F2EBDD")
    c.rect(0, y + 28, W, y + 34, "#F2EBDD")
    for x in posts:
        c.rect(x - 4, y, x + 4, y + 52, "#F7F1E4")
        c.poly([(x - 4, y), (x, y - 5), (x + 4, y)], "#F7F1E4")


def ferme_card(c, rnd, idx):
    if idx == 0:  # Botte de foin
        farm_bg(c, rnd, (250, 90), barn_at=70, barn_s=0.7)
        for x in (250, 284):
            c.rect(x - 15, 304, x + 15, 324, "#E2BC55")
            c.line([(x - 15, 312), (x + 15, 312)], "#B98F2E", 1.2)
        c.alpha(lambda o: o.ell(70, 384, 260, 410, (40, 70, 20, 90)))
        c.rect(96, 272, 186, 398, "#D2A745")
        for k in range(12):
            c.line([(98, 280 + k * 10), (186, 280 + k * 10)], "#B88E30", 1.3)
        c.ell(76, 272, 116, 398, "#B88E30")
        c.ell(134, 272, 236, 398, "#EBC862")
        pts = []
        for i in range(260):
            t = i / 259
            a = t * math.pi * 2 * 4.2
            r = 3 + 55 * t
            pts.append((185 + r * math.cos(a) * 0.86, 335 + r * math.sin(a)))
        c.line(pts, "#C69A35", 2)
        for _ in range(40):
            a = rnd.uniform(0, 6.3)
            x, y = 185 + 50 * math.cos(a), 335 + 62 * math.sin(a)
            c.line([(x, y), (x + rnd.uniform(-8, 8), y + rnd.uniform(-8, 8))], "#F4D77E", 1.2)
        for _ in range(20):
            x = rnd.uniform(100, 180)
            c.line([(x, 272), (x + rnd.uniform(-6, 6), 264)], "#E6C25C", 1.2)
    elif idx == 1:  # Tracteur
        farm_bg(c, rnd, (70, 92), barn_at=256, barn_s=0.7)
        c.alpha(lambda o: o.ell(50, 386, 280, 404, (40, 70, 20, 90)))
        red, dred = "#D8432F", "#9E2A20"
        c.rrect(138, 298, 262, 348, 8, red)
        for k in range(5):
            c.line([(252, 306 + k * 8), (260, 306 + k * 8)], dred, 2)
        c.circ(262, 310, 5, "#FFE36B")
        c.rect(205, 256, 213, 300, "#2E2E33")
        for k, (dx, dy, r) in enumerate(((0, -14, 9), (-10, -30, 12), (-26, -46, 15))):
            c.circ(209 + dx, 256 + dy, r, mix((236, 238, 240), (200, 205, 210), k / 3))
        c.rrect(76, 214, 162, 228, 4, dred)
        c.rect(84, 228, 92, 310, "#2E2E33")
        c.rect(146, 228, 154, 310, "#2E2E33")
        c.rect(92, 236, 146, 296, "#BDE6F5")
        c.poly([(98, 240), (112, 240), (96, 270)], "#E4F6FC")
        c.rect(84, 296, 160, 316, red)
        for wx, wy, r, rim in ((112, 342, 52, 26), (232, 368, 27, 13)):
            c.circ(wx, wy, r, "#2B2B2E")
            for k in range(16):
                a = math.radians(k * 22.5)
                c.line([(wx + (r - 6) * math.cos(a), wy + (r - 6) * math.sin(a)), (wx + r * math.cos(a), wy + r * math.sin(a))], "#4A4A50", 3)
            c.circ(wx, wy, rim, "#F7C948")
            c.circ(wx, wy, rim * 0.35, "#A97B1A")
        c.arc(54, 284, 170, 400, 195, 345, red, 9)
    elif idx == 2:  # Vache
        farm_bg(c, rnd, (60, 90), barn_at=258, barn_s=1.0)
        fence(c, 300, range(-10, 330, 64))
        c.alpha(lambda o: o.ell(40, 384, 260, 404, (40, 70, 20, 90)))
        wht, blk = "#FAFAF5", "#2A2A2E"
        for x0, x1, top, bot in ((136, 152, 332, 390), (184, 199, 332, 390)):
            c.rect(x0, top, x1, bot, "#DCDCD4")
            c.rect(x0, bot - 8, x1, bot, "#55504C")
        c.line([(240, 286), (250, 320), (254, 348)], "#E9E9E1", 3)
        c.ell(246, 344, 262, 364, blk)
        body = (96, 270, 244, 344)
        c.rrect(*body, 32, wht)
        c.clip(lambda m: m.rrect(*body, 32, 255), lambda t: [t.poly(blob(rnd, x, y, rx, ry, 0.2), blk) for x, y, rx, ry in ((132, 290, 22, 18), (190, 280, 26, 16), (232, 318, 20, 22), (164, 336, 18, 10))])
        c.ell(194, 334, 226, 356, "#F4B6B0")
        for x0, x1 in ((110, 128), (206, 224)):
            c.rect(x0, 330, x1, 394, wht)
            c.rect(x0, 386, x1, 394, "#55504C")
        c.poly([(70, 250), (66, 236), (78, 244)], "#E8D9B0")
        c.poly([(98, 250), (104, 236), (92, 244)], "#E8D9B0")
        c.ell(26, 246, 56, 262, wht)
        c.ell(110, 244, 140, 260, wht)
        c.ell(32, 250, 50, 258, "#F4B6B0")
        c.rrect(46, 242, 108, 304, 22, wht)
        c.poly(blob(rnd, 92, 262, 14, 16, 0.2), blk)
        c.ell(40, 284, 112, 322, "#F4B6B0")
        c.ell(56, 296, 66, 306, "#C27A74")
        c.ell(86, 296, 96, 306, "#C27A74")
        c.circ(66, 266, 4.5, blk)
        c.circ(67.5, 264.5, 1.4, "#FFFFFF")
        c.line([(96, 316), (112, 326)], "#7A4A2A", 3)
        c.pie(100, 318, 124, 346, 0, 180, "#F7C948")
        c.circ(112, 340, 2.5, "#A97B1A")
    else:  # Coq chanteur
        c.alpha(lambda o: [o.poly([(160, 190), (160 + 300 * math.cos(math.radians(a - 5)), 190 + 300 * math.sin(math.radians(a - 5))),
                                   (160 + 300 * math.cos(math.radians(a + 5)), 190 + 300 * math.sin(math.radians(a + 5)))], (255, 240, 190, 60)) for a in range(0, 360, 24)])
        farm_bg(c, rnd, (160, 190), sun_r=84)
        fence(c, 318, (40, 280))
        c.rect(114, 296, 206, 448, "#A0703F")
        c.rect(110, 290, 210, 302, "#B9854E")
        for y in (330, 372, 410):
            c.line([(124, y), (196, y + 6)], "#7E5530", 1.5)
        with zoom(160, 300, 1.15):
            rooster(c)


def rooster(c):
    """Coq qui chante, perché sur un piquet."""
    for a, L, w, b, col in ((-150, 92, 26, -55, "#2A7560"), (-128, 104, 26, -70, "#14352E"), (-108, 98, 24, -85, "#1F5A4A"),
                            (-170, 80, 22, -40, "#14352E"), (-92, 76, 20, -95, "#C9562C")):
        c.poly(leaf(124, 238, a, L, w, b, fat=0.6), col)
    c.line([(150, 276), (148, 298)], "#F2B33D", 4)
    c.line([(172, 276), (174, 298)], "#F2B33D", 4)
    for fx in (148, 174):
        c.line([(fx - 8, 298), (fx + 10, 298)], "#F2B33D", 3)
    c.ell(108, 198, 210, 286, "#C9562C")
    c.ell(112, 220, 170, 262, "#8E3A1E")
    for k in range(4):
        c.poly(leaf(118 + k * 10, 252, 120, 22, 9), "#6E2A14")
    c.poly([(166, 212), (184, 156), (214, 158), (216, 214), (200, 246), (176, 240)], "#F2A93B")
    for k in range(5):
        c.line([(182 + k * 6, 176 + k * 4), (178 + k * 6, 228)], "#D9822A", 1.4)
    for x, y, r in ((186, 128, 9), (197, 122, 10.5), (209, 125, 9.5), (219, 133, 7.5)):
        c.circ(x, y, r, "#E5302B")
    c.circ(202, 152, 21, "#F2A93B")
    c.ell(198, 140, 222, 166, "#E5302B")
    c.ell(212, 166, 226, 192, "#E5302B")
    c.poly([(218, 145), (244, 148), (219, 154)], "#F7C948")
    c.poly([(218, 158), (238, 168), (217, 163)], "#E3A82F")
    c.circ(208, 149, 4.5, "#FFFFFF")
    c.circ(209, 149, 2.4, "#1E1E1E")

    def note(x, y, s):
        c.rotated((20 * s, 30 * s), lambda t: (t.ell(0, 22 * s, 11 * s, 30 * s, "#FFFFFF"), t.rect(9 * s, 2 * s, 11 * s, 26 * s, "#FFFFFF"),
                                                 t.poly([(9 * s, 2 * s), (18 * s, 8 * s), (18 * s, 13 * s), (11 * s, 8 * s)], "#FFFFFF")), x, y, -10)
    note(256, 128, 1.0)
    note(278, 96, 0.8)
    note(250, 80, 0.65)


# --- 14 · Le Manoir --------------------------------------------------------

def dead_tree(c, x, y, ang, length, width, depth, rnd, col):
    x2 = x + length * math.cos(math.radians(ang))
    y2 = y + length * math.sin(math.radians(ang))
    c.line([(x, y), (x2, y2)], col, width)
    if depth:
        for da in (-rnd.uniform(18, 38), rnd.uniform(18, 38)):
            dead_tree(c, x2, y2, ang + da, length * rnd.uniform(0.6, 0.75), width * 0.62, depth - 1, rnd, col)


def manor(c, x, base, s, rnd, col="#1B1433"):
    win = []
    c.rect(x - 70 * s, base - 80 * s, x + 70 * s, base, col)
    c.poly([(x - 76 * s, base - 80 * s), (x, base - 112 * s), (x + 76 * s, base - 80 * s)], col)
    c.rect(x - 18 * s, base - 130 * s, x + 18 * s, base - 70 * s, col)
    c.poly([(x - 24 * s, base - 130 * s), (x, base - 176 * s), (x + 24 * s, base - 130 * s)], col)
    for tx, top in ((-66, 116), (66, 104)):
        c.rect(x + (tx - 14) * s, base - top * s, x + (tx + 14) * s, base, col)
        c.poly([(x + (tx - 19) * s, base - top * s), (x + tx * s, base - (top + 40) * s), (x + (tx + 19) * s, base - top * s)], col)
        win.append((x + tx * s, base - (top - 22) * s))
    c.rect(x + 34 * s, base - 116 * s, x + 44 * s, base - 88 * s, col)
    for wx in (-44, -22, 22, 44):
        for wy in (54, 24):
            win.append((x + wx * s, base - wy * s))
    win.append((x, base - 104 * s))
    lit = [p for p in win if rnd.random() < 0.6]
    c.glow(lambda g: [g.rect(px - 6 * s, py - 9 * s, px + 6 * s, py + 9 * s, "#FFC14D") for px, py in lit], 5 * s, 0.8)
    for px, py in win:
        c.rect(px - 4 * s, py - 7 * s, px + 4 * s, py + 7 * s, "#FFD36B" if (px, py) in lit else "#2E2650")


def manor_ext(c, rnd, moon, manor_at=(160, 362, 0.9), trees=True):
    stars(c, rnd, 70, 260, ("#FFFFFF", "#D9D0FF"), 1.3)
    mx, my, mr = moon
    c.glow(lambda g: g.circ(mx, my, mr * 1.7, "#B9A8FF"), mr * 0.8, 0.55)
    c.circ(mx, my, mr, "#F4F0DA")
    for dx, dy, r in ((-0.3, -0.2, 0.18), (0.25, 0.3, 0.14), (0.35, -0.25, 0.1), (-0.1, 0.4, 0.09)):
        c.circ(mx + dx * mr, my + dy * mr, r * mr, "#E2DCC2")
    c.alpha(lambda o: [o.ell(x, y, x + w, y + 12, (70, 58, 120, 150)) for x, y, w in ((mx - mr * 1.6, my + mr * 0.3, mr * 1.8), (mx - mr * 0.2, my + mr * 0.65, mr * 1.6))])
    c.poly(hills(rnd, 318, 10, 0.3), "#2E2552")
    if manor_at:
        manor(c, manor_at[0], manor_at[1] - 30, manor_at[2], rnd)
    if trees:
        dead_tree(c, 22, 380, -84, 64, 8, 4, rnd, "#120D22")
        dead_tree(c, 298, 384, -96, 70, 8, 4, rnd, "#120D22")
    c.poly(hills(rnd, 372, 8, 0.3), "#1E1836")
    for x in (60, 108, 226, 270):
        y = 392 + rnd.uniform(-6, 10)
        c.rrect(x - 11, y - 30, x + 11, y + 12, 10, "#3A3260")
        c.line([(x, y - 22), (x, y - 6)], "#2A2348", 2.5)
        c.line([(x - 6, y - 17), (x + 6, y - 17)], "#2A2348", 2.5)
    c.alpha(lambda o: [o.ell(x, y, x + rnd.uniform(90, 160), y + 18, (210, 200, 255, 38)) for x, y in ((-20, 392), (120, 404), (210, 384), (40, 420))], blur=4)


def manor_int(c, rnd, windows=()):
    c.vgrad(0, 0, W, H, "#2B2048", "#3A2C5E")
    for x in range(0, W + 26, 26):
        c.rect(x, 0, x + 10, 330, "#33285A")
    for (x0, y0, x1, y1, moon) in windows:
        c.rect(x0 - 6, y0 - 6, x1 + 6, y1 + 6, "#1A1230")
        c.pie(x0 - 6, y0 - (x1 - x0) / 2 - 6, x1 + 6, y0 + (x1 - x0) / 2 + 6, 180, 360, "#1A1230")
        glass = lambda m, x0=x0, y0=y0, x1=x1, y1=y1: (m.rect(x0, y0, x1, y1, 255), m.pie(x0, y0 - (x1 - x0) / 2, x1, y0 + (x1 - x0) / 2, 180, 360, 255))  # noqa: E731

        def sky(t, x0=x0, y0=y0, x1=x1, y1=y1, moon=moon):
            t.vgrad(x0, y0 - (x1 - x0) / 2, x1, y1, "#141033", "#3E3378")
            for _ in range(8):
                t.circ(rnd.uniform(x0, x1), rnd.uniform(y0 - 20, y1), 0.8, "#FFFFFF")
            if moon:
                t.circ(x0 + (x1 - x0) * 0.55, y0 + 10, 16, "#F4F0DA")
        c.clip(glass, sky)
        mid = (x0 + x1) / 2
        c.line([(mid, y0 - (x1 - x0) / 2), (mid, y1)], "#1A1230", 3)
        c.line([(x0, (y0 + y1) / 2), (x1, (y0 + y1) / 2)], "#1A1230", 3)
        c.poly([(x0 - 14, y0 - 40), (x0 + 10, y0 - 40), (x0 + 2, y1 + 10), (x0 - 16, y1 + 10)], "#5B2A6E")
        c.poly([(x1 + 14, y0 - 40), (x1 - 10, y0 - 40), (x1 - 2, y1 + 10), (x1 + 16, y1 + 10)], "#5B2A6E")
    c.rect(0, 330, W, 410, "#22183A")
    for x in range(8, W, 64):
        c.rect(x, 342, x + 52, 398, None)
        c.rrect(x, 342, x + 52, 398, 3, None, "#33264F", 2)
    c.rect(0, 326, W, 332, "#6B5530")
    c.vgrad(0, 410, W, H, "#1E1530", "#120C1E")
    for x in range(-40, W, 44):
        c.line([(x, 410), (x + 30, H)], "#2A1F40", 1.2)


def cobweb(c, x, y, r, flip=1):
    col = (210, 205, 235, 120)

    def draw(o):
        for k in range(5):
            a = math.radians(k * 22.5)
            o.line([(x, y), (x + flip * r * math.cos(a), y + r * math.sin(a))], col, 1)
        for ring in (0.35, 0.6, 0.85):
            pts = [(x + flip * r * ring * math.cos(math.radians(k * 22.5)), y + r * ring * math.sin(math.radians(k * 22.5))) for k in range(5)]
            o.line(pts, col, 1)
    c.alpha(draw)


def candle(c, x, y, h, flame=True):
    c.rrect(x - 6, y - h, x + 6, y, 2, "#F3EBD3")
    c.ell(x - 6, y - h - 2, x + 6, y - h + 3, "#FFF8E8")
    c.rrect(x + 2, y - h, x + 6, y - h + 12, 2, "#E8DFC4")
    if flame:
        c.glow(lambda g: g.circ(x, y - h - 10, 14, "#FFB040"), 9, 1.0)
        c.poly(leaf(x, y - h - 1, -90, 20, 11), "#FFB347")
        c.poly(leaf(x, y - h - 2, -90, 12, 6), "#FFF2C0")


def manoir_card(c, rnd, idx):
    if idx == 0:  # Chauve-souris
        manor_ext(c, rnd, (160, 176, 82), manor_at=(160, 380, 0.75))
        col = "#1B1230"

        def bat(x, y, s):
            wing = [(12, -6), (42, -26), (82, -38), (112, -14), (96, 4), (82, -2), (72, 20), (56, 8), (40, 26), (16, 12)]
            c.poly([(x + px * s, y + py * s) for px, py in wing], col)
            c.poly([(x - px * s, y + py * s) for px, py in wing], col)
            c.ell(x - 16 * s, y - 22 * s, x + 16 * s, y + 30 * s, col)
            c.circ(x, y - 24 * s, 15 * s, col)
            c.poly([(x - 13 * s, y - 30 * s), (x - 14 * s, y - 52 * s), (x - 3 * s, y - 36 * s)], col)
            c.poly([(x + 13 * s, y - 30 * s), (x + 14 * s, y - 52 * s), (x + 3 * s, y - 36 * s)], col)
            return s
        bat(160, 186, 1.35)
        c.glow(lambda g: [g.circ(160 + dx, 150, 6, "#FF5A3D") for dx in (-8, 8)], 4, 1.1)
        for dx in (-8, 8):
            c.ell(160 + dx - 4.5, 145, 160 + dx + 4.5, 154, "#FFD34D")
        c.poly([(152, 160), (155, 168), (157, 160)], "#FFFFFF")
        c.poly([(163, 160), (165, 168), (168, 160)], "#FFFFFF")
        for x, y, s in ((56, 90, 0.3), (270, 70, 0.25), (262, 270, 0.22), (40, 250, 0.2)):
            bat(x, y, s)
    elif idx == 1:  # Portrait hanté
        manor_int(c, rnd)
        cobweb(c, 0, 0, 70)
        cobweb(c, W, 0, 50, -1)
        for x in (36, 284):
            c.rect(x - 10, 214, x + 10, 220, "#8A6A2A")
            c.line([(x, 220), (x, 236)], "#8A6A2A", 3)
            candle(c, x, 214, 26)
        c.glow(lambda g: g.rrect(70, 92, 250, 324, 10, "#8D7BC4"), 18, 0.75)
        c.rrect(70, 92, 250, 324, 8, "#C9A04A")
        c.rrect(80, 102, 240, 314, 4, "#8A6A2A")
        c.rrect(84, 106, 236, 310, 2, "#E8C66A")
        canvas = (90, 112, 230, 304)

        def paint(t):
            t.vgrad(90, 112, 230, 304, "#2C3A2C", "#18201A")
            t.ell(96, 248, 224, 360, "#16141E")
            t.poly([(144, 254), (160, 290), (176, 254)], "#E9E4D4")
            t.poly([(152, 256), (160, 272), (168, 256)], "#7A1E2E")
            t.rect(148, 228, 172, 258, "#BDB59A")
            t.ell(130, 156, 190, 240, "#D8D0B5")
            t.pie(126, 146, 194, 210, 180, 360, "#211A16")
            t.poly([(126, 178), (132, 160), (140, 186)], "#211A16")
            t.poly([(194, 178), (188, 160), (180, 186)], "#211A16")
            t.arc(144, 206, 176, 226, 20, 160, "#5A3A30", 2)
            t.ell(138, 186, 154, 196, "#1A1012")
            t.ell(166, 186, 182, 196, "#1A1012")
        c.clip(lambda m: m.rect(*canvas, 255), paint)
        c.glow(lambda g: [g.circ(x, 191, 7, "#FF3D3D") for x in (146, 174)], 5, 1.4)
        for x in (146, 174):
            c.circ(x, 191, 3, "#FFE3B0")
        for x, y in ((70, 92), (250, 92), (70, 324), (250, 324)):
            c.circ(x, y, 9, "#E8C66A")
            c.circ(x, y, 4, "#8A6A2A")
        c.pie(136, 70, 184, 118, 180, 360, "#C9A04A")
        for k in range(5):
            a = math.radians(-160 + k * 35)
            c.line([(160, 94), (160 + 22 * math.cos(a), 94 + 22 * math.sin(a))], "#8A6A2A", 1.5)
    elif idx == 2:  # Chandelier
        manor_int(c, rnd, windows=((22, 120, 84, 300, True), (236, 120, 298, 300, False)))
        cobweb(c, 0, 0, 60)
        cobweb(c, W, 0, 70, -1)
        gold, dgold = "#D2A84C", "#8F6A26"
        cx, ry, rx, cy = 160, 22, 100, 232
        c.line([(cx, 0), (cx, 126)], dgold, 3)
        for y in range(8, 126, 12):
            c.ell(cx - 3, y, cx + 3, y + 9, None, gold, 1.5)
        cand = [(cx + rx * math.cos(math.radians(a)), cy + ry * math.sin(math.radians(a)), math.sin(math.radians(a))) for a in range(-90, 270, 45)]
        back = [p for p in cand if p[2] < -0.1]
        front = [p for p in cand if p[2] >= -0.1]
        for x, y, _ in back:
            c.line(bez((cx, 186), (cx + (x - cx) * 0.3, y + 20), (x, y + 24), (x, y)), dgold, 3)
            c.ell(x - 10, y - 3, x + 10, y + 5, dgold)
            candle(c, x, y, 26)
        c.arc(cx - rx, cy - ry, cx + rx, cy + ry, 180, 360, dgold, 6)
        c.poly([(150, 126), (170, 126), (180, 156), (170, 176), (176, 196), (144, 196), (150, 176), (140, 156)], gold)
        c.poly([(152, 130), (158, 130), (150, 158), (156, 190), (148, 190), (144, 158)], "#F0CF7A")
        c.arc(cx - rx, cy - ry, cx + rx, cy + ry, 0, 180, gold, 6)
        for x, y, _ in front:
            c.line(bez((cx, 196), (cx + (x - cx) * 0.3, y + 30), (x, y + 30), (x, y)), gold, 3.5)
            c.ell(x - 11, y - 3, x + 11, y + 6, gold)
            candle(c, x, y, 30)
        for k in range(14):
            a = math.radians(10 + k * 12)
            x, y = cx + rx * math.cos(a), cy + ry * math.sin(a)
            c.poly(leaf(x, y + 4, 90, 12, 5), "#D8D0FF")
        c.alpha(lambda o: [o.line([(cx + 80, 210), (W, 70)], (210, 205, 235, 90), 1), o.line([(cx - 90, 220), (0, 60)], (210, 205, 235, 90), 1)])
    else:  # Fantôme
        manor_ext(c, rnd, (258, 84, 30), manor_at=(160, 384, 0.7))
        cx, top, bot = 160, 120, 300
        r = 62
        pts = [(cx + r * math.cos(math.radians(a)), top + r + r * math.sin(math.radians(a))) for a in range(180, 361, 10)]
        pts.append((cx + r + 4, bot - 20))
        for k in range(41):
            x = cx + r + 4 - k * (2 * r + 8) / 40
            pts.append((x, bot - 18 + 16 * abs(math.sin(math.pi * k / 10))))
        pts.append((cx - r - 4, bot - 20))
        arms = [leaf(cx - r + 4, 220, 165, 34, 26), leaf(cx + r - 4, 216, 5, 34, 26)]
        c.glow(lambda g: [g.poly(pts, "#9F8CFF")] + [g.poly(a, "#9F8CFF") for a in arms], 18, 0.8)
        c.alpha(lambda o: [o.poly(a, (246, 244, 255, 235)) for a in arms] + [o.poly(pts, (246, 244, 255, 240))])
        c.clip(lambda m: m.poly(pts, 255), lambda t: t.ell(cx + 18, top - 10, cx + 120, bot + 10, "#D9D2F7"), opacity=0.8, blur=6)
        c.ell(134, 178, 152, 206, "#1E1636")
        c.ell(168, 178, 186, 206, "#1E1636")
        c.circ(140, 186, 3, "#FFFFFF")
        c.circ(174, 186, 3, "#FFFFFF")
        c.ell(151, 216, 169, 240, "#1E1636")
        c.alpha(lambda o: [o.ell(122, 206, 138, 216, (255, 150, 190, 110)), o.ell(182, 206, 198, 216, (255, 150, 190, 110))])


# --- 15 · Les Pirates ------------------------------------------------------

def palm(c, x, y, h, lean, rnd, trunk="#9A6B3E", leafc="#3FA34D"):
    pts = bez((x, y), (x + lean * 0.1, y - h * 0.4), (x + lean * 0.6, y - h * 0.8), (x + lean, y - h), 16)
    for i in range(len(pts) - 1):
        c.line([pts[i], pts[i + 1]], trunk if i % 2 else hx(trunk, 0.15), h * 0.07 * (1 - i / 30))
    tx, ty = pts[-1]
    for a in (-170, -140, -105, -70, -35, -5, 160, 25):
        c.poly(leaf(tx, ty, a, h * rnd.uniform(0.42, 0.55), h * 0.13, bend=50 if -90 < a < 90 else -50, fat=0.6), leafc if a % 2 else hx(leafc, 0.18))
    c.circ(tx, ty + 3, h * 0.04, "#6B4A2E")
    c.circ(tx + h * 0.05, ty + 4, h * 0.035, "#6B4A2E")


def galleon(c, x, y, s):
    c.alpha(lambda o: o.ell(x - 48 * s, y - 2 * s, x + 48 * s, y + 8 * s, (10, 60, 70, 70)))
    for mx, top, w in ((-20, 68, 22), (2, 84, 28), (24, 60, 20)):
        c.line([(x + mx * s, y - 10 * s), (x + mx * s, y - (top + 4) * s)], "#3A2A20", 2 * s)
        for k, (yy, hh) in enumerate(((top - 4, 20), (top - 28, 24))):
            if yy - hh < 14:
                continue
            ww = w * (0.8 if k == 0 else 1.0)
            c.rrect(x + mx * s - ww / 2 * s, y - yy * s, x + mx * s + ww / 2 * s, y - (yy - hh) * s, 4 * s, "#F6F1E1")
    c.poly([(x + 2 * s, y - 88 * s), (x + 16 * s, y - 85 * s), (x + 2 * s, y - 80 * s)], "#1E1E24")
    c.poly([(x - 48 * s, y - 26 * s), (x - 32 * s, y - 24 * s), (x - 30 * s, y - 10 * s), (x + 36 * s, y - 10 * s), (x + 50 * s, y - 20 * s),
            (x + 34 * s, y + 4 * s), (x - 38 * s, y + 4 * s)], "#6B3F22")
    c.line([(x - 36 * s, y - 4 * s), (x + 38 * s, y - 4 * s)], "#E0B040", 1.6 * s)
    for k in range(5):
        c.circ(x - 22 * s + k * 12 * s, y - 4 * s, 1.6 * s, "#2A1A12")


def pirate_bg(c, rnd, sun, ship=None, sand=360, palms=(), sun_r=26):
    for _ in range(3):
        puff(c, rnd.uniform(20, 300), rnd.uniform(40, 150), rnd.uniform(0.5, 0.9), "#FFFFFF", "#DDF4F4")
    sun_disk(c, sun[0], sun[1], sun_r, "#FFF4C8", 0.4)
    c.vgrad(0, 244, W, H, "#6FDCD4", "#1F8F9A")
    c.rect(0, 243, W, 245.5, "#E8FBF8")
    c.poly([(230, 246), (250, 236), (290, 232), (330, 240), (330, 246)], "#5BA86A")
    if ship:
        galleon(c, *ship)
    for _ in range(18):
        x, y = rnd.uniform(0, W), rnd.uniform(252, sand)
        c.line([(x, y), (x + rnd.uniform(6, 18), y)], "#B6F0EA", 1.3)
    shore = hills(rnd, sand, 8, 0)
    c.poly([(x, y - 5) for x, y in shore[:-2]] + shore[-2:], "#F2FBF8")
    c.poly(shore, "#F2D59B")
    for _ in range(25):
        c.circ(rnd.uniform(0, W), rnd.uniform(sand + 15, H), rnd.uniform(0.8, 1.6), "#E2C07E")
    for x, y, hgt, lean in palms:
        palm(c, x, y, hgt, lean, rnd)


def pirates_card(c, rnd, idx):
    if idx == 0:  # Perroquet
        pirate_bg(c, rnd, (258, 92), ship=(70, 246, 0.5), sand=372, palms=((300, 420, 220, -40),))
        c.line(bez((-10, 324), (60, 316), (150, 318), (236, 300)), "#7A4A26", 13, True)
        c.poly(leaf(200, 306, -40, 30, 12), "#3FA34D")
        for a, L, w, col in ((78, 130, 24, "#D62F2A"), (88, 116, 20, "#2F6FD6"), (68, 100, 18, "#B82420")):
            c.poly(leaf(166, 268, a, L, w, fat=0.5), col)
        c.ell(124, 186, 196, 300, "#E63B2E")
        c.poly(leaf(176, 204, 98, 108, 46, fat=0.6), "#2F6FD6")
        c.poly(leaf(175, 204, 100, 66, 42, fat=0.6), "#3FAE5A")
        c.poly(leaf(174, 204, 104, 40, 36, fat=0.6), "#F7C948")
        for fx in (146, 166):
            c.ell(fx - 7, 304, fx + 7, 322, "#6E6E78")
        c.circ(150, 172, 32, "#E63B2E")
        c.ell(116, 152, 150, 190, "#F4EFE6")
        for k in range(3):
            c.arc(120, 158 + k * 8, 146, 170 + k * 8, 200, 340, "#C9B9A8", 1)
        c.poly([(130, 158), (108, 158), (94, 172), (98, 194), (110, 182), (126, 182)], "#EDE3CF")
        c.poly([(110, 182), (128, 178), (130, 194), (114, 198)], "#2B2B2B")
        c.circ(138, 166, 6, "#F7C948")
        c.circ(138, 166, 3.5, "#1E1E1E")
        c.circ(136.5, 164.5, 1.2, "#FFFFFF")
    elif idx == 1:  # Longue-vue
        pirate_bg(c, rnd, (70, 96), ship=(262, 246, 0.75), sand=470)
        c.rect(0, 360, W, 378, "#7A4A26")
        c.rect(0, 356, W, 362, "#9A6B3E")
        for x in range(10, W, 34):
            c.rrect(x, 378, x + 16, H, 6, "#6B3F22")
        c.rect(0, 430, W, H, "#5A341C")
        p0, p1 = (40, 420), (222, 268)
        segs = ((0.0, 0.1, 8, 8, "#C99A3A"), (0.1, 0.46, 16, 15, "#6B3F22"), (0.46, 0.7, 13, 13, "#D4A84A"),
                (0.7, 0.88, 11.5, 11.5, "#E0B65A"), (0.88, 1.0, 13, 16, "#C99A3A"))
        c.alpha(lambda o: o.poly(tube((p0[0], p0[1] + 18), (p1[0], p1[1] + 24), 12, 12), (40, 20, 10, 70)), blur=3)
        for t0, t1, r0, r1, col in segs:
            q0, q1 = lerp(p0, p1, t0), lerp(p0, p1, t1)
            c.poly(tube(q0, q1, r0, r1), col)
            c.poly(tube(lerp(q0, q1, 0.0), lerp(q0, q1, 1.0), r0 * 0.25, r1 * 0.25), hx(col, 0.35, "#FFFFFF"))
        for t, r in ((0.1, 17), (0.46, 16), (0.7, 14), (0.88, 13)):
            q = lerp(p0, p1, t)
            c.poly(tube(lerp(p0, p1, t - 0.012), lerp(p0, p1, t + 0.012), r, r), "#8A6420")
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]
        ang = math.degrees(math.atan2(dy, dx))
        c.rotated((14, 34), lambda t: t.ell(0, 0, 14, 34, "#9FE3F0"), p1[0], p1[1], -ang)
        c.glow(lambda g: g.circ(p1[0] + 4, p1[1] - 4, 10, "#FFFFFF"), 6, 1.0)
        sparkle(c, p1[0] + 4, p1[1] - 4, 14, "#FFFFFF")
    elif idx == 2:  # Canon
        pirate_bg(c, rnd, (66, 98), ship=(256, 246, 0.55), sand=330, palms=((20, 380, 170, 30),))
        for x, y in ((236, 392), (258, 392), (280, 392), (247, 374), (269, 374), (258, 356)):
            c.circ(x, y, 11, "#2E2F38")
            c.circ(x - 3, y - 3, 3.5, "#6A6C7A")
        c.alpha(lambda o: o.ell(60, 382, 230, 404, (90, 60, 20, 80)))
        c.poly([(70, 330), (190, 306), (196, 336), (84, 364)], "#8B5A2B")
        c.poly([(70, 330), (190, 306), (192, 316), (74, 342)], "#A97040")
        p0, p1 = (88, 316), (232, 262)
        c.poly(tube(p0, p1, 24, 17), "#2E2F38")
        c.poly(tube(lerp(p0, p1, 0.02), lerp(p0, p1, 0.98), 8, 5), "#4F5262")
        for t, r in ((0.3, 25), (0.62, 22), (0.96, 21)):
            q0, q1 = lerp(p0, p1, t - 0.025), lerp(p0, p1, t + 0.025)
            c.poly(tube(q0, q1, r, r), "#24252C")
        c.circ(78, 320, 12, "#2E2F38")
        c.circ(66, 324, 7, "#2E2F38")
        c.rotated((14, 40), lambda t: t.ell(0, 0, 14, 40, "#15161B"), 234, 261, 21)
        for wx, wy, r in ((100, 356, 28), (182, 340, 24)):
            c.circ(wx, wy, r, "#6B3F22")
            c.circ(wx, wy, r - 6, "#8B5A2B")
            for k in range(6):
                a = math.radians(k * 30)
                c.line([(wx - (r - 6) * math.cos(a), wy - (r - 6) * math.sin(a)), (wx + (r - 6) * math.cos(a), wy + (r - 6) * math.sin(a))], "#6B3F22", 3)
            c.circ(wx, wy, 6, "#3A2A20")
        c.glow(lambda g: g.circ(250, 254, 20, "#FF9A3D"), 10, 1.0)
        c.poly(star_pts(250, 254, 22, 9, 7, -20), "#FFD36B")
        for x, y, r in ((268, 236, 18), (292, 222, 22), (282, 196, 16), (306, 192, 14), (262, 210, 12)):
            c.circ(x, y, r, "#E9EEF0")
        for x, y, r in ((272, 242, 10), (296, 230, 12)):
            c.circ(x, y, r, "#C9D2D6")
    else:  # Coffre au trésor
        pirate_bg(c, rnd, (250, 80), sand=300, palms=((10, 360, 200, 40), (312, 360, 190, -36)))
        c.alpha(lambda o: [o.poly([(160, 250), (160 + 260 * math.cos(math.radians(a - 8)), 250 + 260 * math.sin(math.radians(a - 8))),
                                   (160 + 260 * math.cos(math.radians(a + 8)), 250 + 260 * math.sin(math.radians(a + 8)))], (255, 230, 140, 70)) for a in range(195, 350, 26)])
        with zoom(160, 300, 1.22):
            chest(c, rnd)


def chest(c, rnd):
    """Coffre ouvert débordant d'or."""
    c.glow(lambda g: g.ell(80, 180, 240, 300, "#FFC83D"), 20, 0.8)
    c.alpha(lambda o: o.ell(70, 324, 250, 352, (120, 80, 20, 90)))
    c.poly([(92, 262), (228, 262), (220, 188), (100, 188)], "#5A3418")
    c.poly([(100, 196), (220, 196), (226, 254), (94, 254)], "#3A2210")

    c.line([(100, 188), (220, 188)], "#E0B040", 5)
    c.line([(100, 188), (92, 262)], "#E0B040", 5)
    c.line([(220, 188), (228, 262)], "#E0B040", 5)
    c.ell(92, 232, 228, 286, "#F2B632")
    for _ in range(24):
        x = rnd.uniform(100, 220)
        y = rnd.uniform(236, 268) - 10 * math.sin(math.pi * (x - 92) / 136)
        r = rnd.uniform(6, 9)
        c.circ(x, y, r, "#F7C948")
        c.circ(x, y, r * 0.65, None, "#D9971E", 1.2)
    for x, y, col in ((126, 238, "#E5484D"), (184, 234, "#3FCF8E"), (158, 226, "#4FA3FF"), (204, 250, "#C46BFF")):
        c.poly([(x, y - 10), (x + 9, y), (x, y + 10), (x - 9, y)], col)
        c.poly([(x, y - 10), (x + 4, y - 2), (x - 4, y - 2)], "#FFFFFF")
    c.rrect(86, 262, 234, 340, 6, "#8B5A2B")
    for k in range(3):
        c.line([(90, 286 + k * 18), (230, 286 + k * 18)], "#6E4320", 2)
    for x in (100, 210):
        c.rect(x, 262, x + 12, 340, "#E0B040")
        for y in (272, 300, 328):
            c.circ(x + 6, y, 2, "#9C6E1A")
    c.rect(86, 262, 234, 270, "#E0B040")
    c.rrect(146, 270, 174, 304, 4, "#F2C94C")
    c.circ(160, 284, 4.5, "#3A2210")
    c.poly([(158, 286), (162, 286), (163, 296), (157, 296)], "#3A2210")
    pearl = [(110 + k * 7, 266 + 22 * math.sin(math.pi * k / 10)) for k in range(11)]
    for x, y in pearl:
        c.circ(x, y, 3.2, "#FFF8F0")
    for x, y in ((60, 360), (250, 370), (226, 352), (88, 380)):
        c.circ(x, y, 7, "#F7C948")
        c.circ(x, y, 4.5, None, "#D9971E", 1.2)
    for x, y, r in ((96, 210, 10), (232, 222, 12), (160, 160, 9), (60, 286, 7), (268, 300, 8)):
        sparkle(c, x, y, r, "#FFFBE0")


# --- 16 · Le Désert --------------------------------------------------------

def dunes(c, rnd, layers):
    for base, amp, col in layers:
        pts = hills(rnd, base, amp, 0)
        c.poly(pts, col)
        c.line(pts[:-2], hx(col, 0.3, "#FFFFFF"), 1.6)


def desert_sky(c, rnd, sun, sun_r=34):
    c.glow(lambda g: g.circ(sun[0], sun[1], sun_r * 2.4, "#FFD98A"), sun_r * 1.4, 0.3)
    sun_disk(c, sun[0], sun[1], sun_r, "#FFF8E0", 0.3)
    c.alpha(lambda o: [o.line([(x, y), (x + rnd.uniform(40, 90), y)], (255, 250, 230, 60), 1.5) for x, y in ((rnd.uniform(0, 260), rnd.uniform(150, 240)) for _ in range(6))])


def desert_card(c, rnd, idx):
    if idx == 0:  # Cactus
        desert_sky(c, rnd, (70, 100))
        dunes(c, rnd, ((256, 14, "#F4C27C"), (300, 16, "#EDB05A")))
        for x, h in ((262, 40), (40, 30)):
            c.rrect(x - 4, 300 - h, x + 4, 300, 4, "#6C9E58")
        dunes(c, rnd, ((372, 14, "#E39A3A"),))
        c.alpha(lambda o: o.ell(110, 388, 240, 406, (120, 60, 10, 80)))
        g, dg, lg = "#4E9A55", "#3A7E44", "#71BE70"
        parts = [(138, 160, 182, 400, 22), (90, 280, 150, 306, 13), (90, 212, 116, 306, 13), (170, 240, 228, 266, 13), (202, 186, 228, 266, 13)]
        for p in parts:
            c.rrect(*p[:4], p[4], g)
        c.rrect(144, 170, 154, 392, 5, lg)
        c.rrect(95, 220, 101, 296, 3, lg)
        c.rrect(207, 194, 213, 258, 3, lg)
        for x in (164, 172):
            c.line([(x, 172), (x, 396)], dg, 1.6)
        for x in (108,):
            c.line([(x, 222), (x, 300)], dg, 1.4)
        c.line([(220, 196), (220, 262)], dg, 1.4)
        for _ in range(30):
            x, y = rnd.choice(((rnd.uniform(140, 180), rnd.uniform(170, 390)), (rnd.uniform(92, 114), rnd.uniform(216, 300)), (rnd.uniform(204, 226), rnd.uniform(190, 262))))
            c.line([(x, y), (x + 3, y - 2)], "#E8F2C8", 1)
        for x, y, s in ((160, 160, 1.0), (103, 212, 0.7), (215, 186, 0.7)):
            for a in range(-180, 0, 36):
                c.poly(leaf(x, y, a, 12 * s, 7 * s), "#FF8FB8")
            c.circ(x, y - 2 * s, 3 * s, "#FFD84D")
        dunes(c, rnd, ((430, 8, "#D88A2C"),))
        for x in (40, 280):
            c.ell(x - 18, 418, x + 18, 438, "#B9773A")
            c.ell(x - 14, 416, x + 10, 430, "#CF8E4E")
    elif idx == 1:  # Chameau
        desert_sky(c, rnd, (250, 92))
        dunes(c, rnd, ((256, 12, "#F4C27C"),))
        for k in range(4):
            x = 40 + k * 18
            c.ell(x - 6, 248, x + 6, 254, "#B07A3C")
            c.circ(x - 1, 245, 3, "#B07A3C")
            c.line([(x - 6, 248), (x - 9, 242)], "#B07A3C", 1.5)
            c.line([(x - 4, 252), (x - 4, 258)], "#B07A3C", 1)
            c.line([(x + 4, 252), (x + 4, 258)], "#B07A3C", 1)
        dunes(c, rnd, ((310, 16, "#EDB05A"),))
        c.poly([(0, 392), (80, 378), (180, 372), (260, 380), (W, 396), (W, H), (0, H)], "#E39A3A")
        c.line([(0, 392), (80, 378), (180, 372), (260, 380), (W, 396)], "#F4C27C", 1.6)
        col, dk = "#C98B4A", "#A06A33"
        c.alpha(lambda o: o.ell(80, 374, 250, 392, (120, 60, 10, 80)))
        for x0, x1, x2 in ((132, 136, 134), (212, 218, 214)):
            c.line([(x0, 290), (x1, 334), (x2, 380)], dk, 9, True)
        for x0, x1, x2 in ((118, 112, 116), (196, 200, 198)):
            c.line([(x0, 292), (x1, 336), (x2, 380)], col, 10, True)
        for fx in (116, 198, 134, 214):
            c.ell(fx - 8, 376, fx + 9, 384, "#7A5028")
        c.line([(236, 268), (244, 300), (242, 318)], dk, 3)
        c.ell(238, 312, 248, 330, "#5A3A1C")
        c.ell(98, 236, 242, 304, col)
        c.ell(120, 190, 170, 256, col)
        c.ell(168, 186, 218, 256, col)
        c.poly([(160, 228), (178, 228), (186, 284), (154, 284)], "#D6453A")
        c.line([(154, 284), (186, 284)], "#F7C948", 3)
        for k in range(5):
            c.line([(156 + k * 7, 284), (156 + k * 7, 294)], "#F7C948", 2)
        c.line(bez((114, 262), (84, 270), (60, 236), (64, 196)), col, 26, True)
        c.ell(18, 174, 82, 210, col)
        c.ell(12, 186, 46, 214, hx(col, 0.15, "#FFFFFF"))
        c.ell(68, 168, 80, 184, dk)
        c.circ(54, 186, 3.6, "#2B1A10")
        c.circ(55, 185, 1.2, "#FFFFFF")
        c.line([(46, 180), (60, 179)], dk, 1.6)
        c.line([(14, 202), (26, 205)], "#5A3A1C", 1.5)
    elif idx == 2:  # Mirage
        desert_sky(c, rnd, (160, 70), 28)
        c.vgrad(0, 270, W, H, "#F2C27A", "#E39A3A")
        c.alpha(lambda o: [o.rect(0, y, W, y + 3, (150, 215, 240, 70 + (y % 9) * 6)) for y in range(256, 292, 5)])
        lay = c.layer("RGBA")
        lay.ell(70, 262, 250, 284, (110, 200, 230, 255))
        lay.ell(96, 266, 224, 278, (170, 230, 245, 255))
        for x, h, lean in ((112, 92, -20), (150, 112, 10), (206, 84, 24)):
            pts = bez((x, 268), (x + lean * 0.1, 268 - h * 0.4), (x + lean * 0.6, 268 - h * 0.8), (x + lean, 268 - h), 12)
            lay.line(pts, (60, 120, 90, 255), 5)
            tx, ty = pts[-1]
            for a in (-170, -140, -105, -70, -35, -5):
                lay.poly(leaf(tx, ty, a, h * 0.45, h * 0.12, bend=45 if a > -90 else -45, fat=0.6), (60, 150, 100, 255))
        im = lay.img
        refl = im.crop((0, 0, im.width, 268 * SS)).transpose(Image.FLIP_TOP_BOTTOM)
        refl = refl.point(lambda v: v)
        im.alpha_composite(Image.blend(Image.new("RGBA", refl.size, (0, 0, 0, 0)), refl, 0.6), (0, 268 * SS))
        wavy = Image.new("RGBA", im.size, (0, 0, 0, 0))
        for y in range(im.height):
            off = int(3.5 * SS * math.sin(y / (5.5 * SS)))
            wavy.paste(im.crop((0, y, im.width, y + 1)), (off, y))
        wavy = wavy.filter(ImageFilter.GaussianBlur(0.8 * SS))
        a = wavy.getchannel("A").point(lambda v: int(v * 0.7))
        wavy.putalpha(a)
        c._reset(Image.alpha_composite(c.img.convert("RGBA"), wavy).convert("RGB"))
        c.alpha(lambda o: [o.line([(rnd.uniform(-20, 120), y), (rnd.uniform(200, 340), y)], (255, 255, 255, 70), 1.5) for y in range(190, 300, 7)])
        dunes(c, rnd, ((340, 16, "#E9A23B"), (408, 14, "#D88A2C")))
        for k in range(7):
            x, y = 70 + k * 26, 440 - k * 14
            c.ell(x - 4, y - 2, x + 4, y + 3, "#B86E22")
    else:  # Pyramide
        desert_sky(c, rnd, (236, 104), 30)
        dunes(c, rnd, ((262, 10, "#F4C27C"),))
        for x, s in ((40, 0.28), (286, 0.35)):
            c.poly([(x - 60 * s, 266), (x, 266 - 80 * s), (x + 60 * s, 266)], "#E8B062")
            c.poly([(x + 18 * s, 266), (x, 266 - 80 * s), (x + 60 * s, 266)], "#D49A4A")
        apex, L, R, sp = (150, 116), 18, 286, 206
        base = 334
        c.poly([(L, base), apex, (sp, base)], "#F2C46B")
        c.poly([(sp, base), apex, (R, base)], "#C98A35")
        for k in range(1, 16):
            y = apex[1] + k * 14
            t = (y - apex[1]) / (base - apex[1])
            xl, xs, xr = apex[0] + (L - apex[0]) * t, apex[0] + (sp - apex[0]) * t, apex[0] + (R - apex[0]) * t
            c.line([(xl, y), (xs, y)], "#DDA851", 1.3)
            c.line([(xs, y), (xr, y)], "#B07428", 1.3)
        c.poly([(apex[0], apex[1]), (apex[0] - 10, apex[1] + 14), (apex[0] + 2, apex[1] + 14)], "#FFE7A0")
        c.poly([(132, base), (148, 302), (164, base)], "#6E4A22")
        dunes(c, rnd, ((350, 12, "#E9A23B"), (414, 12, "#D88A2C")))


# --- 17 · Les Mines --------------------------------------------------------

VP = (160, 236)


def crystal(c, x, y, ang, L, w, col):
    a = math.radians(ang)
    dx, dy = math.cos(a), math.sin(a)
    nx, ny = -dy, dx
    p = [(x + nx * w, y + ny * w), (x + nx * w + dx * L * 0.75, y + ny * w + dy * L * 0.75), (x + dx * L, y + dy * L),
         (x - nx * w + dx * L * 0.75, y - ny * w + dy * L * 0.75), (x - nx * w, y - ny * w)]
    c.poly(p, col)
    c.poly([p[0], p[1], p[2], (x + dx * L * 0.75, y + dy * L * 0.75), (x, y)], hx(col, 0.45, "#FFFFFF"))


def cluster(c, rnd, x, y, s, ang, cols=("#5FD8F0", "#3BB4D8", "#9B7BFF")):
    shapes = [(ang + rnd.uniform(-35, 35), rnd.uniform(18, 34) * s, rnd.uniform(4, 7) * s, rnd.choice(cols)) for _ in range(5)]
    c.glow(lambda g: g.circ(x + 14 * s * math.cos(math.radians(ang)), y + 14 * s * math.sin(math.radians(ang)), 22 * s, cols[0]), 12 * s, 0.7)
    for a, L, w, col in sorted(shapes, key=lambda t: -t[1]):
        crystal(c, x, y, a, L, w, col)


def mine_bg(c, rnd, rails=True, crystals=True, frames=(0.38, 0.62, 1.0)):
    vx, vy = VP

    def fr(s):
        return vx - 140 * s, vy - 180 * s, vx + 140 * s, vy + 220 * s
    c.glow(lambda g: g.ell(vx - 40, vy - 50, vx + 40, vy + 50, "#2E8FB0"), 30, 0.6)
    for side in (-1, 1):
        for k in range(10):
            y0 = rnd.uniform(-20, 440)
            x0 = vx + side * rnd.uniform(60, 180)
            c.poly(blob(rnd, x0, y0, rnd.uniform(30, 60), rnd.uniform(30, 70), 0.25, 7), rnd.choice(("#152733", "#182C38", "#13232D")))
    x0, y0, x1, y1 = fr(frames[0])
    c.poly([(x0, y1), (x1, y1), (W + 40, H), (-40, H)], "#1A2A33")
    for i, s in enumerate(frames):
        x0, y0, x1, y1 = fr(s)
        t = 22 * s
        col = mix(hex_rgb("#6B4A2A"), hex_rgb("#0E1A22"), 0.65 * (1 - i / (len(frames) - 1)))
        dk = mix(col, (0, 0, 0), 0.3)
        c.rect(x0, y0, x0 + t, y1, col)
        c.rect(x1 - t, y0, x1, y1, col)
        c.rect(x0 - t * 0.4, y0, x1 + t * 0.4, y0 + t * 1.1, col)
        c.line([(x0 + t, y0 + t * 1.1), (x0 + t, y1)], dk, 2 * s)
        c.line([(x1 - t, y0 + t * 1.1), (x1 - t, y1)], dk, 2 * s)
        c.line([(x0 - t * 0.4, y0 + t * 1.1), (x1 + t * 0.4, y0 + t * 1.1)], dk, 2 * s)
    for _ in range(12):
        x = rnd.uniform(0, W)
        c.poly([(x - 8, 0), (x + 8, 0), (x + rnd.uniform(-2, 2), rnd.uniform(16, 40))], "#0F1C25")
    if rails:
        for s in (0.42, 0.5, 0.6, 0.72, 0.87, 1.05, 1.27):
            y = vy + 220 * s
            c.rect(vx - 78 * s, y - 5 * s, vx + 78 * s, y + 3 * s, "#4A3420")
        for side in (-1, 1):
            c.line([(vx + side * 56 * 0.4, vy + 220 * 0.4), (vx + side * 56 * 1.4, vy + 220 * 1.4)], "#8A93A3", 4)
            c.line([(vx + side * 56 * 0.4, vy + 220 * 0.4 - 1), (vx + side * 56 * 1.4, vy + 220 * 1.4 - 1)], "#C3CAD6", 1.5)
    if crystals:
        for x, y, s, a in ((18, 300, 1.0, -60), (304, 250, 0.9, -120), (40, 120, 0.7, 30), (290, 92, 0.7, 150), (250, 400, 0.8, -100), (70, 420, 0.7, -70)):
            cluster(c, rnd, x, y, s, a)


def mines_card(c, rnd, idx):
    if idx == 0:  # Wagonnet
        mine_bg(c, rnd)
        c.alpha(lambda o: o.ell(84, 372, 236, 392, (0, 0, 0, 110)))
        for wx in (122, 198):
            c.circ(wx, 366, 17, "#2A2D33")
            c.circ(wx, 366, 9, "#6E7480")
            c.circ(wx, 366, 3, "#2A2D33")
        for _ in range(16):
            c.circ(rnd.uniform(96, 224), rnd.uniform(262, 286), rnd.uniform(9, 16), rnd.choice(("#3A3F47", "#4A505A", "#30343B")))
        for x, y in ((120, 264), (190, 262), (152, 256)):
            c.circ(x, y, 6, "#F7C948")
            c.circ(x - 2, y - 2, 2, "#FFF0A8")
        cluster(c, rnd, 142, 270, 1.0, -100)
        cluster(c, rnd, 200, 272, 0.8, -70)
        body = [(78, 278), (242, 278), (224, 360), (96, 360)]
        c.poly(body, "#5F6673")
        c.poly([(78, 278), (242, 278), (238, 296), (82, 296)], "#454B57")
        c.clip(lambda m: m.poly(body, 255), lambda t: [t.poly(blob(rnd, x, y, rx, ry, 0.3), "#8A5A3C") for x, y, rx, ry in ((110, 340, 18, 10), (210, 310, 12, 16), (160, 352, 14, 6))])
        for x in (112, 160, 208):
            c.line([(x, 296), (x - (x - 160) * 0.12, 360)], "#454B57", 5)
        for x in range(92, 232, 14):
            c.circ(x, 287, 2, "#8E96A6")
        c.rect(96, 356, 224, 364, "#3A3F4A")
    elif idx == 1:  # Lanterne
        mine_bg(c, rnd, frames=(0.38, 0.62))
        c.rect(-10, 40, W + 10, 66, "#6B4A2A")
        c.line([(-10, 66), (W + 10, 66)], "#4A3220", 2)
        c.glow(lambda g: g.circ(160, 222, 110, "#FF9A3D"), 50, 0.55)
        c.glow(lambda g: g.circ(160, 222, 44, "#FFC060"), 16, 0.9)
        c.line([(160, 66), (160, 106)], "#2A2D33", 2.5)
        c.arc(136, 98, 184, 150, 190, 350, "#2A2D33", 4)
        c.poly([(132, 148), (188, 148), (176, 128), (144, 128)], "#3A3F4A")
        c.rect(152, 118, 168, 128, "#3A3F4A")
        c.rect(124, 148, 196, 160, "#2A2D33")
        c.vgrad(132, 160, 188, 268, "#FFE7A8", "#FFB04A")
        c.poly(leaf(160, 250, -90, 50, 24, fat=0.7), "#FF8A2E")
        c.poly(leaf(160, 248, -90, 32, 13, fat=0.7), "#FFF6D0")
        c.rect(156, 248, 164, 268, "#3A3F4A")
        for x in (132, 160, 188):
            c.line([(x, 160), (x, 268)], "#2A2D33", 4)
        c.arc(126, 180, 194, 232, 200, 340, "#2A2D33", 2.5)
        c.rect(124, 266, 196, 278, "#2A2D33")
        c.rect(136, 278, 184, 286, "#3A3F4A")
        c.alpha(lambda o: o.rect(136, 164, 144, 260, (255, 255, 255, 90)))
    elif idx == 2:  # Pépite d'or
        mine_bg(c, rnd, rails=False)
        c.poly([(-10, 340), (60, 322), (140, 330), (230, 318), (330, 336), (330, H), (-10, H)], "#22343F")
        c.line([(-10, 340), (60, 322), (140, 330), (230, 318), (330, 336)], "#35505E", 2)
        c.line([(292, 420), (262, 236)], "#7A4A26", 8, True)
        c.poly(bez((216, 252), (246, 222), (284, 222), (316, 246), 12) + [(314, 258), (284, 242), (248, 242), (218, 264)], "#8E96A6")
        c.glow(lambda g: g.ell(84, 230, 236, 340, "#FFB020"), 24, 0.8)
        nug = blob(rnd, 160, 288, 74, 46, 0.12, 16)
        c.poly(nug, "#C8861E")
        c.poly([(x - 6 + (x - 160) * -0.12, y - 6 + (y - 288) * -0.12) for x, y in nug], "#E8B13A")
        c.poly(blob(rnd, 146, 274, 40, 22, 0.2, 9), "#F7C948")
        c.poly(blob(rnd, 134, 268, 16, 8, 0.2, 7), "#FFF0A8")
        for pts in (((176, 262), (206, 276), (194, 300)), ((120, 300), (150, 312), (124, 322)), ((184, 306), (214, 296), (200, 322))):
            c.poly(pts, "#B07418")
        for pts in (((150, 250), (180, 256), (164, 274)), ((100, 280), (118, 266), (126, 292))):
            c.poly(pts, "#FFE58A")
        for x, y, r in ((110, 254, 13), (214, 268, 10), (168, 246, 8), (196, 318, 7)):
            sparkle(c, x, y, r, "#FFFFFF")
        for _ in range(10):
            c.circ(rnd.uniform(40, 280), rnd.uniform(345, 430), rnd.uniform(1.2, 2.5), "#F7C948")
    else:  # Géode
        mine_bg(c, rnd, rails=True, crystals=False)
        cx, cy = 160, 224
        c.glow(lambda g: g.circ(cx, cy, 116, "#5FD8F0"), 26, 0.55)
        c.poly(blob(rnd, cx, cy, 112, 108, 0.06, 28), "#5E5866")
        c.poly(blob(rnd, cx, cy, 100, 97, 0.04, 28), "#8C8696")
        c.circ(cx, cy, 88, "#EAF6FA")
        c.circ(cx, cy, 80, "#0E2236")
        cols = ("#5FD8F0", "#8FE9FA", "#3BB4D8", "#B49BFF", "#7FDFF5")
        for ring, n, r0, r1 in ((0, 22, 82, 46), (1, 14, 62, 26)):
            for k in range(n):
                a = 2 * math.pi * (k + 0.5 * ring) / n
                da = math.pi / n * 1.05
                tip_r = r1 + rnd.uniform(-6, 8)
                ta = a + rnd.uniform(-0.08, 0.08)
                b1 = (cx + r0 * math.cos(a - da), cy + r0 * math.sin(a - da))
                b2 = (cx + r0 * math.cos(a + da), cy + r0 * math.sin(a + da))
                tip = (cx + tip_r * math.cos(ta), cy + tip_r * math.sin(ta))
                mid = (cx + r0 * math.cos(a), cy + r0 * math.sin(a))
                col = cols[(k + ring) % len(cols)]
                c.poly([b1, b2, tip], col)
                c.poly([b1, mid, tip], hx(col, 0.35, "#FFFFFF"))
        c.glow(lambda g: g.circ(cx, cy, 26, "#7FE9FF"), 14, 1.0)
        for x, y, r in ((cx - 40, cy - 46, 9), (cx + 52, cy + 20, 7), (cx - 10, cy + 54, 6)):
            sparkle(c, x, y, r, "#FFFFFF")


# --- 18 · L'Archipel -------------------------------------------------------

def island(c, rnd, x, y, s, tree=True, house=False, falls=False, pond=False):
    rx, ry = 62 * s, 13 * s
    pts = [(x - rx, y)]
    for k in range(1, 6):
        t = k / 6
        pts.append((x - rx * (1 - t) + rnd.uniform(-4, 4) * s, y + 80 * s * t ** 0.9 + rnd.uniform(-5, 5) * s))
    pts.append((x + rnd.uniform(-6, 6) * s, y + 92 * s))
    for k in range(5, 0, -1):
        t = k / 6
        pts.append((x + rx * (1 - t) + rnd.uniform(-4, 4) * s, y + 74 * s * t ** 0.9 + rnd.uniform(-5, 5) * s))
    pts.append((x + rx, y))
    c.poly(pts, "#A08B78")
    c.poly([(x, y)] + pts[6:], "#7D6A5B")
    for k in range(3):
        yy = y + (18 + k * 18) * s
        c.line([(x - rx * (0.8 - k * 0.22), yy), (x + rx * (0.8 - k * 0.22), yy + 3 * s)], "#8E7A68", 1.2 * s)
    c.ell(x - rx, y - ry * 0.4, x + rx, y + ry * 1.5, "#8B6A4A")
    c.ell(x - rx, y - ry, x + rx, y + ry, "#7ED37A")
    c.ell(x - rx * 0.8, y - ry * 0.9, x + rx * 0.5, y + ry * 0.2, "#9BE38F")
    for k in range(4):
        vx = x - rx * 0.7 + k * rx * 0.45 + rnd.uniform(-5, 5) * s
        c.line([(vx, y + ry * 0.9), (vx + rnd.uniform(-3, 3) * s, y + ry + rnd.uniform(12, 26) * s)], "#5DA85A", 1.6 * s)
    if pond:
        c.ell(x + rx * 0.05, y - ry * 0.45, x + rx * 0.75, y + ry * 0.45, "#7FD3F5")
    if falls:
        fx = x + rx * 0.72
        c.alpha(lambda o: o.poly([(fx - 5 * s, y + 2), (fx + 5 * s, y + 2), (fx + 7 * s, y + 140 * s), (fx - 7 * s, y + 140 * s)], (215, 245, 255, 200)))
    if tree:
        tx = x - rx * 0.4
        c.rect(tx - 2.5 * s, y - 22 * s, tx + 2.5 * s, y, "#7A5232")
        for dx, dy, r in ((0, -34, 16), (-10, -24, 12), (11, -25, 12)):
            c.circ(tx + dx * s, y + dy * s, r * s, "#3F9A4E")
        c.circ(tx - 4 * s, y - 38 * s, 8 * s, "#5DBA62")
    if house:
        hxp = x + rx * 0.25
        c.rect(hxp - 15 * s, y - 24 * s, hxp + 15 * s, y - 2 * s, "#FFF4E2")
        c.poly([(hxp - 20 * s, y - 22 * s), (hxp, y - 40 * s), (hxp + 20 * s, y - 22 * s)], "#E5584D")
        c.rect(hxp - 4 * s, y - 14 * s, hxp + 4 * s, y - 2 * s, "#8B5A2B")
        c.rect(hxp + 7 * s, y - 18 * s, hxp + 12 * s, y - 12 * s, "#7FD3F5")
        c.rect(hxp + 8 * s, y - 40 * s, hxp + 13 * s, y - 28 * s, "#B04A3E")


def cloud_sea(c, rnd, tops=(352, 386, 420)):
    cols = ("#CFE9F8", "#E9F6FD", "#FFFFFF")
    for top, col in zip(tops, cols):
        x = -20
        while x < W + 30:
            r = rnd.uniform(18, 34)
            c.circ(x, top + rnd.uniform(-6, 6), r, col)
            x += r * 1.1
        c.rect(0, top, W, H, col)


def sky_bg(c, rnd, sun, far=True):
    sun_disk(c, sun[0], sun[1], 26, "#FFFBE8", 0.5)
    c.alpha(lambda o: [o.ell(x, y, x + rnd.uniform(70, 140), y + 7, (255, 255, 255, 120)) for x, y in ((rnd.uniform(-40, 260), rnd.uniform(40, 220)) for _ in range(5))])
    for _ in range(4):
        x, y = rnd.uniform(10, 310), rnd.uniform(60, 200)
        c.line([(x - 6, y - 3), (x, y), (x + 6, y - 3)], "#3D6E96", 1.3)


def archipel_card(c, rnd, idx):
    if idx == 0:  # Dirigeable
        sky_bg(c, rnd, (264, 70))
        island(c, rnd, 278, 132, 0.45)
        island(c, rnd, 60, 300, 0.9, house=True)
        cloud_sea(c, rnd)
        c.poly([(70, 196), (34, 152), (100, 182)], "#C9473D")
        c.poly([(70, 214), (34, 258), (100, 228)], "#C9473D")
        env = (52, 160, 278, 250)
        c.ell(*env, "#FFF1DC")
        c.clip(lambda m: m.ell(*env, 255), lambda t: (t.ell(env[0] - 10, env[1] + 30, env[2] + 10, env[3] + 30, "#EAD3B5"),
                                                   [t.ell(x - 14, env[1] - 10, x + 14, env[3] + 10, None, "#E85D4F", 7) for x in (110, 165, 220)],
                                                   t.rect(env[0], 198, env[2], 212, "#E85D4F"),
                                                   t.ell(env[0] + 30, env[1] + 12, env[0] + 140, env[1] + 34, "#FFFFFF")))
        c.ell(258, 192, 282, 218, "#E85D4F")
        for x0, x1 in ((140, 150), (196, 186)):
            c.line([(x0, 246), (x1, 266)], "#6B4A2E", 1.5)
        c.rrect(132, 262, 204, 288, 8, "#8B5A2B")
        for x in range(142, 200, 14):
            c.rrect(x, 268, x + 8, 278, 2, "#FFE7A0")
        c.alpha(lambda o: o.ell(118, 260, 128, 292, (120, 130, 150, 140)))
        c.line([(206, 274), (214, 274)], "#6B4A2E", 2)
        c.line([(50, 205), (30, 205)], "#6B4A2E", 1.5)
        c.poly([(30, 196), (30, 214), (12, 205)], "#F7C948")
    elif idx == 1:  # Arc-en-ciel
        sky_bg(c, rnd, (60, 70))
        island(c, rnd, 160, 290, 0.42, tree=False)
        cols = ((233, 72, 77), (255, 154, 61), (247, 201, 72), (95, 196, 110), (79, 163, 255), (102, 94, 220), (178, 107, 255))
        c.alpha(lambda o: [o.arc(160 - r, 330 - r, 160 + r, 330 + r, 180, 360, col + (205,), 10.5) for col, r in zip(cols, range(150, 70, -10))])
        island(c, rnd, 34, 322, 0.9)
        island(c, rnd, 288, 318, 0.9, tree=False, house=True)
        cloud_sea(c, rnd, (370, 400, 428))
    elif idx == 2:  # Cascade céleste
        sky_bg(c, rnd, (272, 64))
        island(c, rnd, 272, 250, 0.55)
        cloud_sea(c, rnd, (392, 414, 434))
        x0 = 168
        c.alpha(lambda o: o.poly([(x0 - 2, 190), (x0 + 30, 190), (x0 + 44, 400), (x0 - 18, 400)], (200, 238, 255, 225)))
        for k in range(9):
            xx = x0 + 2 + k * 3.4
            c.alpha(lambda o, xx=xx: o.line([(xx, 196 + (k % 3) * 20), (xx + (xx - x0 - 14) * 0.6, 396)], (255, 255, 255, 160), 1.4))
        island(c, rnd, 112, 176, 1.5, pond=True)
        c.alpha(lambda o: o.poly([(x0 - 6, 176), (x0 + 30, 176), (x0 + 34, 194), (x0 - 4, 196)], (190, 236, 255, 235)))
        for x, y, r in ((180, 396, 26), (152, 404, 20), (210, 402, 22), (180, 380, 14)):
            c.circ(x, y, r, "#FFFFFF")
    else:  # Île flottante
        sky_bg(c, rnd, (70, 64))
        island(c, rnd, 40, 120, 0.3, tree=False)
        island(c, rnd, 284, 150, 0.36)
        cloud_sea(c, rnd, (380, 408, 430))
        island(c, rnd, 160, 214, 1.85, house=True)
        c.alpha(lambda o: [o.ell(x, y, x + w, y + 12, (255, 255, 255, 170)) for x, y, w in ((40, 280, 80), (200, 300, 90), (120, 330, 70))])


# --- 19 · Néon -------------------------------------------------------------

NEON = ("#FF4FD8", "#4FF0FF", "#FFD36B", "#9B7BFF")


def skyline(c, rnd, base, hmin, hmax, col, wins=0.35, neon=True, xs=None):
    x = -10
    tops = []
    while x < W:
        w = rnd.uniform(26, 54)
        top = base - rnd.uniform(hmin, hmax)
        c.rect(x, top, x + w, base, col)
        lit = []
        for wy in range(int(top) + 8, int(base) - 6, 9):
            for wx in range(int(x) + 5, int(x + w) - 5, 8):
                if rnd.random() < wins:
                    lit.append((wx, wy, rnd.choice(NEON + ("#FFF4D0",) * 3)))
        for wx, wy, cl in lit:
            c.rect(wx, wy, wx + 3, wy + 4, cl)
        tops.append((x, x + w, top))
        x += w + rnd.uniform(-4, 6)
    if neon:
        sel = [t for t in tops if rnd.random() < 0.5]
        cols = [rnd.choice(NEON[:2]) for _ in sel]
        c.glow(lambda g: [g.line([(a, t), (b, t)], cl, 3) for (a, b, t), cl in zip(sel, cols)], 4, 1.2)
        for (a, b, t), cl in zip(sel, cols):
            c.line([(a, t), (b, t)], cl, 1.5)


def neon_bg(c, rnd, street=True, dark=0):
    stars(c, rnd, 30, 160, ("#FFFFFF", "#FFC9F2"), 1.0)
    c.glow(lambda g: g.rect(-40, 250, W + 40, 330, "#FF2FB8"), 40, 0.45)
    skyline(c, rnd, 340, 80, 200, "#2A0F4A", 0.1)
    skyline(c, rnd, 360, 40, 150, "#1A0A35", 0.17)
    if street:
        c.vgrad(0, 360, W, H, "#170A2E", "#0A0418")
        refl = [(rnd.uniform(0, W), rnd.choice(NEON)) for _ in range(14)]
        c.glow(lambda g: [g.line([(x, 362), (x, 440)], cl, 3) for x, cl in refl], 5, 0.5)
        for k in range(4):
            c.rect(20 + k * 90, 404, 60 + k * 90, 408, "#3A2560")
    if dark:
        c.alpha(lambda o: o.rect(0, 0, W, H, (8, 2, 24, dark)))


def neon_card(c, rnd, idx):
    if idx == 0:  # Hologramme
        neon_bg(c, rnd)
        cx, cy, r = 160, 212, 74
        c.alpha(lambda o: o.poly([(126, 392), (194, 392), (250, 140), (70, 140)], (79, 240, 255, 36)))
        c.ell(108, 380, 212, 404, "#2A1E44")
        c.rect(118, 392, 202, 412, "#22183A")
        c.ell(108, 400, 212, 420, "#1A1230")
        c.glow(lambda g: g.ell(112, 382, 208, 400, None, "#4FF0FF", 3), 4, 1.3)
        c.ell(112, 382, 208, 400, None, "#9FF8FF", 2)

        def globe(g, wdt):
            g.circ(cx, cy, r, None, "#5FF6FF", wdt)
            for lat in (-60, -30, 0, 30, 60):
                y = cy + r * math.sin(math.radians(lat))
                rx = r * math.cos(math.radians(lat))
                g.ell(cx - rx, y - rx * 0.18, cx + rx, y + rx * 0.18, None, "#5FF6FF", wdt)
            for lon in (0, 30, 60):
                rx = r * math.cos(math.radians(lon))
                g.ell(cx - rx, cy - r, cx + rx, cy + r, None, "#5FF6FF", wdt)
        c.glow(lambda g: globe(g, 4), 5, 1.3)
        lay = c.layer("RGBA")
        globe(lay, 1.8)
        c._reset(Image.alpha_composite(c.img.convert("RGBA"), lay.img).convert("RGB"))
        c.alpha(lambda o: [o.rect(60, y, 260, y + 1.2, (10, 4, 30, 90)) for y in range(130, 300, 4)])
        band = c.img.crop((60 * SS, 236 * SS, 260 * SS, 246 * SS))
        c.img.paste(band, (66 * SS, 236 * SS))
        c._reset(c.img)
        for x, y in ((112, 132), (222, 300), (240, 168)):
            c.rect(x, y, x + 10, y + 3, "#9FF8FF")
    elif idx == 1:  # Voiture volante
        neon_bg(c, rnd)
        for x0, x1, top in ((-10, 44, 40), (276, 330, 70)):
            c.rect(x0, top, x1, H, "#120626")
            for wy in range(int(top) + 10, H, 14):
                for wx in range(x0 + 8, x1 - 6, 12):
                    if rnd.random() < 0.4:
                        c.rect(wx, wy, wx + 5, wy + 6, rnd.choice(NEON))
        c.alpha(lambda o: o.poly([(262, 218), (W + 10, 196), (W + 10, 262)], (255, 245, 200, 60)))
        trails = [(226, "#FF4FD8"), (234, "#4FF0FF"), (242, "#FF4FD8")]
        c.glow(lambda g: [g.line([(-10, y + 12), (80, y)], cl, 4) for y, cl in trails], 5, 1.2)
        for y, cl in trails:
            c.line([(-10, y + 12), (80, y)], hx(cl, 0.5, "#FFFFFF"), 1.6)
        c.glow(lambda g: [g.ell(x - 22, 240, x + 22, 256, "#4FF0FF") for x in (114, 222)], 8, 1.3)
        body = [(72, 224), (92, 206), (150, 196), (222, 198), (256, 210), (266, 226), (244, 242), (90, 244)]
        c.poly(body, "#ECE8FF")
        c.poly([(76, 232), (266, 230), (244, 242), (90, 244)], "#A59ED6")
        c.line([(84, 222), (254, 218)], "#FF4FD8", 4)
        c.poly([(118, 200), (142, 176), (194, 172), (224, 200)], "#4FD8F0")
        c.poly([(128, 198), (146, 180), (164, 179), (150, 198)], "#B5F5FF")
        c.circ(176, 188, 8, "#1A0A35")
        c.rect(170, 194, 182, 200, "#1A0A35")
        for x in (114, 222):
            c.ell(x - 18, 242, x + 18, 252, "#9FF8FF")
        c.circ(262, 218, 4, "#FFF6C8")
        c.rect(74, 214, 84, 222, "#FF4FD8")
    elif idx == 2:  # Gratte-ciel
        neon_bg(c, rnd)
        c.alpha(lambda o: [o.poly([(160, 34), (60 + k * 200, -20), (100 + k * 200, -20)], (180, 240, 255, 45)) for k in (0, 1)])
        L = [(112, H), (160, H), (160, 64), (126, 76)]
        R = [(160, H), (208, H), (194, 76), (160, 64)]
        c.poly(L, "#2B1356")
        c.poly(R, "#1A0B3A")
        for face, x0, x1, top, lean in ((0, 120, 156, 84, 0.06), (1, 164, 200, 84, -0.06)):
            for wy in range(top, H - 10, 10):
                for wx in range(x0, x1 - 2, 7):
                    if rnd.random() < 0.22:
                        c.rect(wx, wy, wx + 3, wy + 5, rnd.choice(("#FFF4D0", "#FFD36B", "#4FF0FF", "#FF4FD8")) if face == 0 else rnd.choice(("#B58AE0", "#4FF0FF", "#FF4FD8")))
        c.rect(132, 46, 188, 70, "#2B1356")
        c.rect(144, 22, 176, 48, "#2B1356")
        c.line([(160, 22), (160, -2)], "#B9A8E0", 3)
        edges = [((112, H), (126, 76), "#FF4FD8"), ((208, H), (194, 76), "#4FF0FF"), ((160, H), (160, 64), "#FF4FD8"),
                 ((132, 46), (188, 46), "#4FF0FF"), ((144, 22), (176, 22), "#FF4FD8")]
        c.glow(lambda g: [g.line([a, b], cl, 4) for a, b, cl in edges], 5, 1.3)
        for a, b, cl in edges:
            c.line([a, b], hx(cl, 0.4, "#FFFFFF"), 1.5)
        c.glow(lambda g: g.circ(160, 2, 8, "#FF3D5A"), 6, 1.5)
        c.circ(160, 2, 3, "#FFD0D8")
        c.glow(lambda g: g.rrect(214, 160, 232, 290, 5, None, "#4FF0FF", 3), 5, 1.3)
        c.rrect(214, 160, 232, 290, 5, None, "#BFFBFF", 1.5)
        for k in range(4):
            c.circ(223, 180 + k * 30, 5, "#FF4FD8")
        c.line([(208, 220), (214, 220)], "#4FF0FF", 2)
    else:  # Androïde
        neon_bg(c, rnd, dark=70)
        c.poly([(30, H), (50, 372), (110, 342), (210, 342), (270, 372), (290, H)], "#B9BED6")
        c.poly([(110, 342), (210, 342), (196, H), (124, H)], "#8D93B3")
        c.line([(60, 380), (110, 356)], "#8D93B3", 2)
        c.line([(260, 380), (210, 356)], "#8D93B3", 2)
        c.glow(lambda g: g.circ(160, 404, 16, "#4FF0FF"), 8, 1.3)
        c.circ(160, 404, 11, "#BFFBFF")
        c.circ(160, 404, 16, None, "#4FF0FF", 2)
        c.rect(140, 288, 180, 346, "#4A4F66")
        for x in (148, 160, 172):
            c.line([(x, 290), (x, 344)], "#2E3245", 3)
        c.glow(lambda g: (g.rrect(96, 116, 220, 296, 52, "#FF4FD8"), g.rrect(104, 116, 228, 296, 52, None)), 10, 0.6)
        c.rrect(97, 116, 217, 296, 52, "#FF4FD8")
        c.rrect(103, 116, 223, 296, 52, "#4FF0FF")
        c.rrect(100, 116, 220, 296, 52, "#E9ECF7")
        c.clip(lambda m: m.rrect(100, 116, 220, 296, 52, 255), lambda t: t.ell(70, 240, 250, 360, "#C9CDE0"))
        c.line([(160, 118), (160, 168)], "#C9CDE0", 1.5)
        for ex in (98, 222):
            c.circ(ex, 214, 18, "#C9CDE0")
            c.glow(lambda g, ex=ex: g.circ(ex, 214, 12, None, "#FF4FD8", 3), 4, 1.4)
            c.circ(ex, 214, 12, None, "#FFB3EE", 2)
            c.circ(ex, 214, 5, "#8D93B3")
        c.rrect(112, 176, 208, 222, 20, "#140A2A")
        c.glow(lambda g: [g.ell(x - 13, 190, x + 13, 206, "#4FF0FF") for x in (138, 182)], 6, 1.6)
        for x in (138, 182):
            c.ell(x - 11, 192, x + 11, 204, "#BFFBFF")
        for k in range(4):
            c.line([(140, 254 + k * 6), (180, 254 + k * 6)], "#9EA3BC", 2)
        c.line([(188, 122), (204, 82)], "#9EA3BC", 3)
        c.glow(lambda g: g.circ(204, 80, 8, "#FF4FD8"), 5, 1.5)
        c.circ(204, 80, 5, "#FFC2F2")


# --- 20 · La Lune ----------------------------------------------------------

def crater(c, x, y, rx, base):
    ry = rx * 0.32
    b = hex_rgb(base)
    c.ell(x - rx * 1.1, y - ry * 1.2, x + rx * 1.1, y + ry * 1.05, mix(b, (255, 255, 255), 0.22))
    c.ell(x - rx, y - ry, x + rx, y + ry, mix(b, (0, 0, 0), 0.18))
    c.chord(x - rx, y - ry, x + rx, y + ry, 180, 360, mix(b, (0, 0, 0), 0.32))


def earth(c, rnd, x, y, r, detail=True):
    c.glow(lambda g: g.circ(x, y, r * 1.12, "#5FB0FF"), r * 0.25, 0.9)
    c.circ(x, y, r, "#2F6FD0")
    disk = lambda m: m.circ(x, y, r, 255)  # noqa: E731

    def land(t):
        for dx, dy, rx, ry, col in ((-0.35, -0.3, 0.42, 0.3, "#4FAE5A"), (0.25, 0.15, 0.35, 0.45, "#5DB06A"), (-0.2, 0.45, 0.3, 0.18, "#C9B26A"),
                                    (0.45, -0.45, 0.25, 0.18, "#4FAE5A")):
            t.poly(blob(rnd, x + dx * r, y + dy * r, rx * r, ry * r, 0.3, 14), col)
        if detail:
            for dx, dy, rx in ((-0.55, -0.05, 0.22), (0.05, -0.55, 0.3), (0.5, 0.5, 0.22), (-0.1, 0.15, 0.16), (-0.45, 0.62, 0.2), (0.62, -0.1, 0.14)):
                t.alpha(lambda o, dx=dx, dy=dy, rx=rx: o.poly(blob(rnd, x + dx * r, y + dy * r, rx * r, rx * r * 0.38, 0.35, 12), (255, 255, 255, 200)))

    c.clip(disk, land)

    def shadow(m):
        m.circ(x, y, r, 255)
        m.ell(x - r * 1.5, y - r * 1.15, x + r * 0.3, y + r * 1.15, 0)
    c.clip(shadow, lambda t: t.circ(x, y, r, "#060B1E"), opacity=0.85, blur=r * 0.06)
    c.arc(x - r, y - r, x + r, y + r, 95, 265, "#9FD4FF", max(1, r * 0.03))


def moon_bg(c, rnd, earth_at=None, layers=((292, 6, "#8E93A6"), (332, 9, "#A9AEBF"), (392, 10, "#C2C6D3"))):
    stars(c, rnd, 170, 330, ("#FFFFFF", "#D7DCEB", "#C9D6FF"), 1.3)
    for _ in range(5):
        sparkle(c, rnd.uniform(10, 310), rnd.uniform(10, 240), rnd.uniform(3, 5), "#FFFFFF")
    if earth_at:
        earth(c, rnd, *earth_at, detail=False)
    for i, (base, amp, col) in enumerate(layers):
        c.poly(hills(rnd, base, amp, 0.3), col)
        for _ in range(2 + i * 2):
            crater(c, rnd.uniform(10, 310), base + rnd.uniform(12, 40) * (1 + i * 0.5), rnd.uniform(8, 16) * (1 + i * 0.6), col)


def lune_card(c, rnd, idx):
    if idx == 0:  # Rover
        moon_bg(c, rnd, (252, 82, 22))
        for k in range(14):
            for side in (0, 18):
                x = 70 - k * 8
                c.rect(x - 3, 372 + side - k * 1.6, x + 3, 375 + side - k * 1.6, "#9CA1B2")
        c.alpha(lambda o: o.ell(70, 360, 260, 384, (20, 22, 34, 110)))
        c.line([(118, 206), (110, 262)], "#C9CCD6", 3)
        c.chord(84, 182, 136, 214, 0, 180, "#ECEEF3")
        c.line([(110, 198), (110, 186)], "#9EA3B3", 2)
        c.poly([(64, 286), (256, 286), (244, 264), (78, 264)], "#2A3F7A")
        for k in range(1, 6):
            c.line([(64 + k * 32, 286), (78 + k * 27.6, 264)], "#5B78C0", 1.2)
        c.line([(71, 275), (250, 275)], "#5B78C0", 1.2)
        c.rect(212, 214, 218, 290, "#9EA3B3")
        c.rrect(194, 198, 238, 222, 5, "#ECEEF3")
        for x in (206, 224):
            c.circ(x, 210, 6, "#1E2230")
            c.circ(x - 2, 208, 2, "#7FE9FF")
        c.rrect(84, 288, 236, 324, 6, "#ECEEF3")
        c.rect(100, 296, 152, 316, "#D9A93A")
        c.line([(100, 306), (152, 306)], "#B58A22", 1.2)
        for x in range(164, 226, 8):
            c.line([(x, 298), (x, 316)], "#B9BED0", 2)
        for x in (100, 160, 220):
            c.line([(x, 352), (x + (160 - x) * 0.2, 322)], "#7A7F8E", 4)
        for x in (100, 160, 220):
            c.circ(x, 352, 20, "#3A3D48")
            c.circ(x, 352, 12, "#7A7F8E")
            c.circ(x, 352, 4, "#3A3D48")
            for k in range(10):
                a = math.radians(k * 36)
                c.line([(x + 17 * math.cos(a), 352 + 17 * math.sin(a)), (x + 21 * math.cos(a), 352 + 21 * math.sin(a))], "#5A5E6B", 3)
    elif idx == 1:  # Astronaute
        moon_bg(c, rnd, (66, 92, 26))
        c.alpha(lambda o: o.ell(100, 380, 230, 398, (20, 22, 34, 110)))
        for k in range(5):
            c.ell(40 + k * 14, 420 - k * 6, 50 + k * 14, 425 - k * 6, "#9CA1B2")
        c.line([(256, 392), (256, 172)], "#C9CCD6", 3)
        c.rect(256, 174, 306, 210, "#FFFFFF")
        c.circ(281, 192, 10, "#4FA3FF")
        c.ell(266, 188, 296, 196, None, "#FF7EB6", 2)
        wht, gr = "#F2F3F6", "#C9CCD6"
        c.rrect(116, 172, 204, 268, 14, gr)
        for x0 in (128, 164):
            c.rrect(x0, 296, x0 + 28, 374, 12, wht)
            c.line([(x0 + 4, 336), (x0 + 24, 336)], gr, 2)
            c.rrect(x0 - 4, 364, x0 + 32, 390, 8, "#9EA3B3")
        c.line([(122, 206), (86, 172), (80, 132)], wht, 26, True)
        c.circ(80, 124, 14, "#B9BED0")
        c.line([(198, 206), (222, 250), (222, 288)], wht, 26, True)
        c.circ(222, 296, 14, "#B9BED0")
        c.rrect(118, 190, 202, 312, 26, wht)
        c.rect(118, 294, 202, 302, gr)
        c.rrect(138, 230, 182, 264, 5, "#D7DAE3")
        for x, col in ((148, "#E5484D"), (160, "#4FA3FF"), (172, "#F7C948")):
            c.circ(x, 247, 3.5, col)
        c.circ(160, 156, 42, wht)
        c.circ(160, 156, 42, None, gr, 3)
        c.ell(126, 132, 194, 182, "#E0A93A")
        c.clip(lambda m: m.ell(126, 132, 194, 182, 255), lambda t: (t.vgrad(126, 132, 194, 182, "#F2C55A", "#B9801E"),
                                                                 t.poly([(132, 160), (146, 136), (162, 134), (140, 168)], "#FFE7A0"),
                                                                 t.circ(176, 166, 5, "#4FA3FF")))
    elif idx == 2:  # Base lunaire
        moon_bg(c, rnd, (246, 80, 22))
        c.ell(30, 324, 290, 368, "#9A9FAE")
        for x0, x1 in ((14, 86), (234, 306)):
            c.line([((x0 + x1) / 2, 336), ((x0 + x1) / 2, 300)], "#7A7F8E", 3)
            c.poly([(x0, 302), (x1, 302), (x1 - 10, 276), (x0 + 10, 276)], "#2A3F7A")
            for k in range(1, 4):
                c.line([(x0 + k * (x1 - x0) / 4, 302), (x0 + 10 + k * (x1 - x0 - 20) / 4, 276)], "#5B78C0", 1.2)
        c.line([(250, 330), (250, 196)], "#B9BED0", 3)
        for y in range(206, 330, 14):
            c.line([(246, y), (254, y + 10)], "#B9BED0", 1.2)
        c.glow(lambda g: g.circ(250, 194, 7, "#FF3D3D"), 5, 1.4)
        c.circ(250, 194, 3, "#FFC0C0")
        c.chord(234, 210, 266, 232, 0, 180, "#ECEEF3")
        for x0, x1 in ((58, 122), (198, 248)):
            c.rrect(x0, 300, x1, 340, 14, "#ECEEF3")
            c.rect(x0 + 4, 330, x1 - 4, 340, "#C9CCD6")
        c.rect(118, 312, 202, 328, "#DADDE6")
        lights = [(x, 316) for x in (74, 88, 102, 214, 228)]
        c.glow(lambda g: [g.rrect(x - 5, y - 4, x + 5, y + 4, 2, "#FFD36B") for x, y in lights], 5, 1.0)
        for x, y in lights:
            c.rrect(x - 4, y - 3, x + 4, y + 3, 2, "#FFE7A0")
        c.pie(92, 236, 228, 372, 180, 360, "#E8EBF2")
        c.clip(lambda m: m.pie(92, 236, 228, 372, 180, 360, 255), lambda t: (t.vgrad(92, 236, 228, 304, "#F4F6FA", "#D2D6E0"),
                                                                          [t.arc(92 + k * 17, 236 + k * 4, 228 - k * 17, 372 - k * 4, 180, 360, "#B9BED0", 1.5) for k in range(1, 4)],
                                                                          [t.line([(160, 236), (160 + 70 * math.cos(math.radians(a)), 304 + 70 * math.sin(math.radians(a)))], "#B9BED0", 1.5) for a in (200, 230, 250, 290, 310, 340)]))
        dl = [(118 + k * 14, 296) for k in range(6)]
        c.glow(lambda g: [g.rect(x - 4, y - 4, x + 4, y + 4, "#FFD36B") for x, y in dl], 5, 1.0)
        for x, y in dl:
            c.rect(x - 3, y - 3, x + 3, y + 3, "#FFE7A0")
        c.pie(144, 286, 176, 318, 180, 360, "#7A7F8E")
        c.rect(144, 302, 176, 304, "#7A7F8E")
    else:  # Clair de Terre
        moon_bg(c, rnd, layers=())
        earth(c, rnd, 160, 214, 84)
        for i, (base, amp, col) in enumerate(((286, 5, "#8E93A6"), (328, 8, "#A9AEBF"), (396, 10, "#C2C6D3"))):
            c.poly(hills(rnd, base, amp, 0.3), col)
            for _ in range(2 + i * 2):
                crater(c, rnd.uniform(10, 310), base + rnd.uniform(14, 40) * (1 + i * 0.5), rnd.uniform(8, 16) * (1 + i * 0.6), col)


WORLDS = {
    11: (("#7CCBE6", "#E9F9FB"), lake_card),
    12: (("#2E1F5E", "#FF8FB0"), foire_card),
    13: (("#8FD0F2", "#FFF0C8"), ferme_card),
    14: (("#151030", "#4E3F86"), manoir_card),
    15: (("#4FC3E8", "#FFF3D6"), pirates_card),
    16: (("#F2A548", "#FFE9B8"), desert_card),
    17: (("#0A141C", "#1C3240"), mines_card),
    18: (("#4FA8EE", "#DDF3FF"), archipel_card),
    19: (("#0B0322", "#3D0F5E"), neon_card),
    20: (("#03040A", "#161A28"), lune_card),
}


def draw_scene(arena, idx):
    (top, bottom), fn = WORLDS[arena]
    rnd = random.Random(arena * 100 + idx)
    shift = (idx - 1.5) * 0.06
    t = mix(hex_rgb(top), (0, 0, 0) if shift < 0 else (255, 255, 255), abs(shift) * 0.5)
    c = Canvas(gradient(t, hex_rgb(bottom), w=W * SS, h=H * SS))
    fn(c, rnd, idx)
    img = c.img.resize((W, H), Image.LANCZOS)
    return seeded_grain(img, 20, arena * 10 + idx)


def seeded_grain(img, amount, seed):
    """Comme grain(), mais avec un bruit reproductible (effect_noise dépend de
    l'ordre des appels, ce qui changerait l'image selon les mondes rendus)."""
    rnd = random.Random(seed)
    data = bytes(max(0, min(255, int(rnd.gauss(128, amount)))) for _ in range(img.width * img.height))
    noise = Image.frombytes("L", img.size, data)
    return Image.blend(img, Image.merge("RGB", (noise, noise, noise)), 0.06 + rnd.random() * 0.02)


def render(arena, idx):
    return draw_scene(arena, idx) if arena in WORLDS else draw_card(arena, idx)


if __name__ == "__main__":
    import os
    import sys

    os.makedirs(OUT, exist_ok=True)
    # Sans argument : tous les mondes. Sinon seulement les ids donnés
    # (ex. `python3 scripts/generate-bot-art.py 11 12`).
    wanted = [int(a) for a in sys.argv[1:]] or [*THEMES, *WORLDS]
    for arena in wanted:
        for idx in range(4):
            render(arena, idx).save(f"{OUT}/a{arena}-{idx}.jpg", quality=80, optimize=True, progressive=True)
    print("ok")
