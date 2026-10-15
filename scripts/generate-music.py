"""Musique de combat de PocketPics (python3 scripts/generate-music.py).

Boucle de 16 mesures à 132 BPM en la mineur, façon jeu vidéo : batterie,
basse, arpèges, nappe et mélodie. Tout est synthétisé, rien sous licence.
La fin de la boucle est repliée sur son début : elle tourne sans couture.
Sortie : assets/music/battle.wav (mono, 24 kHz, 16 bits).
"""
import math
import os
import wave

import numpy as np

SR = 24000
BPM = 132
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 16
LOOP = BARS * BAR
TAIL = 2.0
rng = np.random.default_rng(11)

N = int(SR * (LOOP + TAIL))


def hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def t_axis(dur):
    return np.arange(int(SR * dur)) / SR


def lowpass(x, fc, order=4):
    """Filtre passe-bas appliqué en fréquentiel (rapide, sans boucle)."""
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    spec *= 1 / np.sqrt(1 + (f / fc) ** (2 * order))
    return np.fft.irfft(spec, len(x))


def highpass(x, fc, order=2):
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    spec *= 1 - 1 / np.sqrt(1 + (f / fc) ** (2 * order))
    return np.fft.irfft(spec, len(x))


def adsr(n, a=0.005, d=0.08, s=0.6, r=0.05):
    t = np.arange(n) / SR
    dur = n / SR
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    rel = np.clip((dur - t) / max(r, 1e-4), 0, 1)
    return e * rel


def place(buf, sig, at):
    i = int(round(SR * at))
    n = min(len(sig), len(buf) - i)
    if n > 0:
        buf[i:i + n] += sig[:n]


def pulse(freq, dur, duty=0.5, vib=0.0):
    t = t_axis(dur)
    f = freq * (1 + vib * np.sin(2 * math.pi * 5.5 * t) * np.clip((t - 0.12) / 0.2, 0, 1))
    ph = np.cumsum(f) / SR % 1.0
    return np.where(ph < duty, 1.0, -1.0)


def saw(freq, dur, detune=0.0):
    t = t_axis(dur)
    return 2 * ((freq * (1 + detune) * t + rng.uniform()) % 1.0) - 1


def tri(freq, dur):
    t = t_axis(dur)
    return 2 * np.abs(2 * ((freq * t) % 1.0) - 1) - 1


# ------------------------------- Harmonie -----------------------------------
# (fondamentale MIDI de la basse, notes de l'accord) pour chaque mesure
AM, F, C, G, E, EM = (45, (57, 60, 64)), (41, (53, 57, 60)), (48, (55, 60, 64)), (43, (55, 59, 62)), (40, (56, 59, 64)), (40, (55, 59, 64))
CHORDS = [AM, F, C, G, AM, F, G, E, F, G, AM, AM, F, G, E, E]

# Mélodie : (mesure, temps, durée en temps, note MIDI)
LEAD = [
    (4, 0, 1, 69), (4, 1, 0.5, 72), (4, 1.5, 1, 76), (4, 2.5, 0.5, 74), (4, 3, 1, 72),
    (5, 0, 1.5, 69), (5, 1.5, 0.5, 65), (5, 2, 1, 69), (5, 3, 1, 72),
    (6, 0, 1, 71), (6, 1, 0.5, 74), (6, 1.5, 1.5, 79), (6, 3, 0.5, 77), (6, 3.5, 0.5, 76),
    (7, 0, 1.5, 76), (7, 1.5, 0.5, 74), (7, 2, 1, 71), (7, 3, 1, 68),
    (8, 0, 1, 81), (8, 1, 0.5, 79), (8, 1.5, 1, 77), (8, 2.5, 0.5, 76), (8, 3, 1, 77),
    (9, 0, 1.5, 79), (9, 1.5, 0.5, 74), (9, 2, 1, 71), (9, 3, 1, 74),
    (10, 0, 0.5, 76), (10, 0.5, 1, 81), (10, 1.5, 0.5, 76), (10, 2, 1, 72), (10, 3, 1, 76),
    (11, 0, 2.5, 81), (11, 2.5, 0.5, 83), (11, 3, 1, 84),
    (12, 0, 1, 84), (12, 1, 0.5, 81), (12, 1.5, 1, 77), (12, 2.5, 0.5, 81), (12, 3, 1, 84),
    (13, 0, 1, 83), (13, 1, 0.5, 79), (13, 1.5, 1, 74), (13, 2.5, 0.5, 79), (13, 3, 1, 83),
    (14, 0, 1.5, 80), (14, 1.5, 0.5, 76), (14, 2, 1, 71), (14, 3, 1, 76),
    (15, 0, 1, 80), (15, 1, 0.5, 81), (15, 1.5, 2.5, 83),
]

# --------------------------------- Pistes -----------------------------------


