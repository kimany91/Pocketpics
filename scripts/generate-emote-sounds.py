"""Sons des emotes de PocketPics (python3 scripts/generate-emote-sounds.py).

Tout est synthétisé, rien sous licence : une « voix » de dessin animé (train
d'impulsions filtré par des formants de voyelles), du bruit filtré, des cloches.
Courts et légers : mono 16 bits, 16 kHz, moins d'une seconde et demie chacun
(de 15 à 40 Ko). Sortie : assets/sfx/emote/<id>.wav
"""
import math
import os
import wave

import numpy as np

SR = 16000
OUT = "assets/sfx/emote"
rng = np.random.default_rng(11)

# Formants (F1, F2, F3) des voyelles, voix de dessin animé.
VOWELS = {
    "a": (800, 1250, 2600),
    "e": (480, 1900, 2600),
    "i": (320, 2300, 3000),
    "o": (520, 900, 2450),
    "u": (360, 780, 2300),
    "eu": (460, 1450, 2400),
}


def t_axis(dur):
    return np.arange(int(SR * dur)) / SR


def noise(n):
    return rng.standard_normal(n)


def biquad(x, kind, f, q=0.7):
    """Filtre RBJ (lp / hp / bp). `f` peut varier dans le temps."""
    f = np.broadcast_to(np.asarray(f, dtype=float), x.shape)
    q = np.broadcast_to(np.asarray(q, dtype=float), x.shape)
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(len(x)):
        w0 = 2 * math.pi * min(max(f[i], 20.0), SR * 0.45) / SR
        c, s = math.cos(w0), math.sin(w0)
        alpha = s / (2 * q[i])
        if kind == "lp":
            b0, b1, b2 = (1 - c) / 2, 1 - c, (1 - c) / 2
        elif kind == "hp":
            b0, b1, b2 = (1 + c) / 2, -(1 + c), (1 + c) / 2
        else:
            b0, b1, b2 = alpha, 0.0, -alpha
        a0, a1, a2 = 1 + alpha, -2 * c, 1 - alpha
        yi = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
        x2, x1, y2, y1 = x1, x[i], y1, yi
        y[i] = yi
    return y


def glottal(f0):
    """Impulsions de la voix : dents de scie à bande limitée qui suivent `f0` (Hz, par échantillon)."""
    phase = 2 * math.pi * np.cumsum(f0) / SR
    out = np.zeros_like(phase)
    top = SR * 0.45
    kmax = int(top / max(np.min(f0), 40))
    for k in range(1, kmax + 1):
        a = (1.0 / k) * (k * f0 < top)
        out += a * np.sin(k * phase)
    return out


def track(points, n):
    """Courbe par morceaux : [(t, valeur), …] → un tableau de `n` échantillons."""
    ts = [p[0] for p in points]
    vs = [p[1] for p in points]
    return np.interp(np.arange(n) / SR, ts, vs)


def voice(dur, f0, vowels, amp, breath=0.15, rough=0.0, jitter=0.01):
    """Voix : f0 [(t, Hz)], voyelles [(t, 'a')], amplitude [(t, 0..1)]."""
    n = int(SR * dur)
    f = track(f0, n)
    f = f * (1 + jitter * biquad(noise(n), "lp", 30) * 3)
    if rough:
        # voix éraillée : l'amplitude tremble vite (grognement, rage)
        f = f * (1 + rough * 0.08 * np.sin(2 * math.pi * 31 * np.arange(n) / SR))
    src = glottal(f)
    src += breath * noise(n) * 0.6
    out = np.zeros(n)
    for k, gain, q in ((0, 1.0, 5), (1, 0.6, 9), (2, 0.25, 12)):
        pts = [(t, VOWELS[v][k]) for t, v in vowels]
        out += gain * biquad(src, "bp", track(pts, n), q)
    env = track(amp, n)
    if rough:
        env = env * (1 - rough * 0.5 * (0.5 + 0.5 * np.sin(2 * math.pi * 33 * np.arange(n) / SR)))
    return out * env


def bell(freq, dur, amp=1.0, bright=1.0):
    t = t_axis(dur)
    s = np.zeros_like(t)
    for ratio, a, d in ((1, 1, 1), (2.0, 0.5 * bright, 0.6), (3.01, 0.28 * bright, 0.4), (4.17, 0.15 * bright, 0.28)):
        if freq * ratio < SR * 0.45:
            s += a * np.sin(2 * math.pi * freq * ratio * t) * np.exp(-t * 4.5 / (dur * d))
    return amp * s * np.clip(t / 0.002, 0, 1)


