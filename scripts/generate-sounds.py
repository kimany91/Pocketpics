"""Synthèse des effets sonores de PocketPics (python3 scripts/generate-sounds.py).

Tout est généré : pas de fichier audio sous licence. Mono 16 bits, 32 kHz.
"""
import math
import wave

import numpy as np

SR = 32000
OUT = "assets/sfx"
rng = np.random.default_rng(7)


def t_axis(dur):
    return np.arange(int(SR * dur)) / SR


def env(n, a=0.005, d=0.3, curve=4.0):
    """Attaque linéaire puis décroissance exponentielle."""
    t = np.arange(n) / SR
    att = np.clip(t / max(a, 1e-4), 0, 1)
    dec = np.exp(-np.maximum(t - a, 0) * curve / max(d, 1e-4))
    return att * dec


def biquad(x, kind, f, q=0.7):
    """Filtre RBJ (lowpass / highpass / bandpass). `f` peut varier dans le temps."""
    f = np.broadcast_to(np.asarray(f, dtype=float), x.shape)
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(len(x)):
        w0 = 2 * math.pi * min(f[i], SR * 0.45) / SR
        c, s = math.cos(w0), math.sin(w0)
        alpha = s / (2 * q)
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


def onepole_lp(x, f):
    a = math.exp(-2 * math.pi * f / SR)
    y = np.zeros_like(x)
    prev = 0.0
    for i in range(len(x)):
        prev = (1 - a) * x[i] + a * prev
        y[i] = prev
    return y


def reverb(x, mix=0.25, size=1.0, tail=1.2):
    """Réverbération de Schroeder (4 peignes + 2 passe-tout), avec traîne ajoutée."""
    x = np.concatenate([x, np.zeros(int(SR * tail))])
    out = np.zeros_like(x)
    for d, g in ((1557, 0.84), (1617, 0.83), (1491, 0.85), (1422, 0.86)):
        d = int(d * size * SR / 44100)
        buf = np.zeros_like(x)
        for i in range(len(x)):
            buf[i] = x[i] + (g * buf[i - d] if i >= d else 0.0)
        out += buf
    out /= 4
    for d, g in ((225, 0.5), (556, 0.5)):
        d = int(d * SR / 44100)
        y = np.zeros_like(out)
        for i in range(len(out)):
            xd = out[i - d] if i >= d else 0.0
            yd = y[i - d] if i >= d else 0.0
            y[i] = -g * out[i] + xd + g * yd
        out = y
    out = onepole_lp(out, 6000)
    return x * (1 - mix) + out * mix


def bell(freq, dur, amp=1.0, bright=1.0, decay=None):
    """Cloche / glockenspiel : partiels légèrement inharmoniques."""
    t = t_axis(dur)
    decay = decay or dur
    s = np.zeros_like(t)
    for ratio, a, d in ((1, 1, 1), (2.0, 0.5 * bright, 0.6), (3.01, 0.28 * bright, 0.4), (4.17, 0.18 * bright, 0.28), (5.43, 0.1 * bright, 0.2)):
        s += a * np.sin(2 * math.pi * freq * ratio * t) * np.exp(-t * 4.5 / (decay * d))
    return amp * s * np.clip(t / 0.002, 0, 1)


def noise(dur):
    return rng.standard_normal(int(SR * dur))


def place(buf, sig, at):
    i = int(SR * at)
    n = min(len(sig), len(buf) - i)
    if n > 0:
        buf[i:i + n] += sig[:n]
    return buf


def boom(dur=1.2, f0=95, f1=38, amp=1.0):
    """Impact grave : sinus qui plonge + souffle filtré."""
    t = t_axis(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 9)
    phase = 2 * math.pi * np.cumsum(f) / SR
    body = np.sin(phase) * np.exp(-t * 3.2)
    hit = biquad(noise(dur), "lp", 900) * np.exp(-t * 28) * 0.6
    return amp * (body + hit)


