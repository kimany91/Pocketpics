"""Génère les textures d'effets et les icônes de PocketPics (python3 scripts/generate-assets.py)."""
import math
from PIL import Image, ImageDraw, ImageFilter

OUT = "assets"


def radial_glow(size=256):
    img = Image.new("L", (size, size), 0)
    px = img.load()
    c = size / 2
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - c + 0.5, y - c + 0.5) / c
            v = max(0.0, 1.0 - d)
            px[x, y] = int(255 * (v ** 2.2))
    out = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    out.putalpha(img)
    return out


def sparkle(size=128):
    s = size * 4
    img = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(img)
    c = s / 2
    pts = []
    for i in range(8):
        a = math.pi / 4 * i - math.pi / 2
        r = c * 0.98 if i % 2 == 0 else c * 0.13
        pts.append((c + r * math.cos(a), c + r * math.sin(a)))
    d.polygon(pts, fill=255)
    img = img.filter(ImageFilter.GaussianBlur(s * 0.006)).resize((size, size), Image.LANCZOS)
    core = radial_glow(size).getchannel("A")
    alpha = Image.eval(Image.merge("RGB", (img, core, core)).convert("L"), lambda v: v)
    alpha = Image.composite(img, core, img)
    out = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    out.putalpha(Image.eval(Image.blend(alpha, img, 0.5), lambda v: min(255, int(v * 1.6))))
    return out


def rays(size=512, count=18):
    s = size * 2
    img = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(img)
    c = s / 2
    for i in range(count):
        a = 2 * math.pi * i / count
        w = math.pi / count * 0.55
        d.polygon([(c, c), (c + s * math.cos(a - w), c + s * math.sin(a - w)), (c + s * math.cos(a + w), c + s * math.sin(a + w))], fill=255)
    img = img.filter(ImageFilter.GaussianBlur(s * 0.01))
    fade = Image.new("L", (s, s), 0)
    fp = fade.load()
    for y in range(s):
        for x in range(s):
            r = math.hypot(x - c, y - c) / c
            fp[x, y] = int(255 * max(0.0, 1 - r) ** 1.4)
    alpha = Image.composite(img, Image.new("L", (s, s), 0), fade).resize((size, size), Image.LANCZOS)
    alpha = Image.eval(alpha, lambda v: v)
    from PIL import ImageChops
    alpha = ImageChops.multiply(img, fade).resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    out.putalpha(alpha)
    return out


def hue(t):
    import colorsys
    r, g, b = colorsys.hsv_to_rgb(t % 1.0, 0.55, 1.0)
    return int(r * 255), int(g * 255), int(b * 255)


def card_mark(size, bg=(9, 9, 11, 255), transparent=False, mono=False):
    s = size * 2
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0) if transparent else bg)
    cw, ch = s * 0.40, s * 0.56
    card = Image.new("RGBA", (int(cw), int(ch)), (0, 0, 0, 0))
    # bord chromatique
    grad = Image.new("RGBA", card.size)
    gp = grad.load()
    for y in range(card.size[1]):
        for x in range(card.size[0]):
            t = (x / card.size[0] * 0.6 + y / card.size[1] * 0.4)
            gp[x, y] = (255, 255, 255, 255) if mono else hue(t * 0.9 + 0.05) + (255,)
    mask = Image.new("L", card.size, 0)
    md = ImageDraw.Draw(mask)
    rad = int(cw * 0.12)
    md.rounded_rectangle([0, 0, card.size[0] - 1, card.size[1] - 1], radius=rad, fill=255)
    card.paste(grad, (0, 0), mask)
    inner = ImageDraw.Draw(card)
    b = int(cw * 0.075)
    inner.rounded_rectangle([b, b, card.size[0] - 1 - b, card.size[1] - 1 - b], radius=int(rad * 0.7), fill=(0, 0, 0, 0) if mono else (20, 20, 24, 255))
    if not mono:
        # petite "photo" stylisée : soleil + montagne
        iw, ih = card.size[0] - 2 * b, card.size[1] - 2 * b
        ph = Image.new("RGBA", (iw, ih))
        pp = ph.load()
        for y in range(ih):
            for x in range(iw):
                k = y / ih
                pp[x, y] = (int(30 + 40 * k), int(26 + 20 * k), int(52 + 30 * (1 - k)), 255)
        pd = ImageDraw.Draw(ph)
        pd.ellipse([iw * 0.55, ih * 0.18, iw * 0.85, ih * 0.18 + iw * 0.30], fill=(255, 214, 120, 255))
        pd.polygon([(0, ih), (iw * 0.38, ih * 0.52), (iw * 0.62, ih * 0.78), (iw * 0.78, ih * 0.62), (iw, ih * 0.9), (iw, ih)], fill=(242, 238, 230, 255))
        pm = Image.new("L", (iw, ih), 0)
        ImageDraw.Draw(pm).rounded_rectangle([0, 0, iw - 1, ih - 1], radius=int(rad * 0.7), fill=255)
        card.paste(ph, (b, b), pm)
    card = card.rotate(-8, resample=Image.BICUBIC, expand=True)
    if not mono and not transparent:
        glow = radial_glow(int(s * 0.9)).resize((int(s * 0.9), int(s * 0.9)))
        tint = Image.new("RGBA", glow.size, (190, 150, 255, 0))
        tint.putalpha(Image.eval(glow.getchannel("A"), lambda v: int(v * 0.35)))
        img.alpha_composite(tint, (int(s * 0.05), int(s * 0.05)))
    img.alpha_composite(card, (int((s - card.size[0]) / 2), int((s - card.size[1]) / 2)))
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    radial_glow().save(f"{OUT}/fx/glow.png")
    sparkle().save(f"{OUT}/fx/sparkle.png")
    rays().save(f"{OUT}/fx/rays.png")
    card_mark(1024).save(f"{OUT}/icon.png")
    card_mark(1024, transparent=True).save(f"{OUT}/splash-icon.png")
    card_mark(1024, transparent=True).save(f"{OUT}/android-icon-foreground.png")
    Image.new("RGBA", (1024, 1024), (9, 9, 11, 255)).save(f"{OUT}/android-icon-background.png")
    card_mark(1024, transparent=True, mono=True).save(f"{OUT}/android-icon-monochrome.png")
    card_mark(48).save(f"{OUT}/favicon.png")
    print("ok")