def drums():
    kick_buf, snare_buf, hat_buf = np.zeros(N), np.zeros(N), np.zeros(N)
    duck = np.ones(N)

    def kick():
        t = t_axis(0.35)
        f = 45 + 95 * np.exp(-t * 28)
        body = np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
        click = rng.standard_normal(len(t)) * np.exp(-t * 300) * 0.3
        return body + click

    def snare():
        t = t_axis(0.25)
        tone = np.sin(2 * math.pi * 185 * t) * np.exp(-t * 30) * 0.6
        nz = rng.standard_normal(len(t)) * np.exp(-t * 18)
        return tone + nz * 0.8

    def hat(open_=False):
        d = 0.18 if open_ else 0.045
        t = t_axis(d)
        return rng.standard_normal(len(t)) * np.exp(-t * (14 if open_ else 70))

    for bar in range(BARS):
        b0 = bar * BAR
        fill = bar in (7, 15)
        kicks = [0, 2, 2.5] if bar % 2 else [0, 1.75, 2]
        for k in kicks:
            place(kick_buf, kick(), b0 + k * BEAT)
            i = int(SR * (b0 + k * BEAT))
            n = min(int(SR * 0.22), N - i)
            duck[i:i + n] = np.minimum(duck[i:i + n], 0.45 + 0.55 * (np.arange(n) / n) ** 0.6)
        for s in (1, 3):
            place(snare_buf, snare(), b0 + s * BEAT)
        if fill:
            for k in range(4):
                place(snare_buf, snare() * (0.45 + k * 0.15), b0 + (3 + k * 0.25) * BEAT)
        for h in range(8):
            open_ = h % 2 == 1 and h in (3, 7) and not fill
            place(hat_buf, hat(open_) * (0.55 if h % 2 else 0.35), b0 + h * 0.5 * BEAT)
    # crash au début de chaque partie
    for bar in (0, 8):
        t = t_axis(1.6)
        place(hat_buf, rng.standard_normal(len(t)) * np.exp(-t * 2.6) * 0.5, bar * BAR)
    snare_buf = lowpass(highpass(snare_buf, 180), 7000)
    hat_buf = highpass(hat_buf, 6000, order=3)
    return kick_buf * 0.95 + snare_buf * 0.42 + hat_buf * 0.16, duck


def bass():
    buf = np.zeros(N)
    pattern = [0, 0, 12, 0, 0, 12, 0, 7]
    for bar, (root, _) in enumerate(CHORDS):
        for i, iv in enumerate(pattern):
            d = BEAT * 0.5
            s = (saw(hz(root + iv), d * 0.92) * 0.6 + pulse(hz(root + iv), d * 0.92, 0.5) * 0.4) * adsr(int(SR * d * 0.92), 0.004, 0.09, 0.55, 0.03)
            place(buf, s, bar * BAR + i * d)
    return lowpass(buf, 900)


def arps():
    buf = np.zeros(N)
    for bar, (_, notes) in enumerate(CHORDS):
        seq = list(notes) + [notes[0] + 12]
        seq = seq + seq[::-1][1:-1]
        for i in range(16):
            m = seq[i % len(seq)] + 12
            d = BEAT * 0.25
            s = pulse(hz(m), d * 0.85, 0.25) * adsr(int(SR * d * 0.85), 0.002, 0.05, 0.25, 0.02)
            place(buf, s * (1.0 if i % 4 == 0 else 0.7), bar * BAR + i * d)
    return lowpass(buf, 3200)


def pad():
    buf = np.zeros(N)
    for bar, (_, notes) in enumerate(CHORDS):
        for m in notes:
            s = sum(saw(hz(m), BAR, det) for det in (-0.004, 0.0, 0.005)) / 3
            place(buf, s * adsr(int(SR * BAR), 0.25, 0.6, 0.8, 0.25), bar * BAR)
    return lowpass(buf, 1300)


def lead():
    buf = np.zeros(N)
    for bar, beat, dur, m in LEAD:
        d = dur * BEAT
        s = pulse(hz(m), d, 0.5, vib=0.006) * 0.55 + tri(hz(m), d) * 0.45
        s = s * adsr(int(SR * d), 0.008, 0.18, 0.7, 0.06)
        place(buf, s, bar * BAR + beat * BEAT)
    buf = lowpass(buf, 4200)
    # petit écho calé sur la croche pointée
    delay = int(SR * BEAT * 0.75)
    echo = np.zeros(N)
    echo[delay:] = buf[:-delay] * 0.28
    return buf + echo


def main():
    kit, duck = drums()
    mix = kit * 0.9 + bass() * 0.5 * duck + arps() * 0.16 * duck + pad() * 0.2 * duck + lead() * 0.3
    # repli de la traîne sur le début : la boucle s'enchaîne sans couture
    L = int(SR * LOOP)
    loop = mix[:L].copy()
    loop[: N - L] += mix[L:]
    loop -= np.mean(loop)
    loop = np.tanh(loop / np.max(np.abs(loop)) * 1.4) / math.tanh(1.4) * 0.88
    os.makedirs("assets/music", exist_ok=True)
    with wave.open("assets/music/battle.wav", "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((loop * 32767).astype("<i2").tobytes())
    print(f"battle.wav  {LOOP:.1f} s")


if __name__ == "__main__":
    main()