def sparkles(dur, count, lo=2200, hi=5200, amp=0.12):
    buf = np.zeros(int(SR * dur))
    for _ in range(count):
        f = rng.uniform(lo, hi)
        at = rng.uniform(0, dur * 0.8)
        place(buf, bell(f, 0.35, amp * rng.uniform(0.5, 1), bright=0.4), at)
    return buf


def pad(freqs, dur, amp=0.25, attack=0.35, cutoff=2400, formants=None):
    """Nappe : dents de scie désaccordées filtrées (option « chœur » par formants)."""
    t = t_axis(dur)
    s = np.zeros_like(t)
    for f in freqs:
        for det in (-0.006, 0.0, 0.007):
            ph = (f * (1 + det) * t + rng.uniform()) % 1.0
            s += 2 * ph - 1
    s /= len(freqs) * 3
    if formants:
        s = sum(biquad(s, "bp", fm, q=4) * g for fm, g in formants)
    else:
        s = biquad(s, "lp", cutoff, q=0.8)
    e = np.clip(t / attack, 0, 1) * np.clip((dur - t) / (dur * 0.45), 0, 1)
    return amp * s * e


def whoosh(dur, f_start, f_peak, f_end, amp=0.5, q=1.2):
    t = t_axis(dur)
    mid = dur * 0.45
    f = np.where(t < mid, f_start + (f_peak - f_start) * (t / mid) ** 1.5, f_peak + (f_end - f_peak) * ((t - mid) / (dur - mid)))
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.6
    return amp * biquad(noise(dur), "bp", f, q=q) * e


def finish(x, peak=0.89, fade=0.06, floor_db=-48):
    x = x - np.mean(x)
    m = np.max(np.abs(x)) or 1
    x = np.tanh(x / m * 1.15) / math.tanh(1.15) * peak
    # Coupe la traîne devenue inaudible (allège le fichier), avec un fondu.
    seg = int(SR * 0.05)
    levels = [20 * math.log10(np.sqrt(np.mean(x[i:i + seg] ** 2)) + 1e-9) for i in range(0, len(x) - seg, seg)]
    loud = [i for i, db in enumerate(levels) if db > floor_db]
    end = min(len(x), (loud[-1] + 1) * seg + int(SR * 0.1)) if loud else len(x)
    x = x[:end].copy()
    n = min(int(SR * fade), len(x))
    x[-n:] *= np.linspace(1, 0, n) ** 2
    return x


