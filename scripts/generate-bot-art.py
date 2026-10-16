"""Illustrations des cartes des adversaires du mode solo (python3 scripts/generate-bot-art.py).

Paysages en aplats superposés, un décor par monde et, sur chaque carte, son
sujet au premier plan. Sortie : assets/bots/a<monde>-<carte>.jpg (320 × 448).
Aussi assets/bots/sanctuary.jpg (la Divine du sanctuaire). Arguments optionnels :
les ids des mondes à rendre et/ou `sanctuary` (par défaut tout).
"""
import math
import random

from PIL import Image, ImageDraw, ImageFilter

W, H = 320, 448
OUT = "assets/bots"


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(top, bottom, w=W, h=H):
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=mix(top, bottom, y / (h - 1)))
    return img


def ridge(rnd, base, amp, rough, w=W, h=H):
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


# ---------------------------------------------------------------------------
# Chaque monde a son décor en aplats et chaque carte montre son sujet (le nom
# de la carte) au premier plan. La carte 3 sert aussi de portrait rond de
# l'adversaire : son sujet est centré et lisible en petit.
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


def spine(cx, cy, ang, length, bend, t=1.0, n=18):
    """Point et direction à la fraction t le long d'un leaf()."""
    x, y = cx, cy
    step = length / n
    a = ang
    for i in range(1, int(round(n * t)) + 1):
        a = ang + bend * i / n
        x += math.cos(math.radians(a)) * step
        y += math.sin(math.radians(a)) * step
    return x, y, a


# --- 1 · Le Parc -----------------------------------------------------------

def round_tree(c, x, base, s, col="#5FB45E", dark="#3F8A4A"):
    c.rect(x - 3.5 * s, base - 36 * s, x + 3.5 * s, base, "#7A5232")
    for dx, dy, r in ((0, -52, 22), (-17, -40, 16), (17, -40, 17), (-6, -66, 15), (10, -62, 14)):
        c.circ(x + dx * s, base + dy * s, r * s, dark)
    for dx, dy, r in ((-5, -56, 15), (-16, -44, 9), (8, -66, 9)):
        c.circ(x + dx * s, base + dy * s, r * s, col)


def lamp_post(c, x, base, h):
    c.rect(x - 2.5, base - h, x + 2.5, base, "#2E4A3A")
    c.rect(x - 6, base - 8, x + 6, base, "#2E4A3A")
    c.poly([(x - 9, base - h), (x + 9, base - h), (x + 6, base - h - 20), (x - 6, base - h - 20)], "#FFF2B8")
    c.poly([(x - 11, base - h - 20), (x + 11, base - h - 20), (x, base - h - 30)], "#2E4A3A")
    c.rect(x - 10, base - h, x + 10, base - h + 3, "#2E4A3A")


def park_bg(c, rnd, sun, path=True):
    for _ in range(3):
        puff(c, rnd.uniform(20, 300), rnd.uniform(40, 150), rnd.uniform(0.5, 0.9), "#FFFFFF", "#DCEFF7")
    sun_disk(c, sun[0], sun[1], 26, "#FFF3B0", 0.4)
    c.poly(hills(rnd, 232, 14, 0.3), "#B4E0A8")
    for _ in range(8):
        round_tree(c, rnd.uniform(0, W), 240, rnd.uniform(0.35, 0.5), "#9CD08F", "#86C27C")
    c.poly(hills(rnd, 262, 10, 0.3), "#8DCF7E")
    for x in (rnd.uniform(10, 70), rnd.uniform(250, 310)):
        round_tree(c, x, 278, rnd.uniform(0.75, 0.95))
    c.poly(hills(rnd, 300, 6, 0), "#74C266")
    if path:
        left = bez((142, 300), (124, 340), (50, 390), (40, 450), 14)
        right = bez((178, 300), (204, 345), (290, 390), (300, 450), 14)
        c.poly(left + right[::-1], "#E9D7A8")
        c.line(left, "#D6BE88", 2)
        c.line(right, "#D6BE88", 2)
    for _ in range(36):
        x, y = rnd.uniform(0, W), rnd.uniform(310, 445)
        if path and abs(x - 160) < 40 + (y - 300) * 0.8:
            continue
        if rnd.random() < 0.35:
            c.circ(x, y, 2.2, rnd.choice(("#FFFFFF", "#FFE36B", "#FF9AC0")))
        else:
            c.poly([(x - 3, y), (x, y - 7), (x + 3, y)], "#5EAE54")


def parc_card(c, rnd, idx):
    if idx == 0:  # Banc public
        park_bg(c, rnd, (252, 88))
        lamp_post(c, 262, 352, 150)
        c.alpha(lambda o: o.ell(50, 368, 272, 392, (30, 60, 20, 90)))
        iron, wood, light = "#2B2F33", "#3E8E5E", "#5FB07A"
        for x in (82, 238):
            c.rect(x - 4, 258, x + 4, 334, iron)
        for k in range(3):
            y = 262 + k * 20
            c.rrect(64, y, 256, y + 14, 4, wood)
            c.rect(68, y + 1, 252, y + 4, light)
        for k in range(3):
            y = 330 + k * 9
            c.poly([(64 - k * 4, y), (256 + k * 4, y), (258 + k * 4, y + 8), (62 - k * 4, y + 8)], wood if k % 2 == 0 else light)
        for x, s in ((74, -1), (246, 1)):
            c.line(bez((x, 300), (x + 18 * s, 300), (x + 20 * s, 318), (x + 6 * s, 330)), iron, 5, True)
            c.line([(x + 4 * s, 356), (x, 382)], iron, 6, True)
            c.line([(x - 6 * s, 356), (x - 20 * s, 380)], iron, 5, True)
        c.rect(70, 352, 250, 358, iron)
        c.poly(leaf(120, 388, -15, 18, 9), "#E8A23B")
        c.poly(leaf(206, 394, 200, 16, 8), "#D9732A")
    elif idx == 1:  # Pigeon fier
        park_bg(c, rnd, (70, 90))
        lamp_post(c, 280, 330, 140)
        for _ in range(9):
            c.circ(rnd.uniform(50, 130), rnd.uniform(384, 410), rnd.uniform(1.6, 2.8), "#C9A061")
        c.alpha(lambda o: o.ell(96, 368, 236, 390, (60, 50, 20, 80)))
        c.poly([(206, 296), (270, 326), (262, 344), (200, 322)], "#5A6070")
        c.poly([(262, 326), (270, 326), (262, 344), (254, 340)], "#2E323C")
        for x0, x1 in ((142, 138), (176, 180)):
            c.line([(x0, 330), (x1, 372)], "#E5747A", 4)
            for d in (-9, 0, 9):
                c.line([(x1, 372), (x1 + d, 378)], "#E5747A", 2.5)
        c.ell(104, 246, 232, 344, "#9AA3B5")
        c.ell(134, 262, 236, 322, "#B4BCCB")
        for k in range(2):
            c.line([(160 + k * 22, 276), (176 + k * 22, 316)], "#3A3F4A", 4)
        c.poly([(206, 300), (240, 312), (232, 324), (200, 318)], "#7D8597")
        c.ell(86, 212, 168, 322, "#8A93A8")
        c.clip(lambda m: m.ell(86, 212, 168, 322, 255), lambda t: (t.ell(90, 214, 150, 268, "#5FAF8A"), t.ell(110, 240, 176, 292, "#9B6FB5")), opacity=0.75, blur=6)
        c.alpha(lambda o: o.ell(100, 236, 128, 276, (255, 255, 255, 60)))
        c.circ(114, 196, 25, "#8A93A8")
        c.poly([(92, 192), (64, 202), (92, 208)], "#4A4F5A")
        c.ell(88, 188, 100, 196, "#F2F2F2")
        c.circ(110, 190, 6, "#FF8A3D")
        c.circ(109, 190, 3, "#1E1E1E")
        c.circ(108, 188.5, 1.2, "#FFFFFF")
    elif idx == 2:  # Toboggan
        park_bg(c, rnd, (250, 84), path=False)
        c.ell(20, 336, 300, 440, "#F2D59B")
        c.ell(36, 346, 284, 432, "#F7E1B0")
        c.alpha(lambda o: o.ell(80, 370, 300, 400, (90, 70, 20, 70)))
        for x in (84, 152):
            c.rect(x - 3, 150, x + 3, 380, "#4FA3FF")
        c.poly([(70, 156), (118, 120), (166, 156)], "#E5484D")
        c.poly([(118, 120), (166, 156), (152, 156)], "#B9343A")
        for k in range(7):
            y = 240 + k * 20
            c.rect(84, y, 152, y + 4, "#F7C948")
        c.rect(80, 214, 156, 226, "#FF9A3D")
        c.rect(80, 190, 84, 214, "#4FA3FF")
        c.rect(80, 190, 156, 194, "#4FA3FF")
        path = bez((150, 224), (214, 226), (226, 360), (298, 370), 30)
        c.line(path, "#E5484D", 34, True)
        c.line(path, "#F7C948", 24, True)
        c.line([(x, y - 6) for x, y in path], "#FFE58A", 4)
        c.rect(290, 372, 296, 386, "#4FA3FF")
        for x, y in ((60, 410), (250, 420)):
            c.poly([(x - 10, y), (x + 10, y), (x + 7, y - 12), (x - 7, y - 12)], "#E5484D")
            c.rect(x + 12, y - 22, x + 15, y, "#4FA3FF")
            c.ell(x + 8, y - 26, x + 20, y - 18, "#4FA3FF")
    else:  # Cerf-volant
        park_bg(c, rnd, (62, 70))
        cx, cy = 166, 186
        top, right, bot, left = (cx, 92), (cx + 70, cy - 10), (cx, 292), (cx - 70, cy - 10)
        c.line(bez(bot, (150, 340), (60, 360), (10, 450), 20), "#FFFFFF", 1.4)
        tail = bez(bot, (196, 320), (130, 350), (170, 420), 24)
        c.line(tail, "#3A3F4A", 1.6)
        for k, (x, y) in enumerate(tail[4::5]):
            col = ("#E5484D", "#F7C948", "#4FA3FF", "#5FC46A")[k % 4]
            c.poly([(x - 10, y - 6), (x, y), (x - 10, y + 6)], col)
            c.poly([(x + 10, y - 6), (x, y), (x + 10, y + 6)], col)
        c.alpha(lambda o: o.poly([(top[0] + 6, top[1] + 8), (right[0] + 6, right[1] + 8), (bot[0] + 6, bot[1] + 8), (left[0] + 6, left[1] + 8)], (40, 60, 90, 60)))
        mid = (cx, cy - 10)
        for a, b, col in ((top, right, "#F7C948"), (right, bot, "#4FA3FF"), (bot, left, "#5FC46A"), (left, top, "#E5484D")):
            c.poly([mid, a, b], col)
        c.poly([mid, top, (cx + 20, 120)], "#FFE58A")
        c.line([top, bot], "#5A3A20", 2.5)
        c.line([left, right], "#5A3A20", 2.5)
        for x, y in ((54, 120), (276, 90), (260, 260)):
            c.alpha(lambda o, x=x, y=y: o.line([(x, y), (x + 34, y - 4)], (255, 255, 255, 170), 2))


# --- 2 · La Plage ----------------------------------------------------------

def beach_bg(c, rnd, sun, sand=320, sun_r=26):
    for _ in range(3):
        puff(c, rnd.uniform(20, 300), rnd.uniform(40, 150), rnd.uniform(0.5, 0.9), "#FFFFFF", "#E2F2F7")
    sun_disk(c, sun[0], sun[1], sun_r, "#FFF4C8", 0.4)
    c.vgrad(0, 240, W, sand + 20, "#7AD3E8", "#3B9FC9")
    c.rect(0, 239, W, 241.5, "#EAFBFF")
    for _ in range(14):
        x, y = rnd.uniform(0, W), rnd.uniform(250, sand)
        c.line([(x, y), (x + rnd.uniform(8, 22), y)], "#B9ECF7", 1.4)
    shore = hills(rnd, sand, 7, 0)
    c.poly([(x, y - 6) for x, y in shore[:-2]] + shore[-2:], "#F4FCFF")
    c.poly([(x, y - 2) for x, y in shore[:-2]] + shore[-2:], "#E6CB8E")
    c.poly(shore, "#F4D9A0")
    for _ in range(26):
        c.circ(rnd.uniform(0, W), rnd.uniform(sand + 15, H), rnd.uniform(0.8, 1.6), "#E2C07E")


def shell(c, x, y, s, col="#FFB8A8"):
    c.pie(x - 9 * s, y - 9 * s, x + 9 * s, y + 9 * s, 180, 360, col)
    for a in (200, 235, 270, 305, 340):
        t = math.radians(a)
        c.line([(x, y), (x + 8 * s * math.cos(t), y + 8 * s * math.sin(t))], hx(col, 0.2), 1)