def place(buf, sig, at):
    i = int(SR * at)
    n = min(len(sig), len(buf) - i)
    if n > 0:
        buf[i:i + n] += sig[:n]
    return buf


def burst(dur, kind, f, q=0.7, decay=20.0, attack=0.002):
    t = t_axis(dur)
    e = np.clip(t / attack, 0, 1) * np.exp(-t * decay)
    return biquad(noise(len(t)), kind, f, q) * e


def finish(x, dur, peak=0.85):
    n = int(SR * dur)
    x = x[:n] if len(x) >= n else np.concatenate([x, np.zeros(n - len(x))])
    x = x - np.mean(x)
    fade = int(SR * 0.03)
    x[-fade:] *= np.linspace(1, 0, fade)
    x[: int(SR * 0.004)] *= np.linspace(0, 1, int(SR * 0.004))
    m = np.max(np.abs(x)) or 1
    return np.tanh(x / m * 1.15) / math.tanh(1.15) * peak


def save(name, x):
    os.makedirs(OUT, exist_ok=True)
    data = (np.clip(x, -1, 1) * 32767).astype("<i2").tobytes()
    path = os.path.join(OUT, f"{name}.wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data)
    print(f"{path} : {os.path.getsize(path) // 1024} Ko")


def syllables(starts, length, peak=1.0, shape=0.25):
    """Enveloppe de syllabes (« ha ha ha ») : [(t, amp), …]."""
    pts = [(0, 0)]
    for i, s in enumerate(starts):
        a = peak * (1 - 0.06 * i)
        pts += [(s, 0), (s + length * shape, a), (s + length * 0.8, a * 0.5), (s + length, 0)]
    return pts


# ------------------------------------------------------------------ émotions


def make_lol():
    """Pleure de rire : « ha ha ha ha ha » qui part en fou rire, puis un souffle."""
    dur = 1.15
    starts = [0.02 + i * 0.145 for i in range(7)]
    f0 = [(0, 360), (0.3, 330), (0.7, 300), (1.0, 270), (1.1, 250)]
    v = voice(dur, f0, [(0, "a"), (1.2, "a")], syllables(starts, 0.12), breath=0.35)
    # le « h » de chaque syllabe
    for s in starts:
        place(v, burst(0.05, "bp", 1800, 1.2, 40) * 0.25, s)
    place(v, burst(0.25, "bp", 1500, 0.8, 9) * 0.25, 1.03)
    return finish(v, dur)


def make_cry():
    """Pleure : « ouiiinnn » qui tremble, puis deux hoquets de sanglot."""
    dur = 1.2
    f0 = [(0, 420), (0.25, 520), (0.7, 470), (0.85, 380)]
    n = int(SR * dur)
    v = voice(0.9, f0, [(0, "u"), (0.15, "a"), (0.6, "eu"), (0.85, "u")], [(0, 0), (0.08, 0.9), (0.7, 0.8), (0.88, 0)], breath=0.3)
    # vibrato de sanglot : l'amplitude ondule
    vib = 1 - 0.45 * (0.5 + 0.5 * np.sin(2 * math.pi * 7 * np.arange(len(v)) / SR))
    buf = np.zeros(n)
    place(buf, v * vib, 0)
    for at in (0.92, 1.06):
        place(buf, voice(0.1, [(0, 360), (0.1, 300)], [(0, "u"), (0.1, "u")], [(0, 0), (0.02, 0.7), (0.1, 0)], breath=0.6), at)
    return finish(buf, dur)


def make_angry():
    """Rage : grognement « grrr » qui monte, un « RAH ! », et la vapeur qui siffle."""
    dur = 1.15
    buf = np.zeros(int(SR * dur))
    g = voice(0.55, [(0, 95), (0.55, 120)], [(0, "eu"), (0.55, "o")], [(0, 0), (0.1, 0.6), (0.5, 0.8), (0.55, 0.5)], breath=0.2, rough=1.0)
    place(buf, g, 0)
    rah = voice(0.32, [(0, 170), (0.1, 210), (0.32, 150)], [(0, "a"), (0.32, "a")], [(0, 0), (0.03, 1), (0.25, 0.8), (0.32, 0)], breath=0.4, rough=0.7)
    place(buf, rah * 1.2, 0.52)
    t = t_axis(0.42)
    hiss = biquad(noise(len(t)), "hp", 3800, 0.7) * np.clip(t / 0.05, 0, 1) * np.exp(-t * 5)
    place(buf, hiss * 0.35, 0.72)
    return finish(buf, dur)


def make_puke():
    """Vomit : haut-le-cœur « heuk », puis « bleuaaargh » qui gargouille, et le flop."""
    dur = 1.25
    buf = np.zeros(int(SR * dur))
    place(buf, voice(0.13, [(0, 230), (0.13, 180)], [(0, "eu"), (0.13, "u")], [(0, 0), (0.02, 0.8), (0.13, 0)], breath=0.6), 0.0)
    place(buf, voice(0.13, [(0, 240), (0.13, 190)], [(0, "eu"), (0.13, "u")], [(0, 0), (0.02, 0.9), (0.13, 0)], breath=0.6), 0.2)
    n = int(SR * 0.62)
    gurgle = voice(0.62, [(0, 120), (0.3, 95), (0.62, 80)], [(0, "eu"), (0.1, "a"), (0.62, "o")], [(0, 0), (0.05, 1), (0.5, 0.8), (0.62, 0)], breath=0.5, rough=1.0)
    gurgle *= 1 - 0.6 * (0.5 + 0.5 * np.sin(2 * math.pi * 14 * np.arange(n) / SR))
    place(buf, gurgle, 0.4)
    # bruit liquide
    place(buf, burst(0.6, "bp", track([(0, 700), (0.6, 300)], int(SR * 0.6)), 1.5, 4) * 0.4, 0.45)
    place(buf, burst(0.25, "lp", 500, 0.9, 14) * 0.9, 1.0)
    return finish(buf, dur)


def make_disgust():
    """Dégoûté : « beuuurk » qui descend, et une langue tirée (« blblbl »)."""
    dur = 1.2
    buf = np.zeros(int(SR * dur))
    place(buf, voice(0.6, [(0, 230), (0.6, 160)], [(0, "e"), (0.15, "eu"), (0.6, "u")], [(0, 0), (0.06, 0.9), (0.45, 0.7), (0.6, 0)], breath=0.3), 0)
    # « blblbl » : un bourdon grave qui claque vite
    n = int(SR * 0.45)
    t = np.arange(n) / SR
    buzz = glottal(np.full(n, 75.0)) * (0.5 + 0.5 * np.sign(np.sin(2 * math.pi * 22 * t)))
    buzz = biquad(buzz, "lp", 900, 0.9) * np.clip(t / 0.03, 0, 1) * np.clip((0.45 - t) / 0.1, 0, 1)
    place(buf, buzz * 1.4, 0.68)
    return finish(buf, dur)


def make_scared():
    """Peur : un cri aigu « aaaah ! » qui tremble."""
    dur = 1.1
    f0 = [(0, 650), (0.12, 880), (0.7, 820), (0.95, 700)]
    v = voice(1.0, f0, [(0, "a"), (0.6, "a"), (1.0, "eu")], [(0, 0), (0.05, 1), (0.75, 0.85), (1.0, 0)], breath=0.35, jitter=0.03)
    n = len(v)
    v *= 1 - 0.35 * (0.5 + 0.5 * np.sin(2 * math.pi * 11 * np.arange(n) / SR))
    return finish(v, dur, peak=0.8)


def make_shock():
    """Choqué : on aspire d'un coup (« hhh ! »), puis « oh ! » et un petit « boïng »."""
    dur = 1.0
    buf = np.zeros(int(SR * dur))
    n = int(SR * 0.22)
    t = np.arange(n) / SR
    gasp = biquad(noise(n), "bp", 900 + 2200 * t / 0.22, 2.2) * np.clip(t / 0.15, 0, 1) * np.clip((0.22 - t) / 0.03, 0, 1)
    place(buf, gasp * 0.9, 0)
    place(buf, voice(0.3, [(0, 260), (0.12, 340), (0.3, 300)], [(0, "o"), (0.3, "o")], [(0, 0), (0.03, 1), (0.22, 0.6), (0.3, 0)], breath=0.3), 0.26)
    m = int(SR * 0.4)
    tt = np.arange(m) / SR
    boing = np.sin(2 * math.pi * np.cumsum(260 + 120 * np.sin(2 * math.pi * 9 * tt) * np.exp(-tt * 5)) / SR) * np.exp(-tt * 7)
    place(buf, boing * 0.45, 0.58)
    return finish(buf, dur)


def make_sleep():
    """Dodo : un ronflement qui gronde, puis le sifflet du souffle."""
    dur = 1.25
    buf = np.zeros(int(SR * dur))
    n = int(SR * 0.75)
    t = np.arange(n) / SR
    rumble = biquad(noise(n), "lp", 380, 1.2) * (0.5 + 0.5 * np.sign(np.sin(2 * math.pi * 38 * t)))
    rumble += glottal(np.full(n, 70.0)) * 0.25
    rumble = biquad(rumble, "lp", 700, 0.8) * np.sin(math.pi * t / 0.75) ** 0.7
    place(buf, rumble * 1.5, 0)
    m = int(SR * 0.55)
    tt = np.arange(m) / SR
    whistle = np.sin(2 * math.pi * np.cumsum(1300 + 500 * tt / 0.55) / SR) * np.sin(math.pi * tt / 0.55) * 0.35
    whistle += biquad(noise(m), "bp", 1500, 1.5) * np.sin(math.pi * tt / 0.55) * 0.4
    place(buf, whistle, 0.7)
    return finish(buf, dur, peak=0.75)


def make_love():
    """Amoureux : un bisou « mwah ! » et une pluie de petites cloches qui montent."""
    dur = 1.15
    buf = np.zeros(int(SR * dur))
    place(buf, burst(0.03, "bp", 1200, 2, 120) * 0.7, 0.0)
    place(buf, voice(0.28, [(0, 300), (0.1, 360), (0.28, 320)], [(0, "u"), (0.07, "a"), (0.28, "a")], [(0, 0), (0.04, 1), (0.18, 0.6), (0.28, 0)], breath=0.35), 0.03)
    place(buf, burst(0.02, "hp", 2500, 1, 150) * 0.5, 0.31)
    for i, f in enumerate((1047, 1319, 1568, 2093)):
        place(buf, bell(f, 0.5, 0.35, bright=0.5), 0.42 + i * 0.1)
    return finish(buf, dur, peak=0.8)


def make_cool():
    """Trop fort : les lunettes glissent (« fffft »), puis « ting ! » qui brille."""
    dur = 1.1
    buf = np.zeros(int(SR * dur))
    n = int(SR * 0.3)
    t = np.arange(n) / SR
    swoosh = biquad(noise(n), "bp", 600 + 3200 * (t / 0.3) ** 2, 1.4) * np.sin(math.pi * t / 0.3)
    place(buf, swoosh * 0.8, 0.0)
    place(buf, burst(0.04, "bp", 900, 1.5, 60) * 0.6, 0.3)
    place(buf, bell(2637, 0.7, 0.55, bright=0.6), 0.36)
    place(buf, bell(3951, 0.6, 0.3, bright=0.4), 0.4)
    place(buf, voice(0.32, [(0, 150), (0.12, 190), (0.32, 140)], [(0, "e"), (0.12, "a"), (0.32, "a")], [(0, 0), (0.05, 0.8), (0.25, 0.6), (0.32, 0)], breath=0.3), 0.55)
    return finish(buf, dur)


# ------------------------------------------------------------------ photo


def make_selfie():
    """Selfie : le flash se charge (sifflement qui monte), puis « clic-clac »."""
    dur = 0.9
    buf = np.zeros(int(SR * dur))
    n = int(SR * 0.32)
    t = np.arange(n) / SR
    whine = np.sin(2 * math.pi * np.cumsum(2200 + 3200 * t / 0.32) / SR) * (t / 0.32) * 0.18
    place(buf, whine, 0)
    for at, f, a in ((0.34, 3200, 1.0), (0.42, 1700, 0.8)):
        place(buf, burst(0.05, "bp", f, 3, 90) * a, at)
        place(buf, burst(0.02, "hp", 5000, 0.8, 200) * 0.6 * a, at)
    place(buf, burst(0.3, "hp", 4000, 0.7, 12) * 0.12, 0.34)
    return finish(buf, dur, peak=0.8)


def reed(freq, dur, amp=1.0):
    """Anche d'accordéon : deux dents de scie un peu désaccordées, avec du tremolo."""
    t = t_axis(dur)
    s = np.zeros_like(t)
    for det in (-0.004, 0.004):
        f = np.full(len(t), freq * (1 + det))
        s += glottal(f)
    s = biquad(s, "lp", 2400, 0.8)
    env = np.clip(t / 0.02, 0, 1) * np.clip((dur - t) / 0.05, 0, 1) * (1 + 0.15 * np.sin(2 * math.pi * 6 * t))
    return amp * s * env


def make_eiffel():
    """Tour Eiffel : un petit air d'accordéon (de la composition du jeu) et des étincelles."""
    dur = 1.35
    buf = np.zeros(int(SR * dur))
    # sol, do, mi, ré, do (+ accord) : valse en 3 temps
    notes = ((392, 0.0, 0.2), (523, 0.2, 0.2), (659, 0.4, 0.32), (587, 0.72, 0.16), (523, 0.88, 0.45))
    for f, at, d in notes:
        place(buf, reed(f, d, 0.5), at)
    for f, at in ((131, 0.0), (196, 0.4), (262, 0.88)):
        place(buf, reed(f, 0.35, 0.25), at)
    for i in range(6):
        place(buf, bell(rng.uniform(2600, 4200), 0.3, 0.12, bright=0.3), 0.9 + i * 0.07)
    return finish(buf, dur, peak=0.8)


def make_dog():
    """Léchouille : « ouaf ! », puis une langue qui lape (« slurp slurp »)."""
    dur = 1.2
    buf = np.zeros(int(SR * dur))
    woof = voice(0.2, [(0, 420), (0.05, 380), (0.2, 220)], [(0, "u"), (0.05, "a"), (0.2, "o")], [(0, 0), (0.015, 1), (0.1, 0.7), (0.2, 0)], breath=0.7, rough=0.6)
    place(buf, woof * 1.2, 0.0)
    for at in (0.42, 0.72, 0.98):
        n = int(SR * 0.2)
        t = np.arange(n) / SR
        slurp = biquad(noise(n), "bp", 500 + 1800 * t / 0.2, 4) * np.sin(math.pi * t / 0.2) * (0.6 + 0.4 * np.sin(2 * math.pi * 40 * t))
        place(buf, slurp * 0.9, at)
        place(buf, burst(0.02, "bp", 2400, 4, 160) * 0.4, at + 0.17)
    return finish(buf, dur)


def make_cat():
    """Miaou : « mi-a-ou » qui monte puis redescend."""
    dur = 0.95
    v = voice(0.85, [(0, 560), (0.25, 820), (0.6, 700), (0.85, 520)], [(0, "i"), (0.2, "e"), (0.4, "a"), (0.7, "u")], [(0, 0), (0.08, 0.8), (0.5, 1), (0.85, 0)], breath=0.25, jitter=0.02)
    buf = np.zeros(int(SR * dur))
    place(buf, v, 0.04)
    return finish(buf, dur, peak=0.8)


def make_mirror():
    """Miroir : un éclat de verre très doux, puis une cascade d'étincelles qui monte."""
    dur = 1.2
    buf = np.zeros(int(SR * dur))
    place(buf, burst(0.25, "hp", 5200, 0.8, 16) * 0.2, 0.0)
    scale = (1568, 1760, 2093, 2349, 2637, 3136, 3520, 4186)
    for i, f in enumerate(scale):
        place(buf, bell(f, 0.45, 0.3, bright=0.5), 0.05 + i * 0.07)
    for i in range(8):
        place(buf, bell(rng.uniform(3000, 5500), 0.25, 0.1, bright=0.2), 0.6 + rng.uniform(0, 0.45))
    return finish(buf, dur, peak=0.75)


SOUNDS = (
    ("lol", make_lol),
    ("cry", make_cry),
    ("angry", make_angry),
    ("puke", make_puke),
    ("disgust", make_disgust),
    ("scared", make_scared),
    ("shock", make_shock),
    ("sleep", make_sleep),
    ("love", make_love),
    ("cool", make_cool),
    ("selfie", make_selfie),
    ("eiffel", make_eiffel),
    ("dog", make_dog),
    ("cat", make_cat),
    ("mirror", make_mirror),
)


if __name__ == "__main__":
    import sys

    only = set(sys.argv[1:])
    for name, fn in SOUNDS:
        if not only or name in only:
            save(name, fn())