def save(name, x):
    data = (finish(x) * 32767).astype("<i2")
    with wave.open(f"{OUT}/{name}.wav", "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    print(f"{name}.wav  {len(data) / SR:.2f} s")


def note(n):
    """Numéro MIDI → Hz."""
    return 440 * 2 ** ((n - 69) / 12)


# --- Déchirure du paquet : grains de papier de plus en plus serrés + « pop » d'ouverture
def make_tear():
    dur = 0.75
    buf = np.zeros(int(SR * dur))
    at = 0.0
    while at < 0.42:
        g = 0.006 + rng.uniform(0, 0.012)
        grain = noise(g) * np.hanning(int(SR * g))
        place(buf, grain * rng.uniform(0.4, 1.0), at)
        at += max(0.004, 0.03 * (1 - at / 0.42)) * rng.uniform(0.5, 1.2)
    buf = biquad(buf, "bp", np.linspace(1800, 4200, len(buf)), q=0.9) * 1.6
    pop = boom(0.35, 160, 70, 0.7)
    place(buf, pop, 0.42)
    place(buf, whoosh(0.3, 600, 2600, 900, 0.5), 0.40)
    return reverb(buf, 0.18, tail=0.4)


# --- Les cartes sortent du paquet en éventail
def make_fan():
    buf = whoosh(0.55, 300, 2400, 700, 0.8, q=0.9)
    for i in range(5):
        place(buf, biquad(noise(0.02), "hp", 3000) * 0.25 * np.hanning(int(SR * 0.02)), 0.08 + i * 0.06)
    return reverb(buf, 0.2, tail=0.4)


# --- Carte glissée pour passer à la suivante
def make_swipe():
    return reverb(whoosh(0.26, 900, 3600, 1500, 0.9, q=1.4), 0.12, tail=0.25)


# --- Carte révélée (Commune / Rare / Super Rare)
def make_reveal():
    dur = 0.9
    buf = np.zeros(int(SR * dur))
    snap = biquad(noise(0.012), "hp", 2500) * np.hanning(int(SR * 0.012)) * 0.6
    place(buf, snap, 0)
    place(buf, bell(note(84), 0.7, 0.55), 0.01)
    place(buf, bell(note(91), 0.6, 0.4), 0.075)
    place(buf, boom(0.25, 140, 90, 0.25), 0)
    return reverb(buf, 0.25, tail=0.6)


# --- Épique / Mythique : impact + arpège magique + scintillement
def make_epic():
    dur = 1.6
    buf = boom(1.2, 110, 42, 0.9)
    buf = np.concatenate([buf, np.zeros(int(SR * dur) - len(buf))])
    for i, n in enumerate((74, 78, 81, 86, 90)):
        place(buf, bell(note(n), 1.0, 0.45, bright=0.8), 0.04 + i * 0.065)
    place(buf, sparkles(1.2, 14), 0.25)
    place(buf, whoosh(0.5, 400, 5000, 2000, 0.25), 0.0)
    return reverb(buf, 0.3, size=1.1, tail=1.0)


# --- Légendaire : gong + fanfare de cloches + nappe dorée
def make_legendary():
    dur = 3.0
    buf = np.zeros(int(SR * dur))
    place(buf, boom(1.6, 120, 36, 1.1), 0)
    place(buf, bell(note(43), 2.6, 0.35, bright=1.4, decay=3.0), 0)  # gong grave
    for i, n in enumerate((72, 76, 79, 84, 88, 91, 96)):
        place(buf, bell(note(n), 1.6, 0.42, bright=0.9), 0.05 + i * 0.075)
    place(buf, pad([note(60), note(64), note(67), note(72)], 2.6, 0.32, attack=0.25), 0.1)
    place(buf, sparkles(2.4, 26, 2500, 6000, 0.13), 0.35)
    return reverb(buf, 0.35, size=1.25, tail=1.4)


# --- Ultra Légendaire / Divine : aspiration, impact énorme, chœur, cascade de cloches
def make_ultra():
    dur = 4.2
    buf = np.zeros(int(SR * dur))
    rise = whoosh(0.5, 200, 6000, 6000, 0.35, q=0.8) * np.linspace(0, 1, int(SR * 0.5)) ** 2
    place(buf, rise, 0)
    place(buf, boom(2.0, 130, 30, 1.25), 0.45)
    place(buf, bell(note(36), 3.2, 0.32, bright=1.6, decay=3.5), 0.45)
    choir = pad([note(60), note(64), note(67), note(71), note(74), note(78)], 3.4, 0.5, attack=0.4,
                formants=[(700, 1.0), (1150, 0.7), (2600, 0.25)])
    place(buf, choir, 0.5)
    seq = (84, 88, 91, 95, 98, 102, 98, 95, 91, 96, 100, 103)
    for i, n in enumerate(seq):
        place(buf, bell(note(n), 1.4, 0.32, bright=0.7), 0.5 + i * 0.07)
    place(buf, sparkles(3.2, 46, 2600, 7000, 0.14), 0.6)
    return reverb(buf, 0.42, size=1.4, tail=1.8)


# --- Suspense avant une grosse carte : montée de souffle + tonalité qui grimpe
def make_riser():
    dur = 2.3
    t = t_axis(dur)
    f = 180 * (7 ** (t / dur))
    tone = np.sin(2 * math.pi * np.cumsum(f) / SR) * 0.25
    trem = 0.6 + 0.4 * np.sin(2 * math.pi * np.cumsum(4 + 22 * (t / dur) ** 2) / SR)
    air = biquad(noise(dur), "bp", 500 + 5000 * (t / dur) ** 2, q=0.9) * 0.6
    x = (tone * trem + air) * (t / dur) ** 1.7
    return reverb(x, 0.2, tail=0.2)


# --- Montée de niveau de la carte face cachée (1 = Rare … 7 = Divine) : de plus en plus haut et fort
def make_level_up(level):
    dur = 0.55 + level * 0.12
    buf = np.zeros(int(SR * dur))
    base = 72 + level * 2  # chaque palier monte d'un ton
    chord = (0, 4, 7, 12) if level < 5 else (0, 4, 7, 11, 14, 19)
    for i, n in enumerate(chord):
        place(buf, bell(note(base + n), 0.7 + level * 0.05, 0.4, bright=0.6 + level * 0.06), 0.03 + i * (0.045 - level * 0.003))
    place(buf, whoosh(0.3 + level * 0.03, 500, 3500 + level * 400, 1800, 0.25 + level * 0.03), 0)
    if level >= 3:
        place(buf, boom(0.5 + level * 0.08, 120, 55, 0.3 + level * 0.08), 0)
    if level >= 5:
        place(buf, sparkles(dur * 0.8, 6 + level * 2, 3000, 6500, 0.1), 0.1)
    return reverb(buf, 0.22 + level * 0.02, size=1 + level * 0.04, tail=0.5 + level * 0.08)


# --- Briquet : clic de la pierre, étincelles, puis la flamme qui prend
def make_lighter():
    dur = 0.9
    buf = np.zeros(int(SR * dur))
    click = biquad(noise(0.008), "hp", 2500) * np.hanning(int(SR * 0.008)) * 0.9
    place(buf, click, 0.0)
    place(buf, click * 0.6, 0.012)
    for _ in range(14):
        g = 0.003
        place(buf, biquad(noise(g), "hp", 5000) * np.hanning(int(SR * g)) * rng.uniform(0.2, 0.5), 0.02 + rng.uniform(0, 0.12))
    t = t_axis(0.7)
    flame = biquad(noise(0.7), "bp", 900 + 400 * np.exp(-t * 6), q=0.7) * np.clip(t / 0.05, 0, 1) * np.exp(-t * 2.2) * 0.9
    place(buf, flame, 0.16)
    place(buf, boom(0.4, 90, 60, 0.3), 0.16)
    return reverb(buf, 0.12, tail=0.3)


# --- Carte qui brûle : grondement du feu + crépitements, puis s'éteint en fumée
def make_burn():
    dur = 2.6
    t = t_axis(dur)
    roar = biquad(noise(dur), "lp", 700) * 0.9
    roar += biquad(noise(dur), "bp", 1600 + 300 * np.sin(t * 7), q=0.8) * 0.35
    env_ = np.clip(t / 0.25, 0, 1) * np.clip((dur - t) / 0.9, 0, 1)
    buf = roar * env_
    for _ in range(90):
        at = rng.uniform(0.05, dur - 0.5)
        g = rng.uniform(0.002, 0.006)
        crack = biquad(noise(g), "hp", rng.uniform(2000, 5000)) * np.hanning(int(SR * g))
        place(buf, crack * rng.uniform(0.3, 1.0) * 1.4, at)
    puff = whoosh(0.7, 300, 900, 200, 0.4, q=0.6)
    place(buf, puff, dur - 0.75)
    return reverb(buf, 0.15, tail=0.4)


if __name__ == "__main__":
    for lvl in range(1, 8):
        save(f"up{lvl}", make_level_up(lvl))
    save("lighter", make_lighter())
    save("burn", make_burn())
    for name, fn in (
        ("tear", make_tear),
        ("fan", make_fan),
        ("swipe", make_swipe),
        ("reveal", make_reveal),
        ("epic", make_epic),
        ("legendary", make_legendary),
        ("ultra", make_ultra),
        ("riser", make_riser),
    ):
        save(name, fn())