def plage_card(c, rnd, idx):
    if idx == 0:  # Château de sable
        beach_bg(c, rnd, (66, 90), sand=300)
        sand, dk, lt = "#E9C483", "#CFA764", "#F5D9A0"
        c.alpha(lambda o: o.ell(60, 370, 270, 396, (120, 80, 20, 70)))

        def tower(x0, x1, top, bottom):
            c.rect(x0, top, x1, bottom, sand)
            c.rect(x1 - (x1 - x0) * 0.3, top, x1, bottom, dk)
            n = 4
            w = (x1 - x0) / (2 * n - 1)
            for k in range(n):
                c.rect(x0 + 2 * k * w, top - 10, x0 + (2 * k + 1) * w, top, sand if k < n - 1 else dk)
        tower(92, 228, 296, 380)
        tower(70, 114, 246, 382)
        tower(206, 250, 246, 382)
        tower(136, 184, 206, 300)
        c.line([(160, 196), (160, 160)], "#6B4A2E", 2)
        c.poly([(160, 160), (186, 168), (160, 177)], "#E5484D")
        c.pie(146, 340, 174, 368, 180, 360, "#8A6A3E")
        c.rect(146, 354, 174, 382, "#8A6A3E")
        for x, y in ((92, 280), (228, 280), (160, 240)):
            c.pie(x - 5, y - 6, x + 5, y + 6, 180, 360, "#8A6A3E")
            c.rect(x - 5, y, x + 5, y + 8, "#8A6A3E")
        for _ in range(40):
            c.circ(rnd.uniform(74, 246), rnd.uniform(210, 378), 1, lt)
        for x, y in ((128, 380), (196, 384)):
            shell(c, x, y, 0.8)
        c.poly([(256, 352), (292, 352), (286, 392), (262, 392)], "#E5484D")
        c.rect(256, 350, 292, 356, "#B9343A")
        c.arc(256, 330, 292, 370, 180, 360, "#B9343A", 2)
        c.line([(36, 400), (60, 330)], "#4FA3FF", 4)
        c.poly([(54, 320), (70, 326), (64, 344), (50, 340)], "#F7C948")
    elif idx == 1:  # Crabe pressé
        beach_bg(c, rnd, (250, 90), sand=290)
        for k in range(6):
            x = 30 + k * 14
            c.ell(x - 3, 392 - k * 2, x + 3, 396 - k * 2, "#D9B676")
            c.ell(x + 2, 402 - k * 2, x + 8, 406 - k * 2, "#D9B676")
        for k in range(4):
            c.alpha(lambda o, k=k: o.line([(50 - k * 4, 330 + k * 16), (90, 330 + k * 16)], (255, 255, 255, 180), 3))
        for x, y, r in ((96, 386, 8), (84, 374, 6), (104, 372, 5)):
            c.circ(x, y, r, "#F7E3B4")
        c.alpha(lambda o: o.ell(100, 372, 230, 392, (120, 70, 20, 80)))
        red, dk = "#E8553E", "#B8392A"
        for side in (-1, 1):
            for k in range(3):
                x0 = 160 + side * (30 + k * 8)
                c.line([(x0, 350), (x0 + side * 26, 340 + k * 4), (x0 + side * 34, 380)], dk, 5, True)
        for side in (-1, 1):
            x = 160 + side * 76
            c.line([(160 + side * 40, 334), (160 + side * 64, 300), (x, 272)], red, 10, True)
            c.pie(x - 22, 236, x + 22, 280, -62, 242, red)
            c.pie(x - 14, 246, x + 14, 270, -62, 242, "#F27A5E")
        c.ell(108, 312, 212, 378, red)
        c.ell(122, 316, 198, 350, "#F27A5E")
        for x in (144, 176):
            c.line([(x, 320), (x, 292)], dk, 4)
            c.circ(x, 288, 10, "#FFFFFF")
            c.circ(x + 3, 289, 5, "#1E1E1E")
        c.arc(144, 340, 176, 362, 20, 160, "#7A1E14", 2.5)
        c.poly(leaf(205, 282, -90, 18, 12, fat=0.6)[::-1], "#7FD3F5")
        c.circ(205, 274, 6, "#7FD3F5")
    elif idx == 2:  # Parasol
        beach_bg(c, rnd, (62, 80), sand=290)
        c.alpha(lambda o: o.ell(60, 352, 290, 400, (120, 80, 20, 70)))
        c.poly([(70, 372), (230, 352), (262, 400), (96, 426)], "#4FA3FF")
        for k in range(1, 5, 2):
            t0, t1 = k / 5, (k + 1) / 5
            c.poly([lerp((70, 372), (96, 426), t0), lerp((230, 352), (262, 400), t0), lerp((230, 352), (262, 400), t1), lerp((70, 372), (96, 426), t1)], "#FFFFFF")
        c.line([(176, 392), (150, 168)], "#F5F0E6", 5)

        def canopy(t):
            for k in range(8):
                t.pie(0, 0, 240, 150, 180 + k * 22.5, 180 + (k + 1) * 22.5, "#E5484D" if k % 2 == 0 else "#FFFFFF")
            for k in range(8):
                x = 15 + k * 30
                t.pie(x - 15, 63, x + 15, 87, 0, 180, "#E5484D" if k % 2 == 0 else "#FFFFFF")
            t.circ(120, 4, 6, "#F7C948")
        c.rotated((240, 92), canopy, 150, 196, 8)
        c.circ(242, 404, 22, "#FFFFFF")
        c.pie(220, 382, 264, 426, 200, 260, "#E5484D")
        c.pie(220, 382, 264, 426, 320, 20, "#4FA3FF")
        c.pie(220, 382, 264, 426, 80, 140, "#F7C948")
        shell(c, 50, 420, 1.0)
        c.poly(star_pts(290, 430, 10, 4), "#FF9A3D")
    else:  # Coucher doré
        c.vgrad(0, 0, W, 240, "#C2507A", "#FFC860")
        c.glow(lambda g: g.circ(160, 236, 140, "#FF9A3D"), 60, 0.5)
        c.glow(lambda g: g.circ(160, 236, 90, "#FFD27A"), 30, 0.7)
        c.circ(160, 236, 74, "#FFE7A0")
        c.circ(160, 236, 64, "#FFF2C4")
        c.alpha(lambda o: [o.rrect(x, y, x + w, y + 8, 4, (150, 60, 110, 150)) for x, y, w in ((20, 150, 120), (180, 120, 120), (90, 196, 150), (220, 182, 90))])
        c.vgrad(0, 238, W, 380, "#F2A15A", "#7A4A6E")
        for k in range(10):
            y = 244 + k * 12
            hw = 70 - k * 5 + rnd.uniform(-6, 6)
            c.line([(160 - hw, y), (160 + hw, y)], "#FFE7A0", 3 - k * 0.15)
        c.rect(0, 237, W, 240, "#FFE7A0")
        shore = hills(rnd, 380, 8, 0)
        c.poly(shore, "#9E5E48")
        c.poly(hills(rnd, 420, 6, 0), "#7A4438")
        for x, y, s in ((92, 120, 1.0), (116, 104, 0.7), (228, 96, 0.8)):
            c.line([(x - 10 * s, y - 4 * s), (x, y), (x + 10 * s, y - 4 * s)], "#5A2A44", 2)
        palm(c, 296, 440, 170, -40, rnd, "#5A2A34", "#4A2236")


# --- 3 · Le Marché ---------------------------------------------------------

