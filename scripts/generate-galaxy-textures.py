"""
Textures de la carte Galaxy (assets/fx) :
  - galaxy.jpg       : fond d'espace (nébuleuses violet/magenta/cyan, bras spiraux, étoiles) ;
  - galaxy-swirl.png : bras spiraux lumineux sur fond transparent (tourne lentement sur la carte) ;
  - galaxy-stars.png : semis d'étoiles transparent, en mosaïque (dérive sur le cadre).

Usage : python3 scripts/generate-galaxy-textures.py
Déterministe (graine fixe) : relancer donne les mêmes fichiers.
"""
import math
import os

import numpy as np
from PIL import Image, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'fx')
rng = np.random.default_rng(130)


def fractal_noise(h, w, octaves=5, base=4):
    """Bruit de valeur multi-échelle, 0..1."""
    acc = np.zeros((h, w), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        n = base * 2 ** o
        small = rng.random((n + 1, int(n * w / h) + 1)).astype(np.float32)
        img = Image.fromarray((small * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        acc += amp * np.asarray(img, np.float32) / 255
        total += amp
        amp *= 0.55
    acc /= total
    return (acc - acc.min()) / (acc.max() - acc.min())


def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255


def spiral_field(h, w, cx, cy, arms=2, twist=3.2, spread=0.32, scale=1.0):
    """Intensité de bras spiraux logarithmiques centrés en (cx, cy)."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    dx, dy = (x - cx) / (w * scale), (y - cy) / (w * scale)
    r = np.sqrt(dx * dx + dy * dy) + 1e-4
    th = np.arctan2(dy, dx)
    phase = arms * (th - twist * np.log(r))
    arm = (np.cos(phase) * 0.5 + 0.5) ** 6
    fall = np.exp(-r / spread)
    core = np.exp(-(r / 0.06) ** 2)
    return arm * fall, core


def galaxy_background(w=420, h=588):
    img = np.zeros((h, w, 3), np.float32)
    # fond : indigo profond vers presque noir
    t = np.linspace(0, 1, h)[:, None]
    img += (hexrgb('#140A3A') * (1 - t[..., None]) + hexrgb('#05031A') * t[..., None])
    # nébuleuses colorées
    for color, gain, oct_base in [('#7A2CFF', 0.7, 3), ('#FF3FB4', 0.5, 4), ('#2EC8FF', 0.42, 3), ('#3A4BFF', 0.4, 2)]:
        n = fractal_noise(h, w, 5, oct_base)
        mask = np.clip((n - 0.47) * 2.6, 0, 1) ** 1.8
        img += mask[..., None] * hexrgb(color) * gain
    # bras spiraux de la galaxie, légèrement décentrés
    arm, core = spiral_field(h, w, w * 0.52, h * 0.47, twist=2.6, spread=0.36)
    dust = fractal_noise(h, w, 4, 8)
    arm = arm * (0.55 + dust * 0.8)
    img += arm[..., None] * (hexrgb('#D2B4FF') * 1.0 + hexrgb('#7FE6FF') * 0.4)
    img += core[..., None] * hexrgb('#FFF1FB') * 1.4
    img = np.asarray(Image.fromarray(np.clip(img * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6)), np.float32) / 255
    # étoiles
    for _ in range(700):
        x, y = rng.integers(0, w), rng.integers(0, h)
        b = rng.random() ** 3
        tint = [hexrgb('#FFFFFF'), hexrgb('#CFE6FF'), hexrgb('#FFD6F2')][rng.integers(0, 3)]
        img[y, x] = np.clip(img[y, x] + tint * (0.35 + b * 0.9), 0, 1)
        if b > 0.55:
            for d in (1, 2):
                for (ax, ay) in ((d, 0), (-d, 0), (0, d), (0, -d)):
                    yy, xx = y + ay, x + ax
                    if 0 <= yy < h and 0 <= xx < w:
                        img[yy, xx] = np.clip(img[yy, xx] + tint * (0.5 / d) * b, 0, 1)
    Image.fromarray((img * 255).astype(np.uint8)).save(os.path.join(OUT, 'galaxy.jpg'), quality=80, optimize=True, progressive=True)


def swirl(size=256):
    arm, core = spiral_field(size, size, size / 2, size / 2, arms=3, twist=2.6, spread=0.3, scale=1.0)
    dust = fractal_noise(size, size, 4, 6)
    a = np.clip(arm * (0.5 + dust) * 1.5 + core * 1.2, 0, 1)
    y, x = np.mgrid[0:size, 0:size]
    r = np.sqrt((x - size / 2) ** 2 + (y - size / 2) ** 2) / (size / 2)
    a *= np.clip((1 - r) * 2.2, 0, 1)  # bords transparents
    rgb = hexrgb('#E9D9FF')[None, None, :] * (1 - r[..., None] * 0.6) + hexrgb('#8FE8FF')[None, None, :] * (r[..., None] * 0.6)
    rgba = np.dstack([np.clip(rgb, 0, 1), a]) * 255
    im = Image.fromarray(rgba.astype(np.uint8), 'RGBA').filter(ImageFilter.GaussianBlur(1.2))
    im.save(os.path.join(OUT, 'galaxy-swirl.png'), optimize=True)


def stars(size=256):
    im = np.zeros((size, size, 4), np.float32)
    for _ in range(70):
        x, y = rng.integers(2, size - 2), rng.integers(2, size - 2)
        b = 0.35 + rng.random() ** 2 * 0.65
        im[y, x] = [1, 1, 1, b]
        if b > 0.7:
            for (ax, ay) in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                im[y + ay, x + ax] = [1, 0.95, 1, b * 0.55]
    Image.fromarray((im * 255).astype(np.uint8), 'RGBA').quantize(16, method=Image.FASTOCTREE).save(os.path.join(OUT, 'galaxy-stars.png'), optimize=True)


if __name__ == '__main__':
    galaxy_background()
    swirl()
    stars()
    for f in ('galaxy.jpg', 'galaxy-swirl.png', 'galaxy-stars.png'):
        print(f, os.path.getsize(os.path.join(OUT, f)), 'octets')