def market_bg(c, rnd, shelves=True):
    c.vgrad(0, 0, W, 320, "#F6C79A", "#E8A878")
    for x in range(-10, W, 40):
        c.rect(x, 60, x + 2, 320, "#E39D6E")
    if shelves:
        for y in (190, 268):
            c.rect(0, y, W, y + 8, "#8B5A2B")
            c.rect(0, y + 8, W, y + 12, "#6B4220")
            x = 6
            while x < W:
                col = rnd.choice(("#FF9A3D", "#E5484D", "#F7C948", "#7BC67E", "#9B5FC0"))
                for k in range(4):
                    c.circ(x + k * 9 + 5, y - 6 - (k % 2) * 6, 6, hx(col, 0.1))
                c.rect(x, y - 8, x + 40, y, "#B07A4A")
                x += 46
    stripe = 32
    for k in range(W // stripe + 1):
        col = "#F5F3EE" if k % 2 == 0 else "#E5484D"
        c.rect(k * stripe, 0, (k + 1) * stripe, 56, col)
        c.pie(k * stripe, 56 - stripe / 2, (k + 1) * stripe, 56 + stripe / 2, 0, 180, col)
    c.rect(0, 0, W, 6, "#B9343A")
    for x in (6, 314):
        c.rect(x - 4, 60, x + 4, H, "#6B4220")
    c.rect(0, 320, W, 336, "#C08850")
    c.rect(0, 320, W, 324, "#D9A066")
    c.rect(0, 336, W, H, "#8B5A2B")
    for k in range(4):
        c.line([(0, 360 + k * 24), (W, 360 + k * 24)], "#74481F", 2)


def chalkboard(c, x, y, angle=6):
    c.rotated((54, 34), lambda t: (t.rrect(0, 0, 54, 34, 3, "#6B4220"), t.rect(4, 4, 50, 30, "#2E3A33"),
                                   t.line([(10, 12), (40, 12)], "#F2F2F2", 2), t.line([(10, 21), (30, 21)], "#F2F2F2", 2), t.circ(40, 22, 3, "#F7C948")), x, y, angle)


def marche_card(c, rnd, idx):
    if idx == 0:  # Tomate géante
        market_bg(c, rnd)
        c.alpha(lambda o: o.ell(70, 316, 250, 336, (60, 20, 0, 90)))
        cx, cy, r = 160, 242, 86
        c.circ(cx, cy, r, "#E5302B")
        c.clip(lambda m: m.circ(cx, cy, r, 255), lambda t: t.circ(cx - 24, cy - 22, r * 1.02, "#F2483A"))
        for dx in (-34, 34):
            c.arc(cx + dx - 40, cy - r, cx + dx + 40, cy + r, 250 if dx < 0 else 200, 340 if dx < 0 else 290, "#C42420", 2.5)
        c.alpha(lambda o: o.ell(cx - 56, cy - 62, cx - 20, cy - 34, (255, 255, 255, 140)))
        c.poly(star_pts(cx, cy - r + 10, 34, 10, 6, -90), "#3E9A3E")
        c.poly(star_pts(cx, cy - r + 10, 22, 7, 6, -60), "#57B04F")
        c.rrect(cx - 4, cy - r - 20, cx + 4, cy - r + 6, 3, "#3E7A2E")
        for x, y, rr in ((50, 306, 18), (80, 312, 13), (270, 304, 20)):
            c.circ(x, y, rr, "#E5302B")
            c.poly(star_pts(x, y - rr + 3, rr * 0.5, rr * 0.18, 5), "#3E9A3E")
            c.circ(x - rr * 0.35, y - rr * 0.35, rr * 0.2, "#F58A7E")
        chalkboard(c, 266, 360)
    elif idx == 1:  # Baguette
        market_bg(c, rnd)

        def baguette(p0, p1, r):
            c.poly(tube(p0, p1, r, r), "#D9963A")
            c.circ(*p0, r, "#D9963A")
            c.circ(*p1, r, "#D9963A")
            c.poly(tube(lerp(p0, p1, 0.02), lerp(p0, p1, 0.98), r * 0.45, r * 0.45), "#E9B05A")
            for k in range(1, 6):
                q = lerp(p0, p1, k / 6)
                dx, dy = p1[0] - p0[0], p1[1] - p0[1]
                L = math.hypot(dx, dy)
                ux, uy = dx / L, dy / L
                c.line([(q[0] - ux * 8 - uy * 3, q[1] - uy * 8 + ux * 3), (q[0] + ux * 8 - uy * 5, q[1] + uy * 8 + ux * 5)], "#F7D9A0", 3)
        for p0, p1 in (((96, 300), (146, 120)), ((130, 300), (170, 106)), ((168, 300), (196, 116)), ((200, 300), (236, 136))):
            baguette(p0, p1, 14)
        c.poly([(80, 270), (240, 270), (226, 336), (94, 336)], "#B07A3A")
        for k in range(5):
            c.line([(82 + k * 2, 280 + k * 12), (238 - k * 2, 280 + k * 12)], "#8A5A26", 2)
        for x in range(92, 236, 14):
            c.line([(x, 272), (x + 4, 334)], "#C99050", 1.5)
        c.rect(76, 266, 244, 276, "#8A5A26")
        for k in range(5):
            a = math.radians(200 + k * 35)
            x, y = 272 + 22 * math.cos(a), 312 + 14 * math.sin(a)
            c.ell(x - 13, y - 9, x + 13, y + 9, "#E0A24A" if k % 2 else "#C9862E")
        chalkboard(c, 46, 360, -6)
    elif idx == 2:  # Fromager
        market_bg(c, rnd)
        c.alpha(lambda o: o.ell(40, 314, 290, 336, (60, 20, 0, 90)))
        c.rect(40, 236, 190, 318, "#E3B23C")
        c.ell(40, 300, 190, 336, "#E3B23C")
        c.ell(40, 218, 190, 254, "#F7D86A")
        c.line([(40, 236), (40, 318)], "#C99428", 2)
        c.line([(190, 236), (190, 318)], "#C99428", 2)
        c.ell(80, 228, 150, 244, None, "#E3B23C", 1.5)
        wedge_top = [(150, 250), (290, 226), (290, 270)]
        front = [(150, 250), (290, 270), (290, 330), (150, 312)]
        c.poly(front, "#F7D86A")
        c.poly([(150, 250), (290, 226), (290, 270)], "#FFE58A")
        c.poly([(290, 226), (300, 236), (300, 326), (290, 330)], "#E3B23C")
        for x, y, rr in ((182, 278, 9), (222, 296, 12), (262, 280, 8), (250, 312, 6), (196, 304, 5), (270, 304, 5)):
            c.ell(x - rr, y - rr * 0.8, x + rr, y + rr * 0.8, "#E3B23C")
        for x, y, rr in ((84, 276, 6), (130, 290, 8)):
            c.ell(x - rr, y - rr * 0.8, x + rr, y + rr * 0.8, "#C99428")
        c.line([(40, 300), (130, 250)], "#C9CDD6", 5)
        c.line([(40, 300), (16, 314)], "#6B4220", 7)
        c.line([(24, 309), (16, 314)], "#6B4220", 7)
        chalkboard(c, 260, 370)
    else:  # Pastèque
        market_bg(c, rnd)
        c.alpha(lambda o: o.ell(60, 318, 260, 338, (60, 20, 0, 90)))
        cx, cy = 160, 226
        c.circ(cx, cy, 102, "#2E7A3A")
        for k in range(10):
            a = math.radians(k * 36)
            c.line([(cx + 92 * math.cos(a), cy + 92 * math.sin(a)), (cx + 102 * math.cos(a + 0.12), cy + 102 * math.sin(a + 0.12))], "#1F5A2A", 5)
        c.circ(cx, cy, 92, "#8FD47A")
        c.circ(cx, cy, 86, "#F4F6E8")
        c.circ(cx, cy, 80, "#F0444E")
        c.alpha(lambda o: o.ell(cx - 64, cy - 66, cx + 10, cy - 10, (255, 140, 150, 120)))
        for ring, n, rr in ((0, 8, 54), (1, 6, 30)):
            for k in range(n):
                a = 2 * math.pi * (k + ring * 0.5) / n
                x, y = cx + rr * math.cos(a), cy + rr * math.sin(a)
                c.poly(leaf(x, y, math.degrees(a) + 180, 12, 7), "#1E1E1E")
        c.poly([(54, 340), (110, 340), (82, 300)], "#F0444E")
        c.poly([(50, 340), (114, 340), (114, 346), (50, 346)], "#2E7A3A")
        c.poly([(244, 340), (296, 340), (270, 304)], "#F0444E")
        c.poly([(240, 340), (300, 340), (300, 346), (240, 346)], "#2E7A3A")
        for x, y in ((80, 326), (88, 316), (266, 326), (276, 318)):
            c.ell(x - 2, y - 3, x + 2, y + 3, "#1E1E1E")


# --- 4 · La Forêt ----------------------------------------------------------

def pine(c, x, base, h, col):
    for k in range(3):
        w = h * (0.34 - k * 0.07)
        y0 = base - h * (0.2 + k * 0.26)
        c.poly([(x - w, y0 + h * 0.1), (x, y0 - h * 0.34), (x + w, y0 + h * 0.1)], col)
    c.rect(x - h * 0.03, base - h * 0.2, x + h * 0.03, base, hx(col, 0.3))


def fern(c, x, y, s, col="#3E8E4E"):
    for a in (-150, -120, -95, -70, -40):
        c.poly(leaf(x, y, a, 40 * s, 10 * s, bend=30 if a > -90 else -30, fat=0.5), col)


def forest_bg(c, rnd, sun, near=True):
    sun_disk(c, sun[0], sun[1], 24, "#FBF6D9", 0.45)
    c.poly(hills(rnd, 226, 10, 0.3), "#A8D6B0")
    for _ in range(18):
        pine(c, rnd.uniform(-10, 330), 248, rnd.uniform(50, 80), "#86C29A")
    c.poly(hills(rnd, 250, 8, 0.3), "#86C29A")
    for _ in range(12):
        pine(c, rnd.uniform(-10, 330), 290, rnd.uniform(80, 120), "#4E9A66")
    c.poly(hills(rnd, 290, 8, 0.3), "#4E9A66")
    c.poly(hills(rnd, 340, 8, 0), "#3E8456")
    if near:
        for x in (rnd.uniform(-10, 30), rnd.uniform(290, 330)):
            pine(c, x, 420, rnd.uniform(200, 240), "#2C6B47")
    for _ in range(26):
        x, y = rnd.uniform(0, W), rnd.uniform(350, 445)
        c.poly([(x - 3, y), (x, y - 7), (x + 3, y)], "#5EA55C")


def foret_card(c, rnd, idx):
    if idx == 0:  # Vieux chêne
        forest_bg(c, rnd, (60, 80), near=False)
        c.alpha(lambda o: o.ell(60, 384, 260, 410, (10, 40, 20, 90)))
        trunk = [(116, 400), (136, 380), (142, 300), (138, 220), (182, 220), (178, 300), (184, 380), (206, 400), (176, 394), (160, 400), (144, 394)]
        c.line([(150, 236), (96, 176)], "#6B4A2E", 14, True)
        c.line([(172, 236), (226, 170)], "#6B4A2E", 14, True)
        c.line([(160, 230), (160, 150)], "#6B4A2E", 12, True)
        c.poly(trunk, "#7A5232")
        c.poly([(166, 230), (182, 220), (178, 300), (184, 380), (206, 400), (176, 394), (172, 300)], "#5E3E24")
        for x, y0, y1 in ((150, 240, 290), (162, 300, 360), (146, 320, 380)):
            c.line([(x, y0), (x + 3, y1)], "#5E3E24", 2)
        c.ell(144, 268, 166, 300, "#3A2414")
        c.circ(150, 282, 3.5, "#FFD34D")
        c.circ(160, 282, 3.5, "#FFD34D")
        for dx, dy, r in ((0, 130, 60), (-62, 150, 46), (62, 146, 48), (-96, 186, 36), (96, 182, 38), (-34, 96, 40), (36, 92, 42), (0, 196, 44), (-50, 200, 34), (52, 202, 34)):
            c.circ(160 + dx, dy, r, "#3F8A4A")
        for dx, dy, r in ((-14, 112, 30), (-70, 140, 24), (48, 108, 22), (-100, 178, 16), (80, 160, 18), (-30, 176, 16)):
            c.circ(160 + dx, dy, r, "#5FAE5A")
        for _ in range(8):
            x, y = rnd.uniform(70, 250), rnd.uniform(80, 220)
            c.ell(x - 3, y - 4, x + 3, y + 4, "#A8743A")
        fern(c, 70, 410, 1.0)
        fern(c, 250, 414, 0.9)
    elif idx == 1:  # Champignon
        forest_bg(c, rnd, (250, 86))
        c.alpha(lambda o: o.ell(90, 382, 240, 404, (10, 40, 20, 90)))
        c.rrect(138, 270, 182, 392, 16, "#F4EBD9")
        c.rrect(138, 270, 150, 392, 6, "#FFFFFF")
        c.ell(130, 300, 190, 322, "#E8DCC4")
        c.ell(132, 296, 188, 314, "#FBF5E8")
        c.ell(76, 262, 244, 292, "#EAD9C0")
        for k in range(12):
            x = 88 + k * 13
            c.line([(x, 280), (160, 286)], "#D6C2A2", 1)
        c.chord(70, 166, 250, 310, 180, 360, "#E5302B")
        c.clip(lambda m: m.chord(70, 166, 250, 310, 180, 360, 255), lambda t: t.ell(70, 150, 220, 260, "#F2483A"))
        for x, y, rr in ((120, 210, 12), (170, 192, 14), (212, 224, 10), (100, 244, 8), (150, 230, 8), (190, 248, 7), (228, 254, 6)):
            c.ell(x - rr, y - rr * 0.8, x + rr, y + rr * 0.8, "#FFFFFF")
        for x, s in ((76, 0.5), (252, 0.6)):
            c.rrect(x - 6 * s, 400 - 40 * s, x + 6 * s, 400, 4, "#F4EBD9")
            c.chord(x - 28 * s, 400 - 64 * s, x + 28 * s, 400 - 18 * s, 180, 360, "#B9733A")
        fern(c, 40, 420, 1.0)
        fern(c, 290, 424, 0.9)
        for x in range(110, 220, 9):
            c.poly([(x - 3, 396), (x, 386 - (x % 4) * 2), (x + 3, 396)], "#5EA55C")
    elif idx == 2:  # Renard roux
        forest_bg(c, rnd, (70, 80))
        org, dk, wht = "#E8742A", "#B8541A", "#FFF6EC"
        c.alpha(lambda o: o.ell(90, 378, 290, 400, (10, 40, 20, 90)))
        t0 = (196, 374)
        c.poly(leaf(*t0, -8, 110, 50, bend=-70, fat=0.7), org)
        x, y, a = spine(*t0, -8, 110, -70, t=0.72)
        c.poly(leaf(x, y, a, 32, 30, bend=-20, fat=0.5), wht)
        c.ell(128, 256, 216, 384, org)
        c.ell(176, 300, 220, 384, dk)
        c.ell(112, 244, 162, 344, wht)
        for x0 in (126, 148):
            c.rrect(x0, 320, x0 + 15, 388, 7, org)
            c.rrect(x0, 352, x0 + 15, 390, 7, "#3A2418")
        c.poly([(110, 206), (122, 162), (140, 198)], org)
        c.poly([(116, 200), (122, 172), (134, 198)], "#3A2418")
        c.poly([(136, 200), (156, 166), (160, 210)], org)
        c.poly([(142, 202), (155, 176), (157, 206)], "#3A2418")
        head = [(76, 236), (100, 208), (140, 196), (164, 214), (160, 246), (132, 262), (100, 254)]
        c.poly(head, org)
        c.poly([(76, 236), (100, 246), (132, 262), (150, 252), (120, 238)], wht)
        c.circ(78, 236, 6, "#1E1E1E")
        c.poly(leaf(110, 222, -12, 16, 7), "#1E1E1E")
        c.circ(117, 220, 1.4, "#FFFFFF")
    else:  # Clairière
        forest_bg(c, rnd, (160, 40), near=False)
        c.alpha(lambda o: [o.poly([(160 + dx, -20), (160 + dx * 3.2 - 30, 400), (160 + dx * 3.2 + 30, 400)], (255, 250, 200, 100)) for dx in (-36, -12, 12, 36)])
        c.glow(lambda g: g.ell(70, 300, 250, 400, "#FFF4B0"), 30, 1.0)
        c.glow(lambda g: g.poly([(130, 0), (190, 0), (220, 360), (100, 360)], "#FFF4B0"), 30, 0.22)
        c.ell(40, 320, 280, 410, "#9FD67A")
        c.ell(80, 336, 240, 396, "#C2E88A")
        for side in (-1, 1):
            for k, (x, h) in enumerate(((-5, 340), (40, 300), (75, 260))):
                xx = 160 + side * (165 - x)
                c.rect(xx - 9 + k * 2, 0, xx + 9 - k * 2, 380 + k * 10, hx("#2C5A3A", 0.2 * (2 - k)))
            for k in range(5):
                c.circ(160 + side * (150 - k * 12), 20 + k * 22, 50 - k * 4, "#2C6B47")
        c.rect(144, 344, 176, 368, "#8B5A2B")
        c.ell(144, 338, 176, 350, "#C99A6A")
        c.ell(150, 341, 170, 347, "#B07A4A")
        for _ in range(26):
            x, y = rnd.uniform(60, 260), rnd.uniform(334, 404)
            c.circ(x, y, 2.4, rnd.choice(("#FFFFFF", "#FFE36B", "#FF9AC0", "#B79BFF")))
        for x, y, col in ((116, 270, "#FFB13D"), (204, 248, "#7FD3F5")):
            c.poly(leaf(x, y, -140, 14, 12), col)
            c.poly(leaf(x, y, -40, 14, 12), col)
            c.poly(leaf(x, y, 150, 10, 8), col)
            c.poly(leaf(x, y, 30, 10, 8), col)
        for _ in range(14):
            x, y = rnd.uniform(90, 230), rnd.uniform(120, 320)
            c.glow(lambda g, x=x, y=y: g.circ(x, y, 3, "#FFF4B0"), 3, 1.0)


# --- 5 · Le Port -----------------------------------------------------------

def port_bg(c, rnd, sun, quay=380, town=True):
    for _ in range(3):
        puff(c, rnd.uniform(20, 300), rnd.uniform(40, 150), rnd.uniform(0.5, 0.9), "#FFFFFF", "#DDEBF7")
    sun_disk(c, sun[0], sun[1], 24, "#FFFFFF", 0.45)
    c.poly(hills(rnd, 236, 12, 0.3), "#8EB4D8")
    if town:
        x = rnd.uniform(-10, 10)
        while x < W:
            w, h = rnd.uniform(16, 26), rnd.uniform(14, 30)
            col = rnd.choice(("#F2D3A8", "#F4B6A0", "#F7E3B4", "#C9E0F2", "#F2C0C8"))
            c.rect(x, 250 - h, x + w, 250, col)
            c.poly([(x - 2, 250 - h), (x + w / 2, 250 - h - 8), (x + w + 2, 250 - h)], "#C9573A")
            c.rect(x + w * 0.3, 250 - h * 0.6, x + w * 0.5, 250 - h * 0.35, "#4A6A8A")
            x += w + 1
    c.vgrad(0, 250, W, H, "#6DB6EA", "#245A8A")
    c.rect(0, 249, W, 251.5, "#E6F2FB")
    for _ in range(16):
        x, y = rnd.uniform(0, W), rnd.uniform(258, quay)
        c.line([(x, y), (x + rnd.uniform(8, 22), y)], "#A8D4F2", 1.4)
    if quay < H:
        c.rect(0, quay, W, H, "#A9A296")
        c.rect(0, quay, W, quay + 6, "#C9C2B4")
        for k in range(3):
            y = quay + 6 + k * 22
            for x in range(-20 + (k % 2) * 24, W, 48):
                c.rrect(x + 2, y + 2, x + 46, y + 20, 3, "#B6AFA2")


def bollard(c, x, y):
    c.rrect(x - 12, y - 30, x + 12, y, 4, "#2B2F38")
    c.ell(x - 18, y - 38, x + 18, y - 26, "#3A3F4A")


def gull(c, x, y, s, flip=1):
    c.poly(leaf(x - 10 * s * flip, y, -150 if flip > 0 else -30, 46 * s, 16 * s, bend=40 * flip, fat=0.6), "#B9C2CF")
    c.ell(x - 22 * s, y - 6 * s, x + 22 * s, y + 8 * s, "#FFFFFF")
    c.poly(leaf(x - 2 * s * flip, y - 2 * s, -120 if flip > 0 else -60, 50 * s, 18 * s, bend=50 * flip, fat=0.6), "#D9DFE8")
    c.circ(x + 20 * s * flip, y - 6 * s, 8 * s, "#FFFFFF")
    c.poly([(x + 26 * s * flip, y - 8 * s), (x + 38 * s * flip, y - 5 * s), (x + 26 * s * flip, y - 3 * s)], "#F7C948")


def port_card(c, rnd, idx):
    if idx == 0:  # Mouette
        port_bg(c, rnd, (60, 90))
        bollard(c, 60, 410)
        for x, y in ((90, 300), (250, 320)):
            c.poly([(x - 30, y), (x + 30, y), (x + 22, y + 12), (x - 22, y + 12)], "#E5484D")
            c.line([(x, y), (x, y - 40)], "#6B4A2E", 2)
            c.poly([(x + 2, y - 38), (x + 2, y - 6), (x + 24, y - 6)], "#F6F1E1")
        cx, cy = 150, 210
        c.poly(leaf(cx + 14, cy - 6, -70, 120, 40, bend=34, fat=0.6), "#D9DFE8")
        x, y, a = spine(cx + 14, cy - 6, -70, 120, 34, t=0.72)
        c.poly(leaf(x, y, a, 36, 20, bend=12, fat=0.5), "#2E323C")
        c.poly([(cx - 56, cy), (cx - 92, cy - 14), (cx - 86, cy + 14)], "#FFFFFF")
        c.ell(cx - 66, cy - 18, cx + 58, cy + 18, "#FFFFFF")
        c.ell(cx - 46, cy + 4, cx + 46, cy + 18, "#E6EBF2")
        c.circ(cx + 60, cy - 10, 20, "#FFFFFF")
        c.poly([(cx + 74, cy - 12), (cx + 106, cy - 6), (cx + 74, cy - 2)], "#F7C948")
        c.circ(cx + 92, cy - 5, 2.2, "#E5484D")
        c.circ(cx + 66, cy - 14, 3.2, "#1E1E1E")
        c.poly(leaf(cx - 4, cy - 6, -118, 140, 46, bend=-36, fat=0.6), "#B9C2CF")
        x, y, a = spine(cx - 4, cy - 6, -118, 140, -36, t=0.72)
        c.poly(leaf(x, y, a, 42, 24, bend=-12, fat=0.5), "#2E323C")
        gull(c, 262, 110, 0.4)
    elif idx == 1:  # Phare
        port_bg(c, rnd, (250, 70), quay=470, town=False)
        c.alpha(lambda o: [o.poly([(160, 128), (-40, 70 + d), (-40, 170 + d)], (255, 248, 200, 80)) for d in (0,)] + [o.poly([(160, 128), (360, 60), (360, 160)], (255, 248, 200, 80))])
        for x, y, rx, ry, col in ((160, 380, 120, 40, "#6E7480"), (100, 370, 60, 30, "#8A909C"), (220, 376, 70, 32, "#7E8490"), (160, 360, 70, 26, "#8A909C")):
            c.poly(blob(rnd, x, y, rx, ry, 0.15, 12), col)
        tower = [(134, 356), (186, 356), (176, 150), (144, 150)]
        c.poly(tower, "#F5F3EE")
        c.clip(lambda m: m.poly(tower, 255), lambda t: [t.rect(100, 170 + k * 52, 220, 196 + k * 52, "#E5484D") for k in range(4)])
        c.clip(lambda m: m.poly(tower, 255), lambda t: t.rect(166, 140, 220, 360, "#000000"), opacity=0.12)
        c.rect(150, 300, 170, 332, "#3A3F4A")
        c.pie(150, 292, 170, 308, 180, 360, "#3A3F4A")
        c.rect(136, 138, 184, 150, "#2B2F38")
        c.glow(lambda g: g.circ(160, 124, 22, "#FFE36B"), 14, 1.2)
        c.rect(146, 108, 174, 138, "#FFE7A0")
        for x in (146, 160, 174):
            c.line([(x, 108), (x, 138)], "#2B2F38", 2.5)
        c.poly([(140, 110), (180, 110), (160, 86)], "#2B2F38")
        c.circ(160, 84, 4, "#2B2F38")
        for x, y, r in ((60, 380, 14), (84, 366, 10), (262, 378, 16), (240, 362, 9), (290, 390, 10)):
            c.circ(x, y, r, "#FFFFFF")
        gull(c, 70, 150, 0.45)
        gull(c, 250, 200, 0.35, -1)
    elif idx == 2:  # Chalutier
        port_bg(c, rnd, (60, 90), quay=470)
        c.alpha(lambda o: o.ell(40, 336, 290, 372, (10, 40, 70, 90)))
        c.line([(190, 300), (190, 150)], "#4A4F5A", 4)
        c.line([(190, 170), (100, 214)], "#4A4F5A", 3)
        c.line([(190, 170), (282, 200)], "#4A4F5A", 3)
        c.line([(100, 214), (86, 300)], "#4A4F5A", 1.2)
        c.line([(282, 200), (290, 290)], "#4A4F5A", 1.2)
        net = [(230, 300), (282, 202), (286, 300)]
        c.poly(net, "#7FA38A")
        for k in range(1, 6):
            c.line([lerp(net[0], net[1], k / 6), lerp(net[2], net[1], k / 6)], "#4E7A5E", 1.2)
            c.line([lerp(net[0], net[2], k / 6), lerp(net[0], net[2], k / 6)[:1] + (300 - k * 16,)], "#4E7A5E", 1.2)
        c.poly([(190, 150), (212, 156), (190, 162)], "#E5484D")
        c.rect(94, 236, 164, 300, "#F5F3EE")
        c.rect(88, 228, 170, 238, "#E5484D")
        for x in (102, 124, 146):
            c.rect(x, 248, x + 14, 266, "#2E4A6A")
        c.rect(138, 206, 150, 228, "#E5484D")
        c.rect(138, 202, 150, 208, "#2B2F38")
        hull = [(50, 296), (264, 296), (296, 276), (282, 312), (256, 346), (80, 346), (48, 316)]
        c.poly(hull, "#2F6FA8")
        c.clip(lambda m: m.poly(hull, 255), lambda t: t.rect(0, 330, W, 360, "#C9473D"))
        c.line([(50, 306), (288, 298)], "#F5F3EE", 4)
        for x in (90, 120, 150):
            c.circ(x, 318, 4, "#F5F3EE")
        for x, y, s in ((60, 150, 0.45), (250, 120, 0.35), (100, 110, 0.3)):
            gull(c, x, y, s, 1 if x < 160 else -1)
    else:  # Ancre
        port_bg(c, rnd, (258, 84), quay=380)
        c.alpha(lambda o: o.ell(70, 372, 250, 392, (20, 20, 30, 90)))
        navy, lt = "#2B3A55", "#4E6488"
        c.circ(160, 110, 20, None, navy, 9)
        c.rrect(150, 126, 170, 340, 6, navy)
        c.rrect(152, 128, 157, 336, 3, lt)
        c.rrect(102, 150, 218, 168, 8, navy)
        c.circ(102, 159, 10, navy)
        c.circ(218, 159, 10, navy)
        c.arc(88, 236, 232, 352, 20, 160, navy, 16)
        for side in (-1, 1):
            x, y = 160 + side * 72 * math.cos(math.radians(20)), 294 + 58 * math.sin(math.radians(20))
            c.poly([(x - side * 4, y + 14), (x + side * 22, y - 20), (x + side * 8, y + 18)], navy)
            c.poly([(x - side * 10, y + 10), (x + side * 2, y - 26), (x + side * 14, y + 4)], navy)
        c.circ(160, 346, 12, navy)
        rope = bez((160, 92), (240, 140), (80, 200), (170, 240), 30) + bez((170, 240), (240, 270), (120, 300), (230, 330), 30)[1:]
        c.line(rope, "#D9B77A", 6)
        c.line(rope, "#B8935A", 1.5)
        c.line(rope[::1], "#F2D9A8", 1)
        c.circ(270, 352, 26, "#E5484D")
        c.circ(270, 352, 15, "#A9A296")
        for a in (45, 135, 225, 315):
            c.arc(244, 326, 296, 378, a - 15, a + 15, "#FFFFFF", 11)


# --- 6 · La Montagne -------------------------------------------------------

def peak(c, x, top, base, hw, col, shade, snow=0.32, rnd=None):
    c.poly([(x - hw, base), (x, top), (x + hw, base)], col)
    c.poly([(x, top), (x + hw, base), (x + hw * 0.25, base)], shade)
    h = (base - top) * snow
    k = hw * (h / (base - top))
    cap = [(x, top), (x + k, top + h), (x + k * 0.55, top + h * 0.78), (x + k * 0.2, top + h * 1.0), (x - k * 0.25, top + h * 0.8),
           (x - k * 0.6, top + h * 1.02), (x - k, top + h)]
    c.poly(cap, "#FFFFFF")
    c.poly([(x, top), (x + k, top + h), (x + k * 0.55, top + h * 0.78), (x + k * 0.2, top + h * 1.0)], "#DCE6F4")


def mountain_bg(c, rnd, sun, main=None, snow_ground=False):
    for _ in range(2):
        puff(c, rnd.uniform(20, 300), rnd.uniform(40, 130), rnd.uniform(0.5, 0.8), "#FFFFFF", "#DDE6F4")
    sun_disk(c, sun[0], sun[1], 24, "#FFFDF0", 0.45)
    for x, top, hw in ((30, 150, 110), (290, 140, 120), (170, 170, 120)):
        peak(c, x, top, 270, hw, "#B6C8E6", "#9FB4D8")
    if main:
        peak(c, *main, "#8EA6C8", "#6F88B0", 0.3)
    for x, top, hw in ((60, 210, 100), (260, 200, 110)):
        peak(c, x, top, 300, hw, "#7F98BF", "#6680A8", 0.22)
    c.poly(hills(rnd, 300, 8, 0.3), "#EEF3FA" if snow_ground else "#8DB87A")
    for _ in range(16):
        pine(c, rnd.uniform(-10, 330), 318, rnd.uniform(40, 70), "#3F6E5A")
    c.poly(hills(rnd, 340, 8, 0), "#F4F7FC" if snow_ground else "#7FB06A")


def montagne_card(c, rnd, idx):
    if idx == 0:  # Chamois
        mountain_bg(c, rnd, (250, 80))
        c.poly([(30, H), (60, 352), (130, 338), (230, 340), (300, 360), (330, H)], "#8E8C94")
        c.poly([(130, 338), (230, 340), (300, 360), (330, H), (200, H)], "#76747C")
        c.poly([(60, 352), (130, 338), (230, 340), (226, 346), (130, 346), (64, 358)], "#A8A6AE")
        brown, dk, legc = "#9A6238", "#6E4224", "#4A2E1A"
        for x0, x1 in ((136, 132), (150, 152), (194, 192), (208, 212)):
            c.line([(x0, 292), (x0 - 2, 318), (x1, 342)], legc, 7, True)
        c.ell(116, 246, 224, 306, brown)
        c.ell(136, 284, 216, 306, dk)
        c.line([(128, 252), (216, 258)], legc, 4)
        c.poly([(220, 262), (232, 258), (228, 274)], legc)
        c.poly([(122, 270), (148, 254), (130, 222), (104, 230)], brown)
        c.poly([(110, 238), (124, 236), (136, 266), (124, 270)], "#F2E6D0")
        c.poly(leaf(110, 216, -92, 22, 6, bend=110), "#1E1E1E")
        c.poly(leaf(120, 216, -86, 20, 6, bend=110), "#2E2620")
        c.poly(leaf(124, 220, -30, 16, 8), brown)
        c.ell(86, 212, 128, 246, "#F2E6D0")
        c.line([(116, 214), (104, 228), (92, 242)], "#2A2018", 6)
        c.circ(103, 227, 2.8, "#FFFFFF")
        c.circ(103, 227, 1.7, "#1E1E1E")
        c.circ(89, 240, 2.5, "#3A2A20")
    elif idx == 1:  # Sommet
        mountain_bg(c, rnd, (60, 80), main=(170, 76, 300, 150))
        c.line([(170, 76), (170, 40)], "#4A3A2A", 2.5)
        c.poly([(170, 40), (196, 47), (170, 54)], "#E5484D")
        for x, y, s in ((60, 270, 1.1), (160, 284, 1.2), (270, 276, 1.0), (110, 300, 0.9), (220, 302, 1.0)):
            puff(c, x, y, s, "#FFFFFF", "#DCE6F4")
    elif idx == 2:  # Avalanche
        mountain_bg(c, rnd, (270, 70), snow_ground=True)
        slope = [(-10, 120), (40, 100), (W + 10, 330), (W + 10, H), (-10, H)]
        c.poly(slope, "#EEF3FA")
        c.poly([(-10, 120), (40, 100), (W + 10, 330), (W + 10, 350)], "#C9D6EA")
        for x, y in ((250, 330), (276, 356), (300, 340), (230, 370)):
            pine(c, x, y, 60, "#3F6E5A")
        rnd2 = random.Random(7)
        for k in range(40):
            t = k / 39
            x = 30 + t * 210 + rnd2.uniform(-20, 20)
            y = 110 + t * 230 + rnd2.uniform(-20, 20)
            r = 18 + t * 30 + rnd2.uniform(-6, 6)
            c.circ(x + 4, y + 6, r, "#B9C8E0")
        rnd2 = random.Random(7)
        for k in range(40):
            t = k / 39
            x = 30 + t * 210 + rnd2.uniform(-20, 20)
            y = 110 + t * 230 + rnd2.uniform(-20, 20)
            r = 18 + t * 30 + rnd2.uniform(-6, 6)
            c.circ(x, y, r, "#FFFFFF")
        c.alpha(lambda o: [o.circ(rnd.uniform(40, 300), rnd.uniform(120, 420), rnd.uniform(2, 5), (255, 255, 255, 220)) for _ in range(40)])
        for x, y in ((210, 350), (262, 300)):
            c.line([(x, y), (x + 18, y - 34)], "#5E3A20", 4)
            c.poly([(x + 18, y - 34), (x - 8, y - 18), (x + 28, y - 6)], "#3F6E5A")
    else:  # Refuge
        mountain_bg(c, rnd, (60, 70), main=(240, 100, 290, 130), snow_ground=True)
        for x, y, h in ((36, 400, 120), (290, 410, 130), (70, 350, 70), (250, 352, 70)):
            pine(c, x, y, h, "#2F5E4A")
            c.poly([(x - h * 0.12, y - h * 0.66), (x, y - h * 0.86), (x + h * 0.12, y - h * 0.66)], "#FFFFFF")
        c.alpha(lambda o: o.ell(70, 360, 260, 392, (60, 80, 120, 70)))
        c.rect(96, 262, 224, 374, "#8B5A35")
        for k in range(8):
            c.line([(96, 270 + k * 13), (224, 270 + k * 13)], "#6B4220", 2)
        c.rect(244 - 56, 196, 244 - 40, 246, "#6E6A70")
        for k, r in enumerate((10, 14, 18)):
            c.circ(196 + k * 10, 180 - k * 20, r, "#F2F4F8")
        c.poly([(76, 276), (160, 196), (244, 276), (232, 286), (160, 216), (88, 286)], "#6B4220")
        c.poly([(70, 272), (160, 186), (250, 272), (240, 278), (160, 200), (80, 278)], "#FFFFFF")
        c.poly([(160, 216), (232, 286), (88, 286)], "#A06A40")
        lights = [(112, 296, 144, 330), (176, 296, 208, 330)]
        c.glow(lambda g: [g.rect(*b, "#FFB040") for b in lights], 10, 0.9)
        for x0, y0, x1, y1 in lights:
            c.rect(x0, y0, x1, y1, "#FFD36B")
            c.line([((x0 + x1) / 2, y0), ((x0 + x1) / 2, y1)], "#6B4220", 2.5)
            c.line([(x0, (y0 + y1) / 2), (x1, (y0 + y1) / 2)], "#6B4220", 2.5)
            c.rect(x0 - 8, y0, x0 - 2, y1, "#C9473D")
            c.rect(x1 + 2, y0, x1 + 8, y1, "#C9473D")
        c.rect(148, 330, 172, 374, "#5E3A20")
        c.circ(167, 352, 2, "#F7C948")
        c.rect(150, 236, 170, 256, "#FFD36B")
        c.rect(96, 368, 224, 380, "#FFFFFF")


# --- 7 · Le Volcan ---------------------------------------------------------

def volcano_cone(c, rnd, cx, top, hw, base, lava=True):
    c.poly([(cx - hw, base), (cx - hw * 0.18, top), (cx + hw * 0.18, top), (cx + hw, base)], "#4A1C1C")
    c.poly([(cx + hw * 0.05, top), (cx + hw * 0.18, top), (cx + hw, base), (cx + hw * 0.3, base)], "#3A1416")
    c.glow(lambda g: g.ell(cx - hw * 0.2, top - 8, cx + hw * 0.2, top + 8, "#FF8A3D"), 10, 1.0)
    c.ell(cx - hw * 0.17, top - 5, cx + hw * 0.17, top + 5, "#FFB050")
    if lava:
        for k in (-1, 0, 1):
            pts = [(cx + k * hw * 0.08, top)]
            x, y = pts[0]
            while y < base - 6:
                y += 14
                x += k * 7 + rnd.uniform(-4, 4)
                pts.append((x, y))
            c.glow(lambda g, pts=pts: g.line(pts, "#FF6B2D", 6), 4, 0.8)
            c.line(pts, "#FF7A2D", 3.5 - abs(k))


def volcano_ground(c, rnd, base=330):
    c.poly(hills(rnd, base, 10, 1), "#2B1012")
    c.poly(hills(rnd, base + 60, 12, 1), "#1A0A0C")
    cracks = []
    for _ in range(6):
        x, y = rnd.uniform(0, W), rnd.uniform(base + 20, H)
        cracks.append([(x, y), (x + rnd.uniform(10, 30), y + rnd.uniform(-6, 6)), (x + rnd.uniform(30, 60), y + rnd.uniform(-8, 8))])
    c.glow(lambda g: [g.line(p, "#FF5A1D", 3) for p in cracks], 3, 1.0)
    for p in cracks:
        c.line(p, "#FF9A3D", 1.4)


def embers(c, rnd, n, y0=0, y1=H):
    pts = [(rnd.uniform(0, W), rnd.uniform(y0, y1), rnd.uniform(1, 2.6)) for _ in range(n)]
    c.glow(lambda g: [g.circ(x, y, r * 2, "#FF8A3D") for x, y, r in pts], 3, 1.0)
    for x, y, r in pts:
        c.circ(x, y, r, "#FFC07A")


def obsidian(c, x, y, ang, L, w):
    a = math.radians(ang)
    dx, dy = math.cos(a), math.sin(a)
    nx, ny = -dy, dx
    p = [(x + nx * w, y + ny * w), (x + nx * w * 0.8 + dx * L * 0.7, y + ny * w * 0.8 + dy * L * 0.7), (x + dx * L, y + dy * L),
         (x - nx * w + dx * L * 0.75, y - ny * w + dy * L * 0.75), (x - nx * w, y - ny * w)]
    c.poly(p, "#16111E")
    c.poly([p[0], p[1], p[2], (x + dx * L * 0.72, y + dy * L * 0.72), (x + nx * w * 0.1, y + ny * w * 0.1)], "#2C2440")
    c.poly([p[1], p[2], (x + nx * w * 0.5 + dx * L * 0.72, y + ny * w * 0.5 + dy * L * 0.72)], "#4E4470")
    c.line([p[0], p[1], p[2]], "#B9A8FF", 1.4)
    c.line([(x - nx * w * 0.6 + dx * L * 0.1, y - ny * w * 0.6 + dy * L * 0.1), (x - nx * w * 0.6 + dx * L * 0.6, y - ny * w * 0.6 + dy * L * 0.6)], "#FF8A3D", 1.4)


def volcan_card(c, rnd, idx):
    if idx == 0:  # Coulée de lave
        volcano_cone(c, rnd, 170, 150, 160, 290, lava=False)
        volcano_ground(c, rnd, 300)
        river = bez((172, 152), (210, 260), (60, 330), (150, 460), 40)
        for wdt, col in ((36, "#B8321E"), (24, "#FF6B2D"), (12, "#FFC24A")):
            pts = [(x, y) for x, y in river]
            widths = [(wdt * (0.25 + 0.75 * i / len(pts))) for i in range(len(pts))]
            if col == "#B8321E":
                c.glow(lambda g: [g.line([pts[i], pts[i + 1]], "#FF5A1D", widths[i] * 1.4) for i in range(len(pts) - 1)], 10, 0.8)
            for i in range(len(pts) - 1):
                c.line([pts[i], pts[i + 1]], col, widths[i] * (1 if col != "#FFC24A" else 1.6), True)
        for t in (0.55, 0.7, 0.82, 0.93):
            i = int(t * (len(river) - 1))
            x, y = river[i]
            c.poly(blob(rnd, x + rnd.uniform(-6, 6), y, 8 + t * 10, 4 + t * 4, 0.3, 7), "#3A1416")
        for x, y in ((60, 380), (260, 400), (240, 340), (30, 430)):
            c.poly(blob(rnd, x, y, 26, 16, 0.25, 8), "#120607")
        embers(c, rnd, 20, 100, 440)
    elif idx == 1:  # Cendres
        c.alpha(lambda o: o.rect(0, 0, W, H, (40, 20, 25, 90)))
        rnd2 = random.Random(3)
        blobs = [(160 + rnd2.uniform(-30, 30) * (1 + (300 - y) / 120), y, 30 + (300 - y) * 0.28 + rnd2.uniform(-6, 6)) for y in range(290, 40, -12)]
        blobs += [(rnd2.uniform(40, 280), rnd2.uniform(40, 150), rnd2.uniform(30, 50)) for _ in range(10)]
        c.glow(lambda g: g.ell(110, 220, 210, 320, "#FF6B2D"), 30, 0.9)
        for x, y, r in blobs:
            c.circ(x + 6, y + 8, r, "#2E2428")
        for x, y, r in blobs:
            c.circ(x, y, r, "#5A4A4E")
        for x, y, r in blobs[::2]:
            c.circ(x - r * 0.3, y - r * 0.3, r * 0.5, "#76666A")
        c.glow(lambda g: g.ell(100, 250, 220, 310, "#FF5A1D"), 18, 0.8)
        bolt = [(110, 90), (126, 120), (114, 126), (134, 160)]
        c.glow(lambda g: g.line(bolt, "#E0D0FF", 4), 5, 1.2)
        c.line(bolt, "#FFFFFF", 2)
        volcano_cone(c, rnd, 160, 300, 170, 400)
        volcano_ground(c, rnd, 390)
        c.alpha(lambda o: [o.circ(rnd.uniform(0, W), rnd.uniform(0, H), rnd.uniform(1, 2.4), (90, 80, 84, 200)) for _ in range(80)])
        embers(c, rnd, 18, 200, 330)
    elif idx == 2:  # Cratère
        c.poly(hills(rnd, 200, 8, 1), "#3A1416")
        c.poly([(-10, 220), (60, 200), (160, 196), (260, 200), (330, 220), (330, 300), (-10, 300)], "#4A1C1C")
        c.glow(lambda g: g.ell(20, 230, 300, 350, "#FF6B2D"), 30, 0.9)
        c.ell(30, 236, 290, 340, "#FF7A2D")
        c.clip(lambda m: m.ell(30, 236, 290, 340, 255), lambda t: (t.ell(70, 256, 250, 324, "#FFB040"), t.ell(110, 274, 210, 306, "#FFE07A")))
        crust = []
        for _ in range(9):
            a = rnd.uniform(0, 6.3)
            d = rnd.uniform(0.3, 0.9)
            crust.append((160 + 120 * d * math.cos(a), 288 + 46 * d * math.sin(a)))
        for x, y in crust:
            c.poly(blob(rnd, x, y, rnd.uniform(10, 22), rnd.uniform(4, 8), 0.3, 8), "#7A2A18")
        for x, y, r in ((120, 280, 6), (200, 300, 8), (176, 270, 4)):
            c.circ(x, y, r, None, "#FFF2B0", 2)
        for x, y in ((150, 230), (186, 214), (120, 220)):
            c.circ(x, y, 4, "#FFB040")
        c.poly([(-10, 300), (30, 330), (90, 344), (160, 350), (240, 344), (300, 330), (330, 300), (330, H), (-10, H)], "#2B1012")
        c.line([(30, 330), (90, 344), (160, 350), (240, 344), (300, 330)], "#FF8A3D", 2)
        c.alpha(lambda o: [o.ell(x, y, x + 120, y + 30, (120, 90, 90, 70)) for x, y in ((40, 160), (160, 130), (100, 100))], blur=6)
        volcano_ground(c, rnd, 390)
        embers(c, rnd, 22, 100, 300)
    else:  # Obsidienne
        volcano_cone(c, rnd, 230, 210, 120, 300)
        c.glow(lambda g: g.circ(160, 280, 110, "#FF5A1D"), 40, 0.8)
        volcano_ground(c, rnd, 330)
        c.poly(blob(rnd, 160, 380, 130, 40, 0.15, 14), "#2B1012")
        for ang, L, w, x in ((-120, 130, 22, 130), (-62, 120, 20, 196), (-140, 80, 14, 104), (-40, 76, 13, 222)):
            obsidian(c, x, 362, ang, L, w)
        obsidian(c, 162, 372, -92, 220, 34)
        for x, y, r in ((150, 170, 12), (200, 250, 8), (112, 270, 7)):
            sparkle(c, x, y, r, "#FFFFFF")
        embers(c, rnd, 16, 60, 300)


# --- 8 · La Tempête --------------------------------------------------------

def storm_clouds(c, rnd, y1=150, n=14):
    pts = [(rnd.uniform(-20, 340), rnd.uniform(-20, y1), rnd.uniform(40, 80)) for _ in range(n)]
    for x, y, r in pts:
        c.circ(x, y + 10, r, "#2A2452")
    for x, y, r in pts:
        c.circ(x, y, r, "#4B4383")
    for x, y, r in pts[::2]:
        c.circ(x - r * 0.25, y - r * 0.3, r * 0.6, "#5E56A0")


def rain(c, rnd, n=60, alpha=110):
    c.alpha(lambda o: [o.line([(x, y), (x - 8, y + 24)], (190, 180, 255, alpha), 1.5) for x, y in ((rnd.uniform(0, W + 20), rnd.uniform(0, H)) for _ in range(n))])


def tempete_card(c, rnd, idx):
    if idx == 0:  # Éclair
        storm_clouds(c, rnd)
        c.poly(hills(rnd, 330, 12, 1), "#2A2452")
        c.poly(hills(rnd, 390, 10, 1), "#181433")
        rain(c, rnd)
        bolt = [(150, 70), (176, 70), (158, 160), (196, 160), (140, 290), (158, 200), (124, 200)]
        c.glow(lambda g: g.poly(bolt, "#FFF6B0"), 22, 1.0)
        c.glow(lambda g: g.circ(146, 300, 40, "#FFF6B0"), 20, 0.7)
        c.poly(bolt, "#FFF3A0")
        c.poly([(156, 76), (168, 76), (152, 166), (178, 166), (150, 240), (162, 194), (138, 194)], "#FFFFFF")
        branch = [(186, 160), (226, 200), (216, 206), (250, 250)]
        c.glow(lambda g: g.line(branch, "#FFF6B0", 4), 6, 1.0)
        c.line(branch, "#FFFDE0", 2)
        sparkle(c, 140, 296, 22, "#FFFDE0")
    elif idx == 1:  # Ouragan
        storm_clouds(c, rnd, 120)
        c.vgrad(0, 280, W, H, "#3C3470", "#181433")
        for k in range(5):
            y = 300 + k * 30
            pts = [(x, y + 12 * math.sin(x / 26 + k)) for x in range(-10, W + 20, 10)]
            c.line(pts, "#B9B0FF", 2)
            for x in range(10 + k * 17, W, 70):
                c.poly(leaf(x, y + 12 * math.sin(x / 26 + k) - 2, -20, 28, 12, bend=60), "#E0DCFF")
        trunk = bez((60, 420), (70, 330), (130, 250), (196, 200), 16)
        for i in range(len(trunk) - 1):
            c.line([trunk[i], trunk[i + 1]], "#5A3A30" if i % 2 else "#6B4A3E", 18 - i * 0.6, True)
        tx, ty = trunk[-1]
        for a, L in ((-30, 110), (-8, 130), (12, 120), (30, 104), (-52, 86), (50, 90), (0, 80)):
            c.poly(leaf(tx, ty, a, L, 26, bend=34, fat=0.6), "#3F8A4A" if a % 4 else "#2E6B3A")
        c.circ(tx, ty, 8, "#5A3A30")
        c.alpha(lambda o: [o.line(bez((x, y), (x + 60, y - 20), (x + 120, y + 20), (x + 180, y), 16), (230, 225, 255, 150), 2.5) for x, y in ((-40, 170), (20, 240), (-60, 290), (80, 140))])
        for x, y, a in ((250, 150, 30), (290, 260, -20), (200, 300, 60)):
            c.poly(leaf(x, y, a, 16, 8), "#5FAE5A")
        rain(c, rnd, 80, 120)
    elif idx == 2:  # Grêle
        storm_clouds(c, rnd, 110)
        c.poly(hills(rnd, 360, 8, 0.5), "#2E2A5A")
        c.poly(hills(rnd, 400, 6, 0.5), "#232048")
        for _ in range(40):
            c.circ(rnd.uniform(0, W), rnd.uniform(370, 445), rnd.uniform(2, 5), "#E6EEFF")
        stones = [(rnd.uniform(10, 310), rnd.uniform(130, 360), rnd.uniform(5, 16)) for _ in range(22)]
        stones.sort(key=lambda s: s[2])
        c.alpha(lambda o: [o.line([(x + r * 0.6, y - r * 0.8), (x + r * 1.6, y - r * 4)], (220, 230, 255, 110), r * 1.2) for x, y, r in stones])
        for x, y, r in stones:
            c.circ(x, y, r, "#EAF2FF")
            c.chord(x - r, y - r, x + r, y + r, 20, 160, "#B9C8F0")
            c.circ(x - r * 0.35, y - r * 0.35, r * 0.3, "#FFFFFF")
        for x, y in ((90, 400), (200, 410), (250, 390)):
            c.circ(x, y, 8, "#EAF2FF")
            c.arc(x - 18, y - 22, x + 18, y + 2, 200, 340, "#B9C8F0", 1.5)
    else:  # Œil du cyclone
        c.alpha(lambda o: o.rect(0, 0, W, H, (10, 6, 30, 80)))
        stars(c, rnd, 40, H, ("#D9D0FF",), 1.0)
        cx, cy = 160, 224
        lay = c.layer("RGBA")
        cols = ((120, 108, 200, 255), (170, 160, 235, 255), (225, 220, 255, 255), (255, 255, 255, 255))
        for layer_i, col in enumerate(cols):
            for k in range(6):
                a = k * 60 + layer_i * 14
                r0 = 30 + layer_i * 4
                x0, y0 = cx + r0 * math.cos(math.radians(a)), cy + r0 * math.sin(math.radians(a))
                lay.poly(leaf(x0, y0, a + 70, 150 - layer_i * 22, 54 - layer_i * 10, bend=110, fat=0.7), col)
        im = lay.img.filter(ImageFilter.GaussianBlur(1.2 * SS))
        c.glow(lambda g: g.circ(cx, cy, 120, "#9B8CFF"), 30, 0.5)
        c._reset(Image.alpha_composite(c.img.convert("RGBA"), im).convert("RGB"))
        c.circ(cx, cy, 30, "#F4F2FF")
        c.circ(cx, cy, 24, "#2B3A8A")
        c.circ(cx, cy, 20, "#3E5ABF")
        c.glow(lambda g: g.circ(cx, cy, 14, "#8FB4FF"), 8, 0.9)
        rain(c, rnd, 30, 80)


# --- 9 · Le Palais ---------------------------------------------------------

GOLD, DGOLD, LGOLD, VELVET = "#E0B040", "#B08428", "#FFE58A", "#B8263A"


def column(c, x, top, base, w=26):
    c.rect(x - w / 2, top, x + w / 2, base, "#FFF8E6")
    for k in range(-1, 2):
        c.line([(x + k * w * 0.25, top + 16), (x + k * w * 0.25, base - 10)], "#EADFC0", 2)
    c.rect(x - w * 0.75, top, x + w * 0.75, top + 14, GOLD)
    c.rect(x - w * 0.7, base - 12, x + w * 0.7, base, GOLD)


def palace_bg(c, rnd, carpet=True, windows=True):
    c.vgrad(0, 0, W, 340, "#F7E3A8", "#FFF4D6")
    c.rect(0, 0, W, 34, "#E8C873")
    for x in range(0, W, 40):
        c.chord(x, 18, x + 40, 50, 0, 180, "#D9B456")
    if windows:
        for x in (80, 240):
            c.rect(x - 34, 120, x + 34, 300, DGOLD)
            c.pie(x - 34, 86, x + 34, 154, 180, 360, DGOLD)
            c.vgrad(x - 28, 120, x + 28, 296, "#BFE3F7", "#E8F6FD")
            c.clip(lambda m, x=x: m.pie(x - 28, 92, x + 28, 148, 180, 360, 255), lambda t, x=x: t.vgrad(x - 28, 92, x + 28, 121, "#A8D8F2", "#BFE3F7"))
            c.line([(x, 92), (x, 296)], DGOLD, 3)
            c.line([(x - 28, 200), (x + 28, 200)], DGOLD, 3)
            c.poly([(x - 44, 80), (x - 28, 80), (x - 30, 310), (x - 50, 310)], VELVET)
            c.poly([(x + 44, 80), (x + 28, 80), (x + 30, 310), (x + 50, 310)], VELVET)
    for x in (10, 160, 310):
        column(c, x, 40, 340)
    c.vgrad(0, 340, W, H, "#E8C873", "#C9A24A")
    for k in range(-6, 8):
        c.line([(160 + k * 30, 340), (160 + k * 70, H)], "#D9B456", 1.4)
    for y in (360, 390, 425):
        c.line([(0, y), (W, y)], "#D9B456", 1.4)
    if carpet:
        c.poly([(130, 340), (190, 340), (240, H), (80, H)], VELVET)
        c.line([(132, 340), (84, H)], GOLD, 3)
        c.line([(188, 340), (236, H)], GOLD, 3)


def palais_card(c, rnd, idx):
    if idx == 0:  # Couronne
        palace_bg(c, rnd, carpet=False)
        c.alpha(lambda o: [o.poly([(160, 220), (160 + 260 * math.cos(math.radians(a - 6)), 220 + 260 * math.sin(math.radians(a - 6))),
                                   (160 + 260 * math.cos(math.radians(a + 6)), 220 + 260 * math.sin(math.radians(a + 6)))], (255, 240, 180, 80)) for a in range(0, 360, 30)])
        c.rect(118, 330, 202, 448, "#FFF8E6")
        c.rect(108, 322, 212, 338, GOLD)
        c.rect(112, 430, 208, 448, GOLD)
        c.alpha(lambda o: o.ell(76, 312, 244, 336, (90, 40, 10, 80)))
        cush = [(70, 300), (100, 280), (220, 280), (250, 300), (236, 324), (84, 324)]
        c.poly(cush, VELVET)
        c.poly([(84, 290), (236, 290), (230, 300), (90, 300)], "#D0384C")
        for x, y in ((70, 300), (250, 300), (84, 324), (236, 324)):
            c.circ(x, y, 5, GOLD)
            c.poly([(x - 4, y + 3), (x + 4, y + 3), (x + 2, y + 18), (x - 2, y + 18)], GOLD)
        c.glow(lambda g: g.ell(90, 160, 230, 290, "#FFD050"), 20, 0.7)
        c.chord(108, 196, 212, 260, 180, 360, "#8E1E2E")
        pts = [(100, 286), (100, 216), (124, 248), (140, 186), (160, 232), (180, 186), (196, 248), (220, 216), (220, 286)]
        c.poly(pts, GOLD)
        c.poly([(100, 216), (124, 248), (140, 186), (148, 230), (124, 262), (104, 240)], LGOLD)
        c.rrect(94, 256, 226, 290, 6, DGOLD)
        c.rrect(96, 258, 224, 270, 4, GOLD)
        for x, y in ((100, 212), (140, 180), (180, 180), (220, 212), (160, 226)):
            c.circ(x, y, 7, "#FFF8F0")
        for x, col in ((118, "#3FCF8E"), (160, "#E5484D"), (202, "#4FA3FF")):
            c.poly([(x, 264), (x + 9, 273), (x, 282), (x - 9, 273)], col)
            c.poly([(x, 264), (x + 4, 270), (x - 4, 270)], "#FFFFFF")
        for x, y, r in ((84, 190, 12), (238, 210, 10), (160, 150, 9)):
            sparkle(c, x, y, r, "#FFFFFF")
    elif idx == 1:  # Trône
        palace_bg(c, rnd)
        c.rect(60, 336, 260, 356, "#F2DFA6")
        c.rect(60, 336, 260, 340, GOLD)
        c.rect(80, 316, 240, 336, "#F7E8BC")
        c.rect(80, 316, 240, 320, GOLD)
        c.alpha(lambda o: o.ell(90, 304, 230, 324, (90, 40, 10, 80)))
        c.rrect(104, 110, 216, 300, 20, GOLD)
        c.pie(124, 74, 196, 146, 180, 360, GOLD)
        c.poly(star_pts(160, 84, 14, 6), LGOLD)
        c.rrect(118, 124, 202, 290, 14, VELVET)
        for x in (138, 160, 182):
            for y in (150, 190, 230, 266):
                c.circ(x + (10 if y in (190, 266) and x < 182 else 0), y, 2.5, "#7A1626")
        c.rrect(94, 280, 226, 306, 10, VELVET)
        c.rrect(94, 280, 226, 288, 6, "#D0384C")
        for x in (98, 222):
            c.rrect(x - 12, 228, x + 12, 304, 8, GOLD)
            c.circ(x, 228, 13, LGOLD)
        for x in (104, 216):
            c.rect(x - 6, 304, x + 6, 318, DGOLD)
        c.line([(112, 120), (112, 290)], LGOLD, 3)
    elif idx == 2:  # Lustre
        palace_bg(c, rnd, carpet=False, windows=False)
        c.poly([(40, 34), (280, 34), (300, 340), (20, 340)], "#8E1E2E")
        for x in range(50, 290, 30):
            c.line([(x, 40), (x + (x - 160) * 0.08, 336)], "#7A1626", 3)
        c.poly([(40, 34), (280, 34), (270, 70), (50, 70)], VELVET)
        c.circ(160, 34, 18, GOLD)
        c.line([(160, 34), (160, 120)], DGOLD, 3)
        cx = 160
        c.glow(lambda g: g.circ(cx, 210, 100, "#FFE07A"), 40, 0.6)
        for tier, (cy, rx, ry, n) in enumerate(((150, 50, 12, 6), (230, 100, 22, 8))):
            pts = [(cx + rx * math.cos(2 * math.pi * k / n), cy + ry * math.sin(2 * math.pi * k / n)) for k in range(n)]
            for x, y in pts:
                c.line(bez((cx, cy - 40 + tier * 10), (cx + (x - cx) * 0.3, y + 20), (x, y + 22), (x, y)), GOLD, 3)
            c.ell(cx - rx, cy - ry, cx + rx, cy + ry, None, GOLD, 5)
            for k in range(n * 3):
                a = 2 * math.pi * k / (n * 3)
                x, y = cx + rx * math.cos(a), cy + ry * math.sin(a)
                c.poly(leaf(x, y + 3, 90, 16 + tier * 4, 6), "#F2F6FF")
                c.circ(x, y + 18 + tier * 4, 2, "#FFFFFF")
            lights = [(x, y - 10) for x, y in pts]
            c.glow(lambda g, lights=lights: [g.circ(x, y, 9, "#FFE07A") for x, y in lights], 6, 1.2)
            for x, y in pts:
                c.rect(x - 3, y - 14, x + 3, y, "#FFF8E6")
                c.poly(leaf(x, y - 14, -90, 12, 7), "#FFD36B")
        c.poly([(150, 120), (170, 120), (178, 160), (166, 190), (176, 250), (144, 250), (154, 190), (142, 160)], GOLD)
        c.poly([(152, 124), (158, 124), (150, 160), (156, 240), (148, 240), (146, 160)], LGOLD)
        c.poly(leaf(cx, 250, 90, 30, 14), "#F2F6FF")
        for x, y, r in ((70, 180, 10), (250, 160, 12), (220, 290, 8)):
            sparkle(c, x, y, r, "#FFFFFF")
    else:  # Salle des glaces
        vx, vy = 160, 214
        c.vgrad(0, 0, W, H, "#D9B456", "#B08A38")
        c.poly([(0, 0), (W, 0), (vx + 36, vy - 50), (vx - 36, vy - 50)], "#C9A24A")
        c.poly([(0, H), (W, H), (vx + 36, vy + 40), (vx - 36, vy + 40)], "#A8823A")
        for k in range(-5, 6):
            c.line([(vx + k * 7, vy + 40), (160 + k * 60, H)], "#B08A38", 1.2)
        for d in (0.15, 0.3, 0.5, 0.75):
            y = vy + 40 + (H - vy - 40) * d
            c.line([(vx - 36 - (160 - 36) * d * 1.0, y), (vx + 36 + (124) * d, y)], "#B08A38", 1.2)
        c.alpha(lambda o: o.poly([(vx - 20, vy + 40), (vx + 20, vy + 40), (vx + 50, H), (vx - 50, H)], (255, 250, 220, 90)))
        for side in (-1, 1):
            xs = [0, 0.38, 0.6, 0.74, 0.83, 0.89]
            for i in range(len(xs) - 1):
                t0, t1 = xs[i], xs[i + 1]
                xa, xb = vx - side * 160 * (1 - t0 * 0.775), vx - side * 160 * (1 - t1 * 0.775)
                k0, k1 = 1 - t0 * 0.775, 1 - t1 * 0.775
                top0, top1 = vy - 214 * k0 * 0.62, vy - 214 * k1 * 0.62
                bot0, bot1 = vy + 234 * k0 * 0.62, vy + 234 * k1 * 0.62
                ins = 0.12
                xa2, xb2 = xa + (xb - xa) * ins, xb - (xb - xa) * ins
                ta, tb = top0 + (top1 - top0) * ins, top1 - (top1 - top0) * ins
                ba, bb = bot0 + (bot1 - bot0) * ins, bot1 - (bot1 - bot0) * ins
                arch = [(xa2, ba), (xa2, ta + 10 * k0), ((xa2 + xb2) / 2, ta - 8 * k0), (xb2, tb + 10 * k1), (xb2, bb)]
                frame = [(x - side * 0, y) for x, y in arch]
                c.poly([(xa2 - side * 4 * k0, ba + 4 * k0), (xa2 - side * 4 * k0, ta + 4 * k0), ((xa2 + xb2) / 2, ta - 14 * k0), (xb2 + side * 4 * k1, tb + 4 * k1), (xb2 + side * 4 * k1, bb + 4 * k1)], GOLD)
                c.poly(frame, "#DCE8F5")
                c.clip(lambda m, frame=frame: m.poly(frame, 255), lambda t, xa2=xa2, xb2=xb2, ta=ta, bb=bb: (t.vgrad(min(xa2, xb2), ta - 20, max(xa2, xb2), bb, "#EEF5FC", "#BFD3EA"),
                                                                                                        t.poly([(xa2, ta + (bb - ta) * 0.7), (xa2, ta + (bb - ta) * 0.5), (xb2, ta), (xb2, ta + (bb - ta) * 0.2)], "#FFFFFF")))
        c.glow(lambda g: g.rect(vx - 34, vy - 50, vx + 34, vy + 40, "#FFF2C0"), 24, 1.2)
        c.rect(vx - 22, vy - 30, vx + 22, vy + 40, "#FFFBEA")
        c.pie(vx - 22, vy - 52, vx + 22, vy - 8, 180, 360, "#FFFBEA")
        c.line([(vx, vy - 52), (vx, vy + 40)], "#E8C873", 2)
        c.line([(vx - 22, vy), (vx + 22, vy)], "#E8C873", 2)
        for d, s in ((0.15, 1.0), (0.4, 0.62), (0.62, 0.4)):
            y = 70 + (vy - 60 - 70) * d * 1.4
            x = vx
            c.line([(x, 0), (x, y - 10 * s)], DGOLD, 1.5 * s)
            c.glow(lambda g, x=x, y=y, s=s: g.ell(x - 26 * s, y - 8 * s, x + 26 * s, y + 10 * s, "#FFE07A"), 8 * s, 1.0)
            c.ell(x - 22 * s, y - 6 * s, x + 22 * s, y + 6 * s, None, GOLD, 3 * s)
            for k in range(-2, 3):
                c.poly(leaf(x + k * 9 * s, y + 4 * s, 90, 12 * s, 5 * s), "#FFFFFF")
        sparkle(c, 60, 140, 10, "#FFFFFF")
        sparkle(c, 264, 300, 8, "#FFFFFF")


# --- 10 · Le Cosmos --------------------------------------------------------

def cosmos_bg(c, rnd, n=150, ground=False):
    for _ in range(n):
        c.circ(rnd.uniform(0, W), rnd.uniform(0, H), rnd.choice((0.5, 0.6, 0.8, 1.1, 1.4)), mix((255, 255, 255), hex_rgb("#C9B8FF"), rnd.random()))
    for _ in range(4):
        sparkle(c, rnd.uniform(10, 310), rnd.uniform(10, 430), rnd.uniform(3, 6), "#FFFFFF")
    if ground:
        c.poly(hills(rnd, 372, 12, 0.5), "#3B1F6E")
        c.poly(hills(rnd, 410, 10, 0.5), "#251248")
        for _ in range(16):
            c.circ(rnd.uniform(0, W), rnd.uniform(380, 445), rnd.uniform(1, 2.2), "#C9A6FF")


def cosmos_card(c, rnd, idx):
    if idx == 0:  # Nébuleuse
        cosmos_bg(c, rnd)
        lay = c.layer()
        for x, y, rx, ry, col in ((130, 200, 110, 70, "#FF4FA8"), (200, 250, 100, 80, "#7B4BFF"), (120, 280, 90, 60, "#4B8BFF"),
                                  (190, 170, 70, 50, "#FF8AD8"), (150, 230, 60, 40, "#FFD0F0"), (240, 320, 60, 40, "#4BD8FF")):
            lay.poly(blob(rnd, x, y, rx, ry, 0.3, 14), col)
        c._reset(ImageChops.add(c.img, lay.img.filter(ImageFilter.GaussianBlur(26 * SS)).point(lambda v: int(v * 0.9))))
        c._reset(ImageChops.add(c.img, lay.img.filter(ImageFilter.GaussianBlur(8 * SS)).point(lambda v: int(v * 0.35))))
        c.alpha(lambda o: o.poly(blob(rnd, 170, 236, 90, 14, 0.4, 14), (20, 8, 40, 120)), blur=6)
        for x, y, r in ((150, 220, 14), (204, 262, 9), (110, 280, 7), (190, 170, 8)):
            c.glow(lambda g, x=x, y=y, r=r: g.circ(x, y, r * 0.6, "#FFFFFF"), r * 0.6, 1.2)
            sparkle(c, x, y, r, "#FFFFFF")
    elif idx == 1:  # Comète
        cosmos_bg(c, rnd, ground=True)
        hx_, hy = 236, 128
        c.alpha(lambda o: o.poly([(hx_ - 10, hy - 10), (hx_ + 10, hy + 10), (-20, 420), (-60, 330)], (140, 200, 255, 60)), blur=10)
        c.alpha(lambda o: o.poly([(hx_ - 6, hy - 6), (hx_ + 6, hy + 6), (10, 400), (-20, 350)], (200, 230, 255, 110)), blur=4)
        c.alpha(lambda o: o.poly(bez((hx_, hy), (180, 200), (100, 290), (30, 380), 20) + bez((40, 420), (120, 310), (190, 220), (hx_ + 4, hy + 6), 20), (255, 220, 160, 70)), blur=6)
        c.glow(lambda g: g.circ(hx_, hy, 26, "#9FE0FF"), 18, 1.2)
        c.circ(hx_, hy, 11, "#FFFFFF")
        c.circ(40, 80, 18, "#7A5ABF")
        c.circ(46, 74, 15, "#9B7BDF")
    elif idx == 2:  # Supernova
        cosmos_bg(c, rnd)
        cx, cy = 160, 200
        c.glow(lambda g: g.circ(cx, cy, 120, "#FF6FB0"), 50, 0.7)
        c.glow(lambda g: g.ell(cx - 130, cy - 40, cx + 130, cy + 40, None, "#FFB060", 6), 6, 1.2)
        c.ell(cx - 126, cy - 38, cx + 126, cy + 38, None, "#FFD9A0", 2)
        rays = []
        for k in range(16):
            a = math.radians(k * 22.5 + rnd.uniform(-5, 5))
            L = rnd.uniform(70, 140) if k % 2 else rnd.uniform(130, 180)
            rays.append([(cx + 6 * math.cos(a + 1.57), cy + 6 * math.sin(a + 1.57)), (cx + L * math.cos(a), cy + L * math.sin(a)), (cx - 6 * math.cos(a + 1.57), cy - 6 * math.sin(a + 1.57))])
        c.glow(lambda g: [g.poly(r, "#FFE6A0") for r in rays], 6, 1.0)
        c.alpha(lambda o: [o.poly(r, (255, 250, 230, 200)) for r in rays])
        c.glow(lambda g: g.circ(cx, cy, 30, "#FFFFFF"), 18, 1.4)
        c.circ(cx, cy, 20, "#FFFFFF")
        for _ in range(30):
            a, d = rnd.uniform(0, 6.3), rnd.uniform(60, 150)
            c.circ(cx + d * math.cos(a), cy + d * math.sin(a), rnd.uniform(1, 2.5), rnd.choice(("#FFD0A0", "#FF9AD0", "#FFFFFF")))
    else:  # Lune rousse
        cosmos_bg(c, rnd, ground=True)
        cx, cy, r = 160, 212, 88
        c.glow(lambda g: g.circ(cx, cy, r * 1.4, "#FF6A3D"), 40, 0.7)
        c.circ(cx, cy, r, "#E0784A")
        c.clip(lambda m: m.circ(cx, cy, r, 255), lambda t: (t.poly(blob(rnd, cx - 30, cy - 20, 40, 30, 0.3), "#C85E38"), t.poly(blob(rnd, cx + 30, cy + 26, 34, 22, 0.3), "#C85E38")))
        c.clip(lambda m: (m.circ(cx, cy, r, 255), m.circ(cx - 34, cy - 14, r, 0)), lambda t: t.circ(cx, cy, r, "#8A3420"), opacity=0.55, blur=8)
        c.clip(lambda m: m.circ(cx, cy, r, 255), lambda t: t.circ(cx - 20, cy - 16, r * 0.95, "#F09060"), opacity=0.5, blur=10)
        for dx, dy, rr in ((-40, 30, 10), (20, -50, 8), (44, 20, 12), (-10, -8, 6), (-56, -30, 7)):
            c.circ(cx + dx, cy + dy, rr, "#B85A36")
            c.circ(cx + dx - rr * 0.2, cy + dy - rr * 0.2, rr * 0.75, "#D06A42")


# --- 21 · La Galerie (monde final) -----------------------------------------

def ornate_frame(c, x0, y0, x1, y1, t=14, inner="#1A1030"):
    """Cadre doré mouluré ; renvoie la zone intérieure (toile)."""
    c.rrect(x0, y0, x1, y1, 6, DGOLD)
    c.rrect(x0 + 2, y0 + 2, x1 - 2, y1 - 2, 5, GOLD)
    c.rect(x0 + t * 0.45, y0 + t * 0.45, x1 - t * 0.45, y1 - t * 0.45, LGOLD)
    c.rect(x0 + t * 0.6, y0 + t * 0.6, x1 - t * 0.6, y1 - t * 0.6, DGOLD)
    for k in range(int((x1 - x0) / 16)):
        x = x0 + t + k * 16
        if x < x1 - t:
            c.circ(x, y0 + t * 0.25, 1.6, LGOLD)
            c.circ(x, y1 - t * 0.25, 1.6, LGOLD)
    for k in range(int((y1 - y0) / 16)):
        y = y0 + t + k * 16
        if y < y1 - t:
            c.circ(x0 + t * 0.25, y, 1.6, LGOLD)
            c.circ(x1 - t * 0.25, y, 1.6, LGOLD)
    c.rect(x0 + t, y0 + t, x1 - t, y1 - t, inner)
    for x, y in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
        c.circ(x, y, t * 0.7, GOLD)
        c.circ(x, y, t * 0.42, LGOLD)
        c.circ(x, y, t * 0.18, DGOLD)
    return x0 + t, y0 + t, x1 - t, y1 - t


def marble_column(c, x, top, base, w=24):
    c.rect(x - w / 2, top, x + w / 2, base, "#E6E0EE")
    c.rect(x + w * 0.15, top, x + w / 2, base, "#CFC7DD")
    c.rect(x - w * 0.8, top, x + w * 0.8, top + 14, GOLD)
    c.rect(x - w * 0.8, top + 10, x + w * 0.8, top + 14, DGOLD)
    c.rect(x - w * 0.75, base - 12, x + w * 0.75, base, GOLD)


def spotlight(c, x, x_bot, w_bot, y_bot=448, a=36):
    c.alpha(lambda o: o.poly([(x - 8, -10), (x + 8, -10), (x_bot + w_bot, y_bot), (x_bot - w_bot, y_bot)], (255, 240, 200, a)), blur=6)


def gallery_bg(c, rnd, carpet=True, columns=True, spots=(160,), floor=True):
    c.vgrad(0, 0, W, H, "#0D0726", "#2B1559")
    lay = c.layer()
    for x, y, r, col in ((60, 120, 90, "#6A2FB0"), (270, 200, 80, "#2F3FB0"), (180, 60, 70, "#8A2F90")):
        lay.circ(x, y, r, col)
    c._reset(ImageChops.add(c.img, lay.img.filter(ImageFilter.GaussianBlur(40 * SS)).point(lambda v: int(v * 0.45))))
    for _ in range(45):
        c.circ(rnd.uniform(0, W), rnd.uniform(0, 330), rnd.choice((0.6, 0.9, 1.3)), mix((255, 255, 255), hex_rgb("#E6C8FF"), rnd.random()))
    for _ in range(3):
        sparkle(c, rnd.uniform(10, 310), rnd.uniform(10, 300), rnd.uniform(3, 5), "#FFFFFF")
    for x, y, s, a in ((40, 70, 0.9, -12), (282, 96, 0.8, 10), (250, 250, 0.6, -6), (64, 262, 0.55, 8)):
        c.rotated((40 * s, 52 * s), lambda t, s=s: (t.rect(0, 0, 40 * s, 52 * s, hx(GOLD, 0.45)), t.rect(5 * s, 5 * s, 35 * s, 47 * s, "#160C30")), x, y, a)
    if floor:
        c.poly([(-30, H), (W + 30, H), (262, 332), (58, 332)], "#D9D2E6")
        for k in range(-3, 4):
            c.line([(160 + k * 29, 332), (160 + k * 92, H)], "#CCC3DC", 1.2)
        for y in (352, 386):
            c.line([(0, y), (W, y)], "#CCC3DC", 1.2)
        c.line([(58, 332), (262, 332)], GOLD, 3)
        if carpet:
            c.poly([(138, 332), (182, 332), (236, H), (84, H)], VELVET)
            c.line([(140, 332), (88, H)], GOLD, 2.5)
            c.line([(180, 332), (232, H)], GOLD, 2.5)
    if columns:
        for x in (24, 296):
            marble_column(c, x, 36, 352)
    for x in spots:
        spotlight(c, x, x, 120)


def lady(t, cx, cy):
    t.ell(cx - 64, cy + 50, cx + 64, cy + 150, "#2A3A6A")
    t.poly([(cx - 30, cy + 56), (cx, cy + 96), (cx + 30, cy + 56)], "#F0D2B4")
    t.rect(cx - 10, cy + 20, cx + 10, cy + 60, "#E8C6A6")
    t.pie(cx - 34, cy - 50, cx + 34, cy + 20, 180, 360, "#5A3420")
    t.circ(cx, cy - 46, 15, "#5A3420")
    t.ell(cx - 24, cy - 32, cx + 24, cy + 30, "#F0D2B4")
    t.pie(cx - 26, cy - 36, cx + 26, cy + 4, 180, 360, "#5A3420")
    for dx in (-9, 9):
        t.circ(cx + dx, cy - 2, 2.2, "#3A2418")
    t.arc(cx - 8, cy + 6, cx + 8, cy + 18, 30, 150, "#B8584A", 1.6)
    t.ell(cx - 18, cy + 4, cx - 10, cy + 10, "#F2B0A0")
    t.ell(cx + 10, cy + 4, cx + 18, cy + 10, "#F2B0A0")
    for k in range(9):
        a = math.radians(20 + k * 17.5)
        t.circ(cx + 26 * math.cos(a), cy + 60 + 16 * math.sin(a), 2.6, "#FFF8F0")


def galerie_card(c, rnd, idx):
    if idx == 0:  # Portrait doré
        gallery_bg(c, rnd)
        c.glow(lambda g: g.rect(74, 92, 246, 324, "#FFD060"), 18, 0.6)
        x0, y0, x1, y1 = ornate_frame(c, 74, 92, 246, 324, 16)
        c.clip(lambda m: m.rect(x0, y0, x1, y1, 255), lambda t: (t.vgrad(x0, y0, x1, y1, "#2F4A3A", "#16261E"), lady(t, 160, 196)))
        c.rrect(132, 334, 188, 346, 3, GOLD)
        c.rect(140, 339, 180, 341, DGOLD)
    elif idx == 1:  # Statue d'ivoire
        gallery_bg(c, rnd, carpet=False)
        c.alpha(lambda o: o.ell(84, 404, 236, 428, (20, 10, 40, 90)))
        c.rect(104, 326, 216, 420, "#EEE8F4")
        c.rect(176, 326, 216, 420, "#D2CAE0")
        c.rect(96, 318, 224, 330, GOLD)
        c.rect(96, 410, 224, 422, GOLD)
        iv, sh, dk = "#F4ECD8", "#E0D3B8", "#C9B898"
        c.rect(122, 304, 198, 318, sh)
        robe = [(134, 188), (186, 188), (198, 304), (122, 304)]
        c.poly(robe, iv)
        c.poly([(166, 188), (186, 188), (198, 304), (170, 304)], sh)
        for x0, x1 in ((140, 132), (152, 148), (164, 166), (178, 186)):
            c.line([(x0, 214), (x1, 302)], dk, 1.5)
        c.poly(leaf(134, 192, 70, 70, 20, bend=-60), iv)
        c.poly(leaf(186, 194, -60, 64, 18, bend=-30), sh)
        x, y, _ = spine(186, 194, -60, 64, -30)
        c.circ(x, y, 9, iv)
        c.rect(152, 170, 168, 192, sh)
        c.circ(160, 158, 21, iv)
        c.chord(139, 137, 181, 179, 300, 90, sh)
        for k in range(7):
            a = math.radians(-180 + k * 30)
            c.circ(160 + 19 * math.cos(a), 152 + 16 * math.sin(a), 6, "#EADFC6")
        c.poly(leaf(118, 160, -60, 22, 8), "#C9B898")
        sparkle(c, 200, 150, 9, "#FFFFFF")
    elif idx == 2:  # Vitrail céleste
        gallery_bg(c, rnd, columns=True)
        left = bez((90, 190), (90, 130), (120, 92), (160, 78), 16)
        right = bez((160, 78), (200, 92), (230, 130), (230, 190), 16)
        arch = [(90, 330)] + left + right[1:] + [(230, 330)]
        outer = [(80, 340)] + bez((80, 190), (80, 120), (116, 80), (160, 64), 16) + bez((160, 64), (204, 80), (240, 120), (240, 190), 16)[1:] + [(240, 340)]
        c.glow(lambda g: g.poly(outer, "#8A6BFF"), 22, 0.8)
        c.alpha(lambda o: o.poly([(100, 330), (220, 330), (290, H), (30, H)], (190, 160, 255, 60)), blur=4)
        c.poly(outer, "#4A3F6A")
        cols = ("#3E5ABF", "#9B4BFF", "#F7C948", "#E5484D", "#4BD8FF", "#5FC46A")
        cx, cy = 160, 196

        def glass(t):
            for k in range(8):
                t.pie(cx - 260, cy - 260, cx + 260, cy + 260, k * 45 + 22.5, (k + 1) * 45 + 22.5, cols[k % 6])
            t.circ(cx, cy, 56, "#2A2A8A")
            for k in range(8):
                t.pie(cx - 56, cy - 56, cx + 56, cy + 56, k * 45 + 10, k * 45 + 35, cols[(k + 2) % 6])
            t.circ(cx, cy, 24, "#FFF2B0")
            t.poly(star_pts(cx, cy, 20, 8, 8), "#F7C948")
            for k in range(8):
                a = math.radians(k * 45 + 22.5)
                t.line([(cx + 24 * math.cos(a), cy + 24 * math.sin(a)), (cx + 260 * math.cos(a), cy + 260 * math.sin(a))], "#1A1030", 3)
            for r in (24, 56, 96):
                t.circ(cx, cy, r, None, "#1A1030", 3)
            t.line([(90, 290), (230, 290)], "#1A1030", 3)
            t.rect(90, 292, 230, 330, "#2A2A8A")
            t.line([(160, 292), (160, 330)], "#1A1030", 3)
        c.clip(lambda m: m.poly(arch, 255), glass)
        c.clip(lambda m: m.poly(arch, 255), lambda t: t.poly([(90, 330), (90, 100), (140, 80), (110, 330)], "#FFFFFF"), opacity=0.18)
        c.line(arch, "#1A1030", 3)
    elif idx == 3:  # Fresque éternelle
        gallery_bg(c, rnd)
        c.glow(lambda g: g.rect(48, 92, 272, 330, "#FFD060"), 16, 0.5)
        top = bez((48, 150), (48, 90), (272, 90), (272, 150), 20)
        shape = [(48, 330)] + top + [(272, 330)]
        c.poly([(40, 338)] + bez((40, 150), (40, 78), (280, 78), (280, 150), 20) + [(280, 338)], GOLD)
        c.poly([(44, 334)] + bez((44, 150), (44, 84), (276, 84), (276, 150), 20) + [(276, 334)], DGOLD)

        def paint(t):
            t.vgrad(48, 90, 272, 330, "#6FA6DA", "#F7DDB0")
            t.glow(lambda g: g.circ(160, 170, 46, "#FFE07A"), 20, 1.0)
            t.circ(160, 170, 30, "#FFE9A0")
            for k in range(12):
                a = math.radians(k * 30)
                t.line([(160 + 36 * math.cos(a), 170 + 36 * math.sin(a)), (160 + 52 * math.cos(a), 170 + 52 * math.sin(a))], "#FFE07A", 3)
            for x, y, s in ((80, 270, 1.0), (240, 280, 1.1), (160, 300, 1.3), (70, 150, 0.6), (250, 140, 0.6)):
                puff(t, x, y, s, "#FFF8EE", "#E8D2B8")
            for x, flip in ((104, 1), (216, -1)):
                for a, L in ((-150, 44), (-130, 40), (-170, 34)):
                    aa = a if flip > 0 else -180 - a
                    t.poly(leaf(x, 222, aa, L, 14, bend=20 * flip), "#FFFFFF")
                t.poly(leaf(x, 210, 90, 46, 24, fat=0.5), "#E9C7D8" if flip > 0 else "#C9D8F0")
                t.circ(x, 206, 9, "#F0D2B4")
                t.circ(x, 202, 9, None, "#F7C948", 1.5)
            t.alpha(lambda o: [o.line([(x, y), (x + rnd.uniform(-20, 20), y + rnd.uniform(10, 40))], (90, 60, 40, 90), 1) for x, y in ((60, 200), (250, 230), (120, 120), (200, 300), (180, 110))])
            t.alpha(lambda o: [o.poly(blob(rnd, x, y, r, r * 0.7, 0.4, 9), (240, 225, 200, 170)) for x, y, r in ((56, 320, 22), (264, 108, 16), (268, 320, 14))])
        c.clip(lambda m: m.poly(shape, 255), paint)
    elif idx == 4:  # Sculpture de lumière
        gallery_bg(c, rnd, carpet=False)
        c.alpha(lambda o: o.ell(84, 404, 236, 428, (20, 10, 40, 90)))
        c.rect(112, 300, 208, 420, "#EEE8F4")
        c.rect(176, 300, 208, 420, "#D2CAE0")
        c.rect(104, 292, 216, 304, GOLD)
        c.rect(104, 410, 216, 422, GOLD)
        cx, cy = 160, 186
        rings = ((0, "#5FF6FF"), (60, "#FFD36B"), (120, "#FF7EE0"))

        def ring(t, col, wdt):
            t.ell(4, 4, 196, 76, None, col, wdt)
        for ang, col in rings:
            lay_fn = (lambda col: (lambda t: ring(t, col, 10)))(col)
            c.glow(lambda g, ang=ang, lay_fn=lay_fn: g.rotated((200, 80), lay_fn, cx, cy, ang), 8, 1.0)
        for ang, col in rings:
            c.rotated((200, 80), (lambda col: (lambda t: ring(t, hx(col, 0.5, "#FFFFFF"), 3.5)))(col), cx, cy, ang)
        c.glow(lambda g: g.circ(cx, cy, 30, "#FFFFFF"), 16, 1.2)
        c.circ(cx, cy, 16, "#FFFFFF")
        c.line([(cx, cy + 20), (cx, 292)], "#E6D8FF", 2)
        for _ in range(16):
            a, d = rnd.uniform(0, 6.3), rnd.uniform(40, 110)
            c.circ(cx + d * math.cos(a), cy + d * math.sin(a) * 0.8, rnd.uniform(1, 2.2), rnd.choice(("#5FF6FF", "#FFD36B", "#FF9AE8")))
    elif idx == 5:  # Tapisserie royale
        gallery_bg(c, rnd, carpet=False, spots=(110, 210))
        c.alpha(lambda o: o.rect(78, 82, 252, 366, (0, 0, 0, 80)), blur=6)
        c.rect(70, 76, 250, 352, "#9E1F33")
        c.rect(80, 86, 240, 342, GOLD)
        c.rect(86, 92, 234, 336, "#7A1626")
        for y in range(110, 330, 34):
            for x in range(104, 230, 34):
                if abs(x - 160) > 40 or abs(y - 214) > 60:
                    c.poly([(x, y - 5), (x + 5, y), (x, y + 5), (x - 5, y)], hx(GOLD, 0.3))
        c.ell(110, 150, 210, 280, "#9E1F33")
        c.ell(110, 150, 210, 280, None, GOLD, 3)
        c.poly([(130, 236), (130, 190), (144, 210), (152, 176), (160, 204), (168, 176), (176, 210), (190, 190), (190, 236)], GOLD)
        c.rect(128, 230, 192, 244, DGOLD)
        for x in (130, 152, 168, 190):
            c.circ(x, 186 if x in (130, 190) else 174, 4, "#FFF8F0")
        c.poly([(160, 236), (166, 242), (160, 248), (154, 242)], "#4FA3FF")
        for x, y in ((128, 262), (192, 262)):
            c.poly(star_pts(x, y, 8, 3.5), LGOLD)
        for k in range(36):
            x = 72 + k * 5
            c.line([(x, 352), (x, 364)], GOLD, 1.5)
        for x in (70, 250):
            c.line([(x, 352), (x, 372)], GOLD, 2)
            c.poly(leaf(x, 370, 90, 22, 10), GOLD)
        c.alpha(lambda o: [o.rect(x, 76, x + 10, 352, (0, 0, 0, 40)) for x in (104, 150, 196, 232)])
        c.rect(52, 66, 268, 76, GOLD)
        for x in (52, 268):
            c.circ(x, 71, 9, LGOLD)
    elif idx == 6:  # Miroir sans fin
        gallery_bg(c, rnd, carpet=False, columns=True, spots=())
        cx, cy = 160, 210
        c.glow(lambda g: g.circ(cx, cy, 120, "#8A6BFF"), 30, 0.6)

        def rot_rect(w, h, ang):
            a = math.radians(ang)
            ca, sa = math.cos(a), math.sin(a)
            return [(cx + x * ca - y * sa, cy + x * sa + y * ca) for x, y in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]
        for k in range(12):
            s = 0.8 ** k
            ang = k * 7
            w, h = 230 * s, 300 * s
            c.poly(rot_rect(w, h, ang), mix(hex_rgb(GOLD), hex_rgb("#2A1458"), min(1, k * 0.08)))
            c.poly(rot_rect(w - 18 * s, h - 18 * s, ang), mix(hex_rgb("#BFD3EA"), hex_rgb("#3A2470"), min(1, 0.25 + k * 0.08)))
        c.glow(lambda g: g.circ(cx, cy, 16, "#FFFFFF"), 12, 1.3)
        c.circ(cx, cy, 6, "#FFFFFF")
        c.alpha(lambda o: o.poly(rot_rect(190, 260, 0)[:2] + [(cx + 20, cy + 40), (cx - 60, cy + 40)], (255, 255, 255, 30)))
    elif idx == 7:  # La Muse
        gallery_bg(c, rnd, spots=(160,))
        cx = 160
        c.glow(lambda g: g.circ(cx, 150, 46, "#FFE07A"), 20, 0.8)
        c.circ(cx, 150, 40, None, "#FFE9A0", 2)
        for a, L, w in ((80, 200, 70), (95, 196, 74), (110, 180, 60), (70, 170, 50)):
            c.alpha(lambda o, a=a, L=L, w=w: o.poly(leaf(cx, 196, a, L, w, bend=10, fat=0.5), (242, 236, 255, 225)))
        c.alpha(lambda o: o.poly(leaf(cx + 4, 200, 92, 160, 40, bend=12, fat=0.5), (210, 196, 250, 160)))
        c.poly([(146, 180), (174, 180), (170, 236), (150, 236)], "#F2EEFF")
        for a, L in ((20, 120), (35, 110), (8, 100)):
            c.poly(leaf(cx + 6, 140, a, L, 22, bend=60, fat=0.6), "#3A2470")
        c.alpha(lambda o: [o.circ(cx + 30 + k * 9, 150 + k * 10 + (k % 2) * 8, 1.4, (255, 240, 200, 255)) for k in range(10)])
        c.rect(154, 160, 166, 182, "#F4E2D0")
        c.ell(141, 128, 179, 170, "#F4E2D0")
        c.pie(139, 124, 181, 158, 180, 360, "#3A2470")
        for k in range(9):
            a = math.radians(-200 + k * 25)
            c.poly(leaf(cx + 21 * math.cos(a), 146 + 18 * math.sin(a), math.degrees(a) + 60, 12, 6), GOLD)
        for dx in (-8, 8):
            c.arc(cx + dx - 4, 146, cx + dx + 4, 152, 20, 160, "#5A3A50", 1.5)
        c.line([(150, 196), (190, 232)], "#F4E2D0", 7, True)
        c.arc(184, 200, 236, 270, 120, 420, GOLD, 6)
        c.line([(188, 214), (232, 214)], GOLD, 4)
        for k in range(5):
            c.line([(194 + k * 8, 214), (196 + k * 7, 262)], "#FFF2C0", 1)
        c.circ(210, 268, 6, GOLD)
        for x, y, r in ((100, 120, 9), (220, 120, 8), (118, 290, 7), (212, 300, 8)):
            sparkle(c, x, y, r, "#FFF6D0")
    else:  # Le Grand Portrait (boss final)
        gallery_bg(c, rnd, carpet=True, columns=False, spots=(110, 210))
        c.glow(lambda g: g.rect(40, 56, 280, 392, "#B04BFF"), 26, 0.9)
        crest = [(110, 64), (122, 34), (140, 52), (160, 22), (180, 52), (198, 34), (210, 64)]
        c.poly(crest, GOLD)
        c.poly([(140, 52), (160, 22), (160, 64), (130, 64)], LGOLD)
        for x, y in ((122, 34), (160, 22), (198, 34)):
            c.circ(x, y, 5, "#E5484D")
        x0, y0, x1, y1 = ornate_frame(c, 40, 60, 280, 392, 20, "#0A0618")
        cx, cy = 160, 200

        def cosmos(t):
            t.vgrad(x0, y0, x1, y1, "#140A30", "#05030E")
            for _ in range(35):
                t.circ(rnd.uniform(x0, x1), rnd.uniform(y0, y1), rnd.choice((0.6, 0.9, 1.2)), "#E6D8FF")
            lay = t.layer("RGBA")
            for li, col in enumerate(((90, 40, 170, 255), (160, 70, 220, 255), (230, 140, 255, 255), (255, 230, 255, 255))):
                for k in range(4):
                    a = k * 90 + li * 16
                    r0 = 14 + li * 3
                    lay.poly(leaf(cx + r0 * math.cos(math.radians(a)), cy + r0 * math.sin(math.radians(a)), a + 75, 150 - li * 26, 50 - li * 9, bend=140, fat=0.7), col)
            im = lay.img.filter(ImageFilter.GaussianBlur(2.5 * SS))
            t._reset(Image.alpha_composite(t.img.convert("RGBA"), im).convert("RGB"))
            t.glow(lambda g: g.circ(cx, cy, 34, "#FFE6FF"), 18, 1.2)
            t.ell(cx - 96, cy + 70, cx + 96, cy + 220, "#07040F")
            t.rect(cx - 16, cy + 30, cx + 16, cy + 90, "#07040F")
            t.ell(cx - 34, cy - 40, cx + 34, cy + 46, "#07040F")
            t.poly([(cx - 36, cy - 30), (cx - 40, cy - 70), (cx - 20, cy - 50), (cx, cy - 80), (cx + 20, cy - 50), (cx + 40, cy - 70), (cx + 36, cy - 30)], "#07040F")
            t.glow(lambda g: [g.ell(cx + dx - 10, cy - 6, cx + dx + 10, cy + 6, "#FFD36B") for dx in (-14, 14)], 6, 1.6)
            for dx in (-14, 14):
                t.poly(leaf(cx + dx - 8, cy, 0, 16, 7), "#FFF4C0")
            t.glow(lambda g: [g.circ(x, y, 4, col) for x, y, col in ((cx - 40, cy - 70, "#FF4FA8"), (cx, cy - 80, "#5FF6FF"), (cx + 40, cy - 70, "#FF4FA8"))], 4, 1.4)
        c.clip(lambda m: m.rect(x0, y0, x1, y1, 255), cosmos)
        c.rrect(120, 398, 200, 414, 4, GOLD)
        c.rect(130, 404, 190, 407, DGOLD)


def sanctuary_card(c, rnd, idx):
    """Le sanctuaire de la Divine : lumière céleste, ailes de lumière, couronne."""
    c.vgrad(0, 0, W, H, "#C9782E", "#FFE2A8")
    cx, cy = 160, 200
    c.alpha(lambda o: [o.poly([(cx, cy), (cx + 320 * math.cos(math.radians(a - 5)), cy + 320 * math.sin(math.radians(a - 5))),
                               (cx + 320 * math.cos(math.radians(a + 5)), cy + 320 * math.sin(math.radians(a + 5)))], (255, 236, 180, 70)) for a in range(0, 360, 20)])
    c.glow(lambda g: g.circ(cx, cy, 110, "#FFD27A"), 50, 0.35)
    for side in (-1, 1):
        for row, (L, w, col, edge) in enumerate(((150, 30, "#F7C948", "#C98A1E"), (120, 28, "#FFE08A", "#E0A93A"), (86, 24, "#FFF8E0", "#F2C55A"))):
            for k in range(6):
                a = 160 + k * 17 + row * 5
                aa = a if side < 0 else 180 - a
                f = leaf(cx + side * (20 + row * 4), cy + 4, aa, L - (5 - k) * 10, w, bend=22 * -side, fat=0.6)
                c.poly([(x + 1.5, y + 2) for x, y in f], edge)
                c.poly(f, col)
    for x, y, s in ((50, 380, 1.4), (150, 400, 1.7), (270, 384, 1.5), (100, 420, 1.3), (230, 424, 1.4), (10, 420, 1.2), (310, 420, 1.2)):
        puff(c, x, y, s, "#FFFFFF", "#F7D9A0")
    c.rect(0, 420, W, H, "#FFFFFF")
    c.glow(lambda g: g.circ(cx, cy, 40, "#FFFFFF"), 16, 0.6)
    c.circ(cx, cy - 4, 52, None, "#F7C948", 4)
    c.circ(cx, cy, 30, "#FFFBEA")
    c.poly(star_pts(cx, cy, 26, 9, 8, -90), "#FFE07A")
    c.poly(star_pts(cx, cy, 14, 5, 8, -68), "#FFFFFF")
    crown = [(cx - 30, cy - 70), (cx - 30, cy - 96), (cx - 16, cy - 82), (cx, cy - 106), (cx + 16, cy - 82), (cx + 30, cy - 96), (cx + 30, cy - 70)]
    c.glow(lambda g: g.poly(crown, "#FFD060"), 8, 0.9)
    c.poly(crown, GOLD)
    c.poly([(cx - 30, cy - 70), (cx - 30, cy - 96), (cx - 16, cy - 82), (cx, cy - 106), (cx, cy - 70)], LGOLD)
    c.rrect(cx - 32, cy - 74, cx + 32, cy - 64, 3, DGOLD)
    for x, y in ((cx - 30, cy - 98), (cx, cy - 108), (cx + 30, cy - 98)):
        c.circ(x, y, 4, "#FFFFFF")
    for _ in range(20):
        x, y = rnd.uniform(10, 310), rnd.uniform(20, 360)
        sparkle(c, x, y, rnd.uniform(3, 7), rnd.choice(("#FFFFFF", "#F7C948")))


WORLDS = {
    1: (("#9ED8FF", "#EAF8FF"), parc_card),
    2: (("#8FD3F5", "#FFF1D0"), plage_card),
    3: (("#FFB36B", "#FFE2B8"), marche_card),
    4: (("#B8E3C6", "#F1FAEC"), foret_card),
    5: (("#6EB6F0", "#D8EEFF"), port_card),
    6: (("#7FA7DE", "#E6EEFA"), montagne_card),
    7: (("#3A1220", "#FF7A3D"), volcan_card),
    8: (("#2B2550", "#7E6FC9"), tempete_card),
    9: (("#F7E3A8", "#FFF8E6"), palais_card),
    10: (("#07061A", "#2A1550"), cosmos_card),
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
    21: (("#0D0726", "#2B1559"), galerie_card),
}
CARDS = {21: 9}  # nombre de cartes par monde (4 par défaut)


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
    """Léger grain de papier, reproductible (Image.effect_noise dépend de
    l'ordre des appels, ce qui changerait l'image selon les mondes rendus)."""
    rnd = random.Random(seed)
    data = bytes(max(0, min(255, int(rnd.gauss(128, amount)))) for _ in range(img.width * img.height))
    noise = Image.frombytes("L", img.size, data)
    return Image.blend(img, Image.merge("RGB", (noise, noise, noise)), 0.06 + rnd.random() * 0.02)


def render(arena, idx):
    return draw_scene(arena, idx)


def render_sanctuary():
    """Grande carte de la Divine, posée sur le pont du sanctuaire (assets/bots/sanctuary.jpg)."""
    c = Canvas(gradient(hex_rgb("#FFDFA0"), hex_rgb("#FFF8EA"), w=W * SS, h=H * SS))
    sanctuary_card(c, random.Random(2100), 0)
    return seeded_grain(c.img.resize((W, H), Image.LANCZOS), 20, 2100)


if __name__ == "__main__":
    import os
    import sys

    os.makedirs(OUT, exist_ok=True)
    # Sans argument : tous les mondes et le sanctuaire. Sinon seulement ce qui
    # est donné (ex. `python3 scripts/generate-bot-art.py 11 21 sanctuary`).
    wanted = sys.argv[1:] or [*map(str, WORLDS), "sanctuary"]
    save = dict(quality=80, optimize=True, progressive=True)
    for arg in wanted:
        if arg == "sanctuary":
            render_sanctuary().save(f"{OUT}/sanctuary.jpg", **save)
            continue
        arena = int(arg)
        for idx in range(CARDS.get(arena, 4)):
            render(arena, idx).save(f"{OUT}/a{arena}-{idx}.jpg", **save)
    print("ok")
