"""Musiques de combat de PocketPics : une par monde de l'aventure.

    python3 scripts/generate-music.py            # les 10 mondes
    python3 scripts/generate-music.py 3 7        # seulement les mondes 3 et 7

Tout est synthétisé ici (aucun son sous licence), puis encodé en AAC (.m4a)
avec ffmpeg. Chaque morceau est une vraie petite composition, en boucle :

  - une tonalité, un mode, un tempo et un groove propres au monde ;
  - des instruments qui collent au lieu (steel drum à la plage, accordéon au
    marché, flûte et harpe en forêt, cuivres au palais, synthés au cosmos…) ;
  - 4 parties de 8 mesures : A (le thème), B (le développement, d'autres
    accords), A' (le thème varié, à l'octave, avec une seconde voix) et C (un
    pont plus calme qui remonte vers le début) ;
  - des mélodies construites comme en vrai : un motif de 2 mesures, sa
    réponse transposée sur les accords suivants (fin « ouverte »), la
    reprise, puis une conclusion qui retombe sur la tonique ;
  - basse, accompagnement et batterie écrits pour chaque style, avec des
    breaks de batterie en fin de partie et une cymbale au début de la suivante.

La fin de la boucle est repliée sur son début : elle tourne sans couture.
Sortie : assets/music/world-<n>.m4a (mono, 22,05 kHz).
"""
import math
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 22050
TWO_PI = 2 * math.pi
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'music')


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def taxis(n):
    return np.arange(n) / SR


# ------------------------------------------------------------------------------
# Filtres (en fréquentiel : rapides, sans boucle Python)
# ------------------------------------------------------------------------------


def fft_filter(x, gain_fn):
    if len(x) < 16:
        return x
    n = 1 << (len(x) - 1).bit_length()
    spec = np.fft.rfft(x, n)
    f = np.fft.rfftfreq(n, 1 / SR)
    return np.fft.irfft(spec * gain_fn(f), n)[: len(x)]


def lowpass(x, fc, order=2):
    return fft_filter(x, lambda f: 1 / np.sqrt(1 + (f / fc) ** (2 * order)))


def highpass(x, fc, order=2):
    return fft_filter(x, lambda f: 1 - 1 / np.sqrt(1 + (f / max(fc, 1)) ** (2 * order)))


def bandpass(x, fc, q=1.0):
    return fft_filter(x, lambda f: 1 / (1 + ((f - fc) / (fc / q)) ** 2))


def envelope(n, a=0.01, d=0.1, s=0.7, r=0.08, hold=None):
    """ADSR : `hold` = durée tenue avant le relâchement (par défaut, toute la note moins r)."""
    t = taxis(n)
    hold = (n / SR - r) if hold is None else hold
    att = np.clip(t / max(a, 1e-4), 0, 1)
    dec = s + (1 - s) * np.exp(-np.clip(t - a, 0, None) / max(d, 1e-4))
    rel = np.clip(1 - (t - hold) / max(r, 1e-4), 0, 1)
    return att * np.where(t < a, 1, dec) * rel


def phase(f0, n, vib_rate=0.0, vib_depth=0.0, vib_delay=0.15, scoop=0.0, glide=None):
    """Phase (en tours) d'une note, avec vibrato tardif et attaque « par en dessous »."""
    t = taxis(n)
    f = np.full(n, float(f0))
    if vib_depth:
        f *= 1 + vib_depth * np.sin(TWO_PI * vib_rate * t) * np.clip((t - vib_delay) / 0.25, 0, 1)
    if scoop:
        f *= 1 - scoop * np.exp(-t * 30)
    if glide is not None:
        f *= glide(t)
    return np.cumsum(f) / SR


def additive(ph, f0, amps, decays=None, detune=0.0):
    """Somme d'harmoniques : amps[k] pour l'harmonique k+1, décroissance propre à chacune."""
    n = len(ph)
    t = taxis(n)
    out = np.zeros(n)
    for k, a in enumerate(amps, start=1):
        if a == 0 or f0 * k > SR * 0.45:
            continue
        h = a * np.sin(TWO_PI * k * ph * (1 + detune))
        if decays is not None:
            h *= np.exp(-t * decays[k - 1])
        out += h
    return out


def saw_amps(k_max, roll=1.0):
    return [1 / k**roll for k in range(1, k_max + 1)]


def noise(n, rng):
    return rng.standard_normal(n)


# ------------------------------------------------------------------------------
# Instruments mélodiques : f(midi, durée en s, vélocité, rng) -> signal
# ------------------------------------------------------------------------------


def i_pluck(m, dur, vel, rng, bright=1.0, sustain=1.0, pos=0.2):
    """Corde pincée (guitare, ukulélé, harpe, mandoline) : harmoniques qui s'éteignent vite, les aiguës d'abord."""
    f0 = hz(m)
    n = int(SR * (dur + 0.6 * sustain))
    ph = phase(f0, n)
    amps = [abs(math.sin(k * math.pi * pos)) / k**1.15 * (bright ** (k - 1) if bright < 1 else 1) for k in range(1, 22)]
    dec = [(1.8 + 0.5 * k**1.5) / sustain for k in range(1, 22)]
    sig = additive(ph, f0, amps, dec)
    sig += noise(n, rng) * np.exp(-taxis(n) * 400) * 0.15
    return sig * envelope(n, a=0.002, d=0.5, s=1, r=0.12, hold=dur + 0.4 * sustain) * vel


def i_harpsi(m, dur, vel, rng):
    f0 = hz(m)
    n = int(SR * (dur + 0.5))
    ph = phase(f0, n)
    amps = [abs(math.sin(k * math.pi * 0.11)) / k**0.75 for k in range(1, 26)]
    dec = [1.5 + 0.35 * k**1.3 for k in range(1, 26)]
    sig = additive(ph, f0, amps, dec) + 0.5 * additive(ph, f0, amps[:10], dec[:10], detune=0.0025)
    return sig * envelope(n, a=0.001, d=1, s=1, r=0.08, hold=dur + 0.3) * vel * 0.6


def i_marimba(m, dur, vel, rng):
    f0 = hz(m)
    n = int(SR * (dur + 0.35))
    t = taxis(n)
    sig = np.sin(TWO_PI * f0 * t) * np.exp(-t * 7) + 0.3 * np.sin(TWO_PI * f0 * 3.99 * t) * np.exp(-t * 22) + 0.08 * np.sin(TWO_PI * f0 * 9.2 * t) * np.exp(-t * 60)
    sig += noise(n, rng) * np.exp(-t * 500) * 0.2
    return sig * vel


def i_steel(m, dur, vel, rng):
    """Steel drum : partiels légèrement inharmoniques, attaque qui glisse vers la note."""
    f0 = hz(m)
    n = int(SR * (dur + 0.5))
    t = taxis(n)
    ph = phase(f0, n, glide=lambda tt: 1 + 0.012 * np.exp(-tt * 40))
    sig = np.zeros(n)
    for ratio, amp, dec in ((1, 1, 3.2), (2.0, 0.55, 5), (3.02, 0.25, 8), (4.13, 0.12, 12), (5.4, 0.05, 18)):
        sig += amp * np.sin(TWO_PI * ratio * ph) * np.exp(-t * dec)
    return sig * envelope(n, a=0.004, d=1, s=1, r=0.1, hold=dur + 0.3) * vel * 0.8


def i_bell(m, dur, vel, rng, hard=1.0):
    """Cloche / célesta / glockenspiel (synthèse FM)."""
    f0 = hz(m)
    n = int(SR * (dur + 1.2))
    t = taxis(n)
    idx = hard * 2.2 * np.exp(-t * 6)
    mod = np.sin(TWO_PI * f0 * 3.5 * t)
    sig = np.sin(TWO_PI * f0 * t + idx * mod) * np.exp(-t * 2.4) + 0.2 * np.sin(TWO_PI * f0 * 2 * t) * np.exp(-t * 5)
    return sig * vel * 0.7


def i_glock(m, dur, vel, rng):
    f0 = hz(m)
    n = int(SR * (dur + 0.9))
    t = taxis(n)
    sig = np.zeros(n)
    for ratio, amp, dec in ((1, 1, 3.5), (2.76, 0.35, 9), (5.4, 0.15, 16), (8.93, 0.06, 26)):
        sig += amp * np.sin(TWO_PI * f0 * ratio * t) * np.exp(-t * dec)
    sig += noise(n, rng) * np.exp(-t * 900) * 0.1
    return sig * vel * 0.8


def i_flute(m, dur, vel, rng, breath=0.12):
    f0 = hz(m)
    n = int(SR * (dur + 0.12))
    ph = phase(f0, n, vib_rate=5.2, vib_depth=0.0045, vib_delay=0.2, scoop=0.01)
    sig = additive(ph, f0, [1, 0.32, 0.12, 0.05])
    nz = bandpass(noise(n, rng), f0 * 2, q=2) * breath
    return (sig + nz) * envelope(n, a=0.06, d=0.2, s=0.85, r=0.1) * vel


def i_whistle(m, dur, vel, rng):
    f0 = hz(m)
    n = int(SR * (dur + 0.06))
    ph = phase(f0, n, vib_rate=6, vib_depth=0.006, vib_delay=0.1, scoop=0.03)
    return (np.sin(TWO_PI * ph) + 0.05 * np.sin(TWO_PI * 2 * ph)) * envelope(n, a=0.03, d=0.1, s=0.9, r=0.06) * vel


def i_accordion(m, dur, vel, rng):
    """Deux anches légèrement désaccordées qui battent, et le soufflet qui ondule."""
    f0 = hz(m)
    n = int(SR * (dur + 0.08))
    t = taxis(n)
    ph = phase(f0, n)
    amps = [1 / k**0.9 if k % 2 else 0.6 / k**0.9 for k in range(1, 16)]
    sig = additive(ph, f0, amps) + additive(ph, f0, amps, detune=0.0035)
    trem = 1 + 0.08 * np.sin(TWO_PI * 5.5 * t)
    return lowpass(sig, 3200) * trem * envelope(n, a=0.025, d=0.1, s=0.9, r=0.06) * vel * 0.35


def i_fiddle(m, dur, vel, rng):
    f0 = hz(m)
    n = int(SR * (dur + 0.1))
    ph = phase(f0, n, vib_rate=6.2, vib_depth=0.006, vib_delay=0.12, scoop=0.015)
    sig = additive(ph, f0, saw_amps(18, 1.05))
    sig = bandpass(sig, 1800, q=0.5) + 0.4 * sig
    return sig * envelope(n, a=0.04, d=0.15, s=0.85, r=0.08) * vel * 0.3


def i_brass(m, dur, vel, rng, soft=0.0):
    """Cuivre : plus on souffle, plus le son s'ouvre (harmoniques aiguës qui montent avec l'enveloppe)."""
    f0 = hz(m)
    n = int(SR * (dur + 0.1))
    t = taxis(n)
    env = envelope(n, a=0.05 + 0.05 * soft, d=0.25, s=0.75, r=0.1)
    ph = phase(f0, n, vib_rate=5, vib_depth=0.003, vib_delay=0.3, scoop=0.02)
    sig = np.zeros(n)
    for k in range(1, 16):
        if f0 * k > SR * 0.45:
            break
        bright = np.exp(-(k - 1) * (0.25 + soft * 0.4 + 0.9 * (1 - env)))
        sig += bright * np.sin(TWO_PI * k * ph) / k**0.6
    return sig * env * vel * 0.32


def i_strings(m, dur, vel, rng, attack=0.25):
    f0 = hz(m)
    n = int(SR * (dur + 0.4))
    sig = np.zeros(n)
    for det in (-0.004, 0.0, 0.0045):
        ph = phase(f0 * (1 + det), n, vib_rate=5.5 + det * 200, vib_depth=0.003, vib_delay=0.2)
        sig += additive(ph, f0, saw_amps(12, 1.2))
    return lowpass(sig, 2600) * envelope(n, a=attack, d=0.3, s=0.85, r=0.35) * vel * 0.18


def i_choir(m, dur, vel, rng):
    """Chœur « ah » : harmoniques pondérées par les formants de la voix."""
    f0 = hz(m)
    n = int(SR * (dur + 0.5))
    sig = np.zeros(n)
    formants = ((750, 1.0, 120), (1150, 0.5, 140), (2600, 0.25, 200))
    for det in (-0.005, 0.004):
        ph = phase(f0 * (1 + det), n, vib_rate=5 + det * 100, vib_depth=0.006, vib_delay=0.15)
        amps = []
        for k in range(1, 30):
            fk = f0 * k
            amps.append(sum(a * math.exp(-((fk - fc) / bw) ** 2 / 2) for fc, a, bw in formants) + 0.05 / k)
        sig += additive(ph, f0, amps)
    return sig * envelope(n, a=0.35, d=0.3, s=0.85, r=0.45) * vel * 0.2


def i_supersaw(m, dur, vel, rng, cutoff=3800):
    f0 = hz(m)
    n = int(SR * (dur + 0.15))
    sig = np.zeros(n)
    for det in (-0.012, -0.005, 0.0, 0.006, 0.013):
        ph = phase(f0 * (1 + det), n, vib_rate=5.5, vib_depth=0.002, vib_delay=0.25) + rng.uniform()
        sig += additive(ph, f0, saw_amps(16))
    return lowpass(sig, cutoff) * envelope(n, a=0.01, d=0.2, s=0.75, r=0.12) * vel * 0.16


def i_chip(m, dur, vel, rng, duty_amps=None):
    """Synthé carré (impair), arpèges et leads électroniques."""
    f0 = hz(m)
    n = int(SR * (dur + 0.05))
    ph = phase(f0, n, vib_rate=6, vib_depth=0.003, vib_delay=0.2)
    amps = duty_amps or [1 / k if k % 2 else 0.18 / k for k in range(1, 18)]
    return lowpass(additive(ph, f0, amps), 3500) * envelope(n, a=0.003, d=0.12, s=0.55, r=0.04) * vel * 0.4


def i_pad(m, dur, vel, rng):
    """Nappe de synthé large et douce."""
    f0 = hz(m)
    n = int(SR * (dur + 0.8))
    sig = np.zeros(n)
    for det in (-0.007, -0.002, 0.003, 0.008):
        ph = phase(f0 * (1 + det), n) + rng.uniform()
        sig += additive(ph, f0, saw_amps(10, 1.4))
    t = taxis(n)
    sig = lowpass(sig, 1400) * (1 + 0.15 * np.sin(TWO_PI * 0.4 * t))
    return sig * envelope(n, a=0.6, d=0.5, s=0.9, r=0.8) * vel * 0.12


def i_powerchord(m, dur, vel, rng, mute=True):
    """Guitare saturée : fondamentale + quinte + octave, distorsion douce, étouffée à la paume."""
    n = int(SR * (dur + 0.05))
    sig = np.zeros(n)
    for iv in (0, 7, 12):
        f0 = hz(m + iv)
        sig += additive(phase(f0, n) + rng.uniform(), f0, saw_amps(20))
    sig = np.tanh(sig * 2.6)
    sig = lowpass(sig, 2400 if mute else 4200)
    env = envelope(n, a=0.003, d=0.09 if mute else 0.4, s=0.25 if mute else 0.7, r=0.04)
    return sig * env * vel * 0.4


def i_bass_round(m, dur, vel, rng):
    f0 = hz(m)
    n = int(SR * (dur + 0.05))
    ph = phase(f0, n)
    sig = additive(ph, f0, [1, 0.25, 0.11, 0.05])
    return sig * envelope(n, a=0.006, d=0.25, s=0.7, r=0.05) * vel


def i_bass_synth(m, dur, vel, rng):
    f0 = hz(m)
    n = int(SR * (dur + 0.04))
    t = taxis(n)
    ph = phase(f0, n)
    sig = np.zeros(n)
    for k in range(1, 14):
        sig += np.sin(TWO_PI * k * ph) / k * np.exp(-t * (k - 1) * 6)
    sig += 0.8 * np.sin(TWO_PI * ph)
    return sig * envelope(n, a=0.004, d=0.2, s=0.75, r=0.04) * vel * 0.7


def i_bass_pizz(m, dur, vel, rng):
    return i_pluck(m, min(dur, 0.35), vel, rng, bright=0.75, sustain=0.6, pos=0.3) * 1.1


def i_bass_dist(m, dur, vel, rng):
    f0 = hz(m)
    n = int(SR * (dur + 0.04))
    sig = additive(phase(f0, n), f0, saw_amps(14))
    sig = lowpass(np.tanh(sig * 2.2), 1500)
    return sig * envelope(n, a=0.003, d=0.15, s=0.6, r=0.04) * vel * 0.6


def i_tuba(m, dur, vel, rng):
    return i_brass(m, dur, vel, rng, soft=0.6) * 1.6


INSTRUMENTS = {
    'pluck': i_pluck,
    'uke': lambda m, d, v, r: i_pluck(m, d, v, r, bright=1, sustain=0.5, pos=0.25),
    'harp': lambda m, d, v, r: i_pluck(m, d, v, r, bright=0.85, sustain=1.6, pos=0.33),
    'mando': lambda m, d, v, r: i_pluck(m, d, v, r, bright=1, sustain=0.35, pos=0.12),
    'harpsi': i_harpsi,
    'marimba': i_marimba,
    'steel': i_steel,
    'bell': i_bell,
    'celesta': lambda m, d, v, r: i_bell(m, d, v, r, hard=0.6),
    'glock': i_glock,
    'flute': i_flute,
    'whistle': i_whistle,
    'accordion': i_accordion,
    'fiddle': i_fiddle,
    'brass': i_brass,
    'horn': lambda m, d, v, r: i_brass(m, d, v, r, soft=0.7),
    'strings': i_strings,
    'choir': i_choir,
    'supersaw': i_supersaw,
    'chip': i_chip,
    'pad': i_pad,
    'power': i_powerchord,
    'bass': i_bass_round,
    'synthbass': i_bass_synth,
    'pizz': i_bass_pizz,
    'distbass': i_bass_dist,
    'tuba': i_tuba,
}


# ------------------------------------------------------------------------------
# Percussions : f(vélocité, rng) -> signal
# ------------------------------------------------------------------------------


def d_kick(v, rng, punch=1.0):
    n = int(SR * 0.4)
    t = taxis(n)
    f = 44 + 110 * punch * np.exp(-t * 32)
    body = np.sin(TWO_PI * np.cumsum(f) / SR) * np.exp(-t * 8)
    click = noise(n, rng) * np.exp(-t * 350) * 0.3
    return np.tanh((body + click) * 1.4) * v


def d_snare(v, rng, tone=190):
    n = int(SR * 0.28)
    t = taxis(n)
    body = np.sin(TWO_PI * tone * t) * np.exp(-t * 28) * 0.55
    nz = highpass(noise(n, rng), 1200) * np.exp(-t * 17)
    return (body + nz * 0.9) * v


def d_clap(v, rng):
    n = int(SR * 0.25)
    t = taxis(n)
    nz = bandpass(noise(n, rng), 1300, q=1.4)
    env = np.exp(-t * 20)
    for off in (0.0, 0.011, 0.022):
        env += (t >= off) * np.exp(-np.clip(t - off, 0, None) * 140) * 0.8
    return nz * env * v * 0.7


def d_hat(v, rng, open_=False):
    n = int(SR * (0.25 if open_ else 0.05))
    t = taxis(n)
    return highpass(noise(n, rng), 7000) * np.exp(-t * (12 if open_ else 75)) * v * 0.55


def d_shaker(v, rng):
    n = int(SR * 0.09)
    t = taxis(n)
    env = np.clip(t / 0.02, 0, 1) * np.exp(-t * 40)
    return bandpass(noise(n, rng), 7500, q=1.2) * env * v * 0.7


def d_tamb(v, rng):
    n = int(SR * 0.2)
    t = taxis(n)
    jingle = bandpass(noise(n, rng), 9000, q=2) * np.exp(-t * 18)
    return (jingle + d_hat(0.4, rng)[: n].sum() * 0) * v * 0.9


def d_tom(v, rng, f=110):
    n = int(SR * 0.45)
    t = taxis(n)
    fr = f * (1 + 0.6 * np.exp(-t * 25))
    return np.sin(TWO_PI * np.cumsum(fr) / SR) * np.exp(-t * 7) * v


def d_taiko(v, rng):
    n = int(SR * 0.9)
    t = taxis(n)
    fr = 62 * (1 + 0.5 * np.exp(-t * 18))
    body = np.sin(TWO_PI * np.cumsum(fr) / SR) * np.exp(-t * 4)
    skin = lowpass(noise(n, rng), 500) * np.exp(-t * 14) * 0.6
    return np.tanh((body + skin) * 1.5) * v


def d_timpani(v, rng, m=38):
    n = int(SR * 1.4)
    t = taxis(n)
    f0 = hz(m)
    sig = np.sin(TWO_PI * f0 * t) * np.exp(-t * 2.2) + 0.5 * np.sin(TWO_PI * f0 * 1.5 * t) * np.exp(-t * 3) + 0.3 * np.sin(TWO_PI * f0 * 1.98 * t) * np.exp(-t * 3.5)
    sig += lowpass(noise(n, rng), 400) * np.exp(-t * 20) * 0.5
    return sig * v * 0.8


def d_bongo(v, rng, f=380):
    n = int(SR * 0.18)
    t = taxis(n)
    fr = f * (1 + 0.25 * np.exp(-t * 60))
    return np.sin(TWO_PI * np.cumsum(fr) / SR) * np.exp(-t * 22) * v


def d_wood(v, rng):
    n = int(SR * 0.08)
    t = taxis(n)
    return (np.sin(TWO_PI * 1250 * t) + 0.4 * np.sin(TWO_PI * 2900 * t)) * np.exp(-t * 60) * v * 0.6


def d_rim(v, rng):
    n = int(SR * 0.06)
    t = taxis(n)
    return (bandpass(noise(n, rng), 2500, q=3) + np.sin(TWO_PI * 1700 * t)) * np.exp(-t * 90) * v * 0.6


def d_crash(v, rng):
    n = int(SR * 2.0)
    t = taxis(n)
    return highpass(noise(n, rng), 4500) * np.exp(-t * 2.2) * v * 0.45


def d_sleigh(v, rng):
    n = int(SR * 0.16)
    t = taxis(n)
    sig = np.zeros(n)
    for _ in range(5):
        f = rng.uniform(5500, 9000)
        off = rng.uniform(0, 0.03)
        sig += np.sin(TWO_PI * f * t) * (t >= off) * np.exp(-np.clip(t - off, 0, None) * 45)
    return sig * v * 0.18


def d_shipbell(v, rng):
    return i_bell(79, 1.0, v, rng, hard=0.4) + i_bell(91, 1.0, v * 0.4, rng, hard=0.3)


def d_thunder(v, rng):
    n = int(SR * 2.6)
    t = taxis(n)
    rumble = lowpass(noise(n, rng), 160) * (np.clip(t / 0.08, 0, 1) * np.exp(-t * 1.4))
    crack = highpass(noise(n, rng), 1500) * np.exp(-t * 9) * 0.4
    return (rumble * 3 + crack) * v


def d_riser(v, rng, dur=2.0):
    n = int(SR * dur)
    t = taxis(n)
    k = t / dur
    sig = fft_filter(noise(n, rng), lambda f: 1 / (1 + ((f - 3000) / 2500) ** 2))
    return sig * k**2 * v * 0.5


DRUMS = {
    'K': d_kick,
    'S': d_snare,
    'C': d_clap,
    'h': d_hat,
    'o': lambda v, r: d_hat(v, r, open_=True),
    'x': d_shaker,
    'T': d_tamb,
    'L': lambda v, r: d_tom(v, r, 95),
    'M': lambda v, r: d_tom(v, r, 140),
    'H': lambda v, r: d_tom(v, r, 200),
    'D': d_taiko,
    'P': d_timpani,
    'b': d_bongo,
    'B': lambda v, r: d_bongo(v, r, 260),
    'w': d_wood,
    'r': d_rim,
    'Z': d_crash,
    'j': d_sleigh,
}


# ------------------------------------------------------------------------------
# Harmonie
# ------------------------------------------------------------------------------

MODES = {
    'major': [0, 2, 4, 5, 7, 9, 11],
    'minor': [0, 2, 3, 5, 7, 8, 10],
    'dorian': [0, 2, 3, 5, 7, 9, 10],
    'mixolydian': [0, 2, 4, 5, 7, 9, 10],
    'lydian': [0, 2, 4, 6, 7, 9, 11],
    'phrygian': [0, 1, 3, 5, 7, 8, 10],
    'harmonic': [0, 2, 3, 5, 7, 8, 11],
}
ROMAN = {'I': 0, 'II': 2, 'III': 4, 'IV': 5, 'V': 7, 'VI': 9, 'VII': 11}


def chord(symbol, key):
    """« bVI », « iv », « V7 », « IVsus » → (fondamentale MIDI, notes de l'accord en demi-tons)."""
    s = symbol
    flat = s.startswith('b')
    s = s.lstrip('b#')
    sharp = symbol.startswith('#')
    num = ''.join(c for c in s if c.upper() in 'IV')
    rest = s[len(num):]
    minor = num.islower()
    root = key + ROMAN[num.upper()] - (1 if flat else 0) + (1 if sharp else 0)
    if 'sus' in rest:
        tones = [0, 5, 7]
    elif '°' in rest or 'dim' in rest:
        tones = [0, 3, 6]
    else:
        tones = [0, 3, 7] if minor else [0, 4, 7]
    if 'maj7' in rest:
        tones.append(11)
    elif '7' in rest:
        tones.append(10)
    return root, tones


# ------------------------------------------------------------------------------
# Mélodie : motifs, réponses, cadences
# ------------------------------------------------------------------------------

# Cellules rythmiques en doubles croches (durées), par caractère de morceau
CELLS = {
    'song': [[4, 4], [2, 2, 4], [6, 2], [4, 2, 2], [3, 3, 2], [8], [2, 2, 2, 2], [4, 4]],
    'dance': [[2, 2, 4], [3, 3, 2], [2, 4, 2], [4, 2, 2], [2, 2, 2, 2], [6, 2], [1, 1, 2, 4]],
    'march': [[4, 4], [3, 1, 4], [4, 2, 2], [6, 2], [2, 2, 4], [8]],
    'calm': [[8], [6, 2], [4, 4], [12, 4], [4, 8, 4]],
    'drive': [[2, 2, 2, 2], [3, 3, 2], [2, 2, 4], [1, 1, 2, 2, 2], [4, 2, 2], [2, 4, 2]],
}


class Scale:
    def __init__(self, key, mode):
        self.key = key
        self.steps = MODES[mode]
        # toutes les notes de la gamme sur 7 octaves
        self.notes = [key - 36 + 12 * o + s for o in range(7) for s in self.steps]

    def index_near(self, midi):
        return min(range(len(self.notes)), key=lambda i: abs(self.notes[i] - midi))

    def chord_degrees_near(self, idx, root, tones, span=3):
        """Degré le plus proche de idx qui est une note de l'accord."""
        pcs = {(root + t) % 12 for t in tones}
        best = None
        for d in range(-span, span + 1):
            j = idx + d
            if 0 <= j < len(self.notes) and self.notes[j] % 12 in pcs:
                if best is None or abs(d) < abs(best - idx):
                    best = j
        return idx if best is None else best


def rhythm(rng, style, bars=2, rest_end=True):
    cells = CELLS[style]
    out = []
    pos = 0
    total = 16 * bars
    while pos < total:
        cell = cells[rng.integers(len(cells))]
        for d in cell:
            if pos >= total:
                break
            d = min(d, total - pos)
            out.append((pos, d))
            pos += d
    # une respiration à la fin du motif
    if rest_end and len(out) > 3 and out[-1][1] <= 4:
        out = out[:-1]
    return out


def motif(rng, style, bars=2, shape=None):
    """Un motif = un rythme + un contour mélodique (arche, montée, descente ou vague), en degrés de la gamme."""
    r = rhythm(rng, style, bars)
    n = len(r)
    shape = shape or ['arch', 'rise', 'wave', 'arch', 'fall'][rng.integers(5)]
    height = int(rng.integers(3, 6))
    targets = []
    for i in range(n):
        x = i / max(1, n - 1)
        y = {
            'arch': height * math.sin(math.pi * x),
            'rise': height * x,
            'fall': height * (1 - x) - 1,
            'wave': 2.2 * math.sin(2 * math.pi * x) + x,
        }[shape]
        targets.append(round(y + (rng.uniform() - 0.5) * 1.2))
    moves = [0] + [targets[i] - targets[i - 1] for i in range(1, n)]
    # jamais plus de deux fois la même note d'affilée ; pas de saut de plus d'une quinte
    for i in range(2, n):
        if moves[i] == 0 and moves[i - 1] == 0:
            moves[i] = 1 if rng.uniform() < 0.5 else -1
    moves = [max(-4, min(4, m)) for m in moves]
    return r, moves


def realize(scale, mot, bar0, chords, start_idx, lo, hi, cadence=None):
    """Pose un motif sur des accords à partir du degré start_idx : temps forts sur des notes de l'accord."""
    r, moves = mot
    root, tones = chords[bar0 % len(chords)]
    idx = scale.chord_degrees_near(start_idx, root, tones)
    out = []
    lo_i, hi_i = scale.index_near(lo), scale.index_near(hi)
    for i, ((pos, dur), mv) in enumerate(zip(r, moves)):
        bar = bar0 + pos // 16
        root, tones = chords[bar % len(chords)]
        idx += mv
        if idx > hi_i:
            idx -= 2 * (idx - hi_i)
        if idx < lo_i:
            idx += 2 * (lo_i - idx)
        if pos % 8 == 0 or dur >= 6:
            idx = scale.chord_degrees_near(idx, root, tones, span=2)
        if i == len(r) - 1 and cadence:
            pcs = [(root + t) % 12 for t in tones]
            want = {'close': [scale.key % 12], 'open': [pcs[2], pcs[1]]}[cadence]
            for d in sorted(range(-4, 5), key=lambda x: (abs(x), x)):
                j = idx + d
                if 0 <= j < len(scale.notes) and scale.notes[j] % 12 in want:
                    idx = j
                    break
        out.append((bar * 16 + pos % 16, dur, scale.notes[idx]))
    if cadence and out:
        # la note finale tient jusqu'au bout de la phrase
        p, d, m = out[-1]
        end = (bar0 + 2) * 16
        out[-1] = (p, max(d, end - p - 1), m)
    return out


def section_melody(rng, scale, chords, bar0, style, center, rng_range=9):
    """8 mesures : motif, sa réponse transposée (fin ouverte), reprise du motif, conclusion qui descend sur la tonique."""
    lo, hi = center - rng_range, center + rng_range
    c = scale.index_near(center)
    m1 = motif(rng, style)
    tail = motif(rng, style, shape='fall')
    shift = int(rng.choice([2, 1, -1, 3]))
    notes = []
    notes += realize(scale, m1, bar0 + 0, chords, c, lo, hi)
    notes += realize(scale, m1, bar0 + 2, chords, c + shift, lo, hi, cadence='open')
    notes += realize(scale, m1, bar0 + 4, chords, c, lo, hi)
    notes += realize(scale, tail, bar0 + 6, chords, c + 1, lo, hi, cadence='close')
    return notes


def harmonize(scale, notes, below=True):
    """Seconde voix une tierce (diatonique) en dessous."""
    out = []
    for p, d, m in notes:
        i = scale.index_near(m)
        out.append((p, d, scale.notes[max(0, i - 2)] if below else scale.notes[i + 2]))
    return out


def sparse(notes):
    """Version longue et calme d'une mélodie (pour le pont)."""
    out = []
    for p, d, m in notes:
        if p % 8 == 0:
            out.append((p, 8, m))
    return out


# ------------------------------------------------------------------------------
# Accompagnement, basse, batterie
# ------------------------------------------------------------------------------


def voicing(root, tones, prev, lo=55, hi=72):
    """Accord à 3-4 voix, renversé pour rester proche du précédent (conduite des voix)."""
    pcs = [(root + t) % 12 for t in tones]
    best, best_cost = None, 1e9
    for base in range(lo - 12, hi):
        if base % 12 not in pcs:
            continue
        v = sorted({base + ((pc - base) % 12) for pc in pcs})
        if v[0] < lo - 2 or v[-1] > hi + 2:
            continue
        cost = abs(np.mean(v) - (np.mean(prev) if prev else (lo + hi) / 2))
        if cost < best_cost:
            best, best_cost = v, cost
    return best or [root + t for t in tones]


COMP = {
    # (position en doubles croches, durée, quelles notes : 'all' / index / 'up' arpège)
    'strum': [(0, 3, 'all'), (3, 3, 'all'), (6, 2, 'all'), (10, 2, 'all'), (12, 4, 'all')],
    'skank': [(2, 2, 'all'), (6, 2, 'all'), (10, 2, 'all'), (14, 2, 'all')],
    'pump8': [(i * 2, 2, 'all') for i in range(8)],
    'block': [(0, 16, 'all')],
    'half': [(0, 8, 'all'), (8, 8, 'all')],
    'oompah': [(4, 2, 'all'), (12, 2, 'all')],
    'arp8': [(i * 2, 2, i % 4) for i in range(8)],
    'arp16': [(i, 1, [0, 1, 2, 3, 2, 1][i % 6]) for i in range(16)],
    'alberti': [(i * 2, 2, [0, 2, 1, 2][i % 4]) for i in range(8)],
    'chug': [(i * 2, 2, 'all') for i in range(8)],
}

BASS = {
    # (pos, durée, rôle) : R fondamentale, F quinte, O octave, A approche vers l'accord suivant
    'bounce': [(0, 4, 'R'), (6, 2, 'F'), (8, 4, 'R'), (12, 2, 'F'), (14, 2, 'A')],
    'reggae': [(4, 2, 'R'), (7, 1, 'R'), (8, 4, 'F'), (12, 2, 'O'), (14, 2, 'A')],
    'oompah': [(0, 3, 'R'), (8, 3, 'F')],
    'long': [(0, 14, 'R'), (14, 2, 'A')],
    'pump': [(i * 2, 2, 'R' if i % 2 == 0 else 'O') for i in range(8)],
    'walk': [(0, 4, 'R'), (4, 4, 'F'), (8, 4, 'O'), (12, 4, 'A')],
    'chug': [(i * 2, 2, 'R') for i in range(8)],
    'gallop': [(0, 2, 'R'), (3, 1, 'R'), (4, 2, 'R'), (8, 2, 'R'), (11, 1, 'R'), (12, 2, 'F'), (14, 2, 'A')],
}


# ------------------------------------------------------------------------------
# Les 10 mondes
# ------------------------------------------------------------------------------

WORLDS = {
    1: dict(  # Le Parc : promenade joyeuse
        name='Le Parc', key=65, mode='major', bpm=124, swing=0.0, style='song',
        prog={'A': ['I', 'V', 'vi', 'IV'], 'B': ['IV', 'V', 'iii', 'vi', 'ii', 'V', 'I', 'Isus'], 'C': ['vi', 'IV', 'I', 'V', 'vi', 'IV', 'ii', 'Vsus']},
        lead='glock', lead2='whistle', counter='uke', comp=('uke', 'strum'), comp_c=('harp', 'arp8'), bass=('bass', 'bounce'), pad='strings',
        center=77,
        drums={'A': {'K': 'x.......x.x.....', 'C': '....x.......x...', 'x': 'x.x.x.x.x.x.x.x.'}, 'B': {'K': 'x.......x.x.....', 'C': '....x.......x...', 'x': 'xxxxxxxxxxxxxxxx', 'o': '..............x.'}, 'C': {'x': 'x.x.x.x.x.x.x.x.', 'K': 'x...............'}},
        fill='MMLL', mix=dict(lead=0.9, counter=0.35, comp=0.55, bass=0.9, pad=0.35, drums=0.8), reverb=0.22,
    ),
    2: dict(  # La Plage : calypso
        name='La Plage', key=60, mode='major', bpm=112, swing=0.1, style='dance',
        prog={'A': ['I', 'IV', 'V', 'IV'], 'B': ['vi', 'IV', 'I', 'V', 'vi', 'IV', 'ii', 'V'], 'C': ['IV', 'V', 'iii', 'vi', 'ii', 'V', 'I', 'bVII']},
        lead='steel', lead2='steel', counter='marimba', comp=('marimba', 'skank'), comp_c=('marimba', 'arp8'), bass=('bass', 'reggae'), pad='pad',
        center=74,
        drums={'A': {'K': 'x.....x...x.....', 'r': '...x..x....x..x.', 'x': 'x.xxx.xxx.xxx.xx', 'b': '......x.......x.', 'B': '.......x.x......'}, 'B': {'K': 'x.....x...x.....', 'r': '...x..x....x..x.', 'x': 'x.xxx.xxx.xxx.xx', 'b': '..x...x...x...x.', 'B': '.......x.x.x....'}, 'C': {'x': 'x.xxx.xxx.xxx.xx', 'b': '......x.......x.'}},
        fill='bbBB', mix=dict(lead=0.85, counter=0.45, comp=0.5, bass=0.95, pad=0.3, drums=0.75), reverb=0.25,
    ),
    3: dict(  # Le Marché : tarentelle animée
        name='Le Marché', key=62, mode='harmonic', bpm=144, swing=0.3, style='dance',
        prog={'A': ['i', 'iv', 'V', 'i'], 'B': ['bIII', 'bVII', 'i', 'V', 'bVI', 'iv', 'V', 'V7'], 'C': ['iv', 'i', 'V', 'i', 'bVI', 'iv', 'V', 'V7']},
        lead='accordion', lead2='fiddle', counter='mando', comp=('accordion', 'oompah'), comp_c=('accordion', 'half'), bass=('pizz', 'oompah'), pad=None,
        center=74,
        drums={'A': {'T': '..x...x...x...x.', 'K': 'x.......x.......'}, 'B': {'T': 'x.x.x.x.x.x.x.x.', 'K': 'x.......x.......', 'C': '....x.......x...'}, 'C': {'T': '..x...x...x...x.'}},
        fill='TTTT', mix=dict(lead=0.95, counter=0.45, comp=0.5, bass=0.9, pad=0.0, drums=0.65), reverb=0.18,
    ),
    4: dict(  # La Forêt : aventure mystérieuse
        name='La Forêt', key=64, mode='dorian', bpm=100, swing=0.0, style='song',
        prog={'A': ['i', 'IV', 'i', 'bVII'], 'B': ['bVI', 'bVII', 'i', 'i', 'iv', 'bVI', 'bVII', 'bVII'], 'C': ['iv', 'bVI', 'bIII', 'bVII', 'iv', 'bVI', 'v', 'v']},
        lead='flute', lead2='flute', counter='harp', comp=('harp', 'arp8'), comp_c=('harp', 'arp16'), bass=('bass', 'long'), pad='choir',
        center=76,
        drums={'A': {'L': 'x..x..x.x.......', 'w': '..x.......x..x..', 'x': 'x.x.x.x.x.x.x.x.'}, 'B': {'L': 'x..x..x.x..x....', 'M': '.........x....x.', 'w': '..x.......x..x..', 'x': 'xxxxxxxxxxxxxxxx', 'K': 'x.......x.......'}, 'C': {'w': '..x.......x.....', 'L': 'x...............'}},
        fill='HMLL', mix=dict(lead=0.95, counter=0.6, comp=0.5, bass=0.85, pad=0.5, drums=0.7), reverb=0.35,
    ),
    5: dict(  # Le Port : chant de marins
        name='Le Port', key=67, mode='major', bpm=118, swing=0.33, style='march',
        prog={'A': ['I', 'IV', 'I', 'V'], 'B': ['vi', 'IV', 'I', 'V', 'vi', 'IV', 'V', 'V'], 'C': ['IV', 'I', 'vi', 'V', 'IV', 'I', 'V', 'V7']},
        lead='fiddle', lead2='accordion', counter='accordion', comp=('accordion', 'oompah'), comp_c=('mando', 'arp8'), bass=('tuba', 'oompah'), pad=None,
        center=74,
        drums={'A': {'K': 'x.......x.......', 'C': '....x.......x...'}, 'B': {'K': 'x.......x.......', 'C': '....x.......x...', 'T': '..x...x...x...x.'}, 'C': {'K': 'x.......x.......'}},
        fill='KKCC', bell=True, mix=dict(lead=0.95, counter=0.45, comp=0.45, bass=0.85, pad=0.0, drums=0.8), reverb=0.24,
    ),
    6: dict(  # La Montagne : souffle épique
        name='La Montagne', key=62, mode='lydian', bpm=92, swing=0.0, style='calm',
        prog={'A': ['I', 'II', 'vi', 'IV'], 'B': ['IV', 'V', 'vi', 'iii', 'IV', 'V', 'I', 'I'], 'C': ['vi', 'IV', 'I', 'V', 'vi', 'IV', 'II', 'Vsus']},
        lead='horn', lead2='celesta', counter='celesta', comp=('strings', 'half'), comp_c=('celesta', 'arp16'), bass=('strings', 'long'), pad='choir',
        center=72,
        drums={'A': {'K': 'x...............', 'r': '........x.......', 'j': 'x.x.x.x.x.x.x.x.'}, 'B': {'K': 'x.....x.........', 'S': '........x.......', 'j': 'xxxxxxxxxxxxxxxx'}, 'C': {'j': 'x...x...x...x...'}},
        fill='PPPP', timpani=True, mix=dict(lead=0.95, counter=0.5, comp=0.55, bass=0.8, pad=0.55, drums=0.6), reverb=0.4,
    ),
    7: dict(  # Le Volcan : lourd et menaçant
        name='Le Volcan', key=61, mode='phrygian', bpm=152, swing=0.0, style='drive',
        prog={'A': ['i', 'bII', 'i', 'bVII'], 'B': ['iv', 'bVI', 'V', 'i', 'iv', 'bVI', 'bII', 'V'], 'C': ['bVI', 'bVII', 'i', 'i', 'bII', 'bII', 'V', 'V']},
        lead='brass', lead2='supersaw', counter='brass', comp=('power', 'chug'), comp_c=('power', 'half'), bass=('distbass', 'gallop'), pad='choir',
        center=73,
        drums={'A': {'K': 'x.....x.x.......', 'S': '....x.......x...', 'D': 'x.......x.......', 'h': 'x.x.x.x.x.x.x.x.'}, 'B': {'K': 'xx.xx.xxxx.xx.xx', 'S': '....x.......x...', 'D': 'x...x...x...x...', 'h': 'x.x.x.x.x.x.x.x.'}, 'C': {'D': 'x.......x.....x.', 'S': '............x...'}},
        fill='DDSS', mix=dict(lead=0.85, counter=0.4, comp=0.45, bass=0.75, pad=0.35, drums=0.9), reverb=0.2,
    ),
    8: dict(  # La Tempête : électrique
        name='La Tempête', key=59, mode='minor', bpm=160, swing=0.0, style='drive',
        prog={'A': ['i', 'bVI', 'bVII', 'i'], 'B': ['iv', 'v', 'bVI', 'bVII', 'iv', 'v', 'bVI', 'V'], 'C': ['bVI', 'bVII', 'bIII', 'V', 'bVI', 'bVII', 'V', 'V']},
        lead='supersaw', lead2='chip', counter='chip', comp=('chip', 'arp16'), comp_c=('pad', 'block'), bass=('synthbass', 'pump'), pad='pad',
        center=74,
        drums={'A': {'K': 'x.....x...x.....', 'S': '....x.......x...', 'h': 'xxxxxxxxxxxxxxxx'}, 'B': {'K': 'x.....x.x.x...x.', 'S': '....x..x....x...', 'h': 'xxxxxxxxxxxxxxxx', 'o': '..x...x...x...x.'}, 'C': {'K': 'x.........x.....', 'h': 'x.x.x.x.x.x.x.x.'}},
        fill='SSSS', thunder=True, duck=True, mix=dict(lead=0.8, counter=0.4, comp=0.4, bass=0.85, pad=0.4, drums=0.85), reverb=0.22,
    ),
    9: dict(  # Le Palais : fanfare royale
        name='Le Palais', key=58, mode='major', bpm=112, swing=0.0, style='march',
        prog={'A': ['I', 'IV', 'V', 'I', 'vi', 'ii', 'V', 'I'], 'B': ['iii', 'vi', 'ii', 'V', 'I', 'IV', 'V', 'V7'], 'C': ['vi', 'iii', 'IV', 'I', 'ii', 'V', 'I', 'V7']},
        lead='brass', lead2='harpsi', counter='harpsi', comp=('harpsi', 'alberti'), comp_c=('strings', 'half'), bass=('pizz', 'walk'), pad='strings',
        center=74,
        drums={'A': {'S': 'x..xx...x..xx.x.', 'P': 'x.......x.......'}, 'B': {'S': 'x.xxx.x.x.xxx.xx', 'P': 'x.......x.......', 'K': 'x.......x.......'}, 'C': {'S': '....x.......x...', 'P': 'x...............'}},
        fill='SSSS', timpani=True, mix=dict(lead=0.95, counter=0.45, comp=0.5, bass=0.85, pad=0.4, drums=0.6), reverb=0.32,
    ),
    10: dict(  # Le Cosmos : synthwave spatiale
        name='Le Cosmos', key=57, mode='minor', bpm=128, swing=0.0, style='song',
        prog={'A': ['i', 'bVI', 'bIII', 'bVII'], 'B': ['iv', 'bVI', 'bVII', 'V', 'iv', 'bVI', 'bVII', 'bVII'], 'C': ['bVI', 'bVII', 'i', 'i', 'iv', 'bVII', 'bIII', 'V']},
        lead='bell', lead2='supersaw', counter='chip', comp=('chip', 'arp16'), comp_c=('pad', 'block'), bass=('synthbass', 'pump'), pad='pad',
        center=76,
        drums={'A': {'K': 'x...x...x...x...', 'C': '....x.......x...', 'h': '..x...x...x...x.'}, 'B': {'K': 'x...x...x...x...', 'C': '....x.......x...', 'h': '..x...x...x...x.', 'x': 'xxxxxxxxxxxxxxxx'}, 'C': {'K': 'x.......x.......', 'h': '..x...x...x...x.'}},
        fill='HMLL', duck=True, echo=True, mix=dict(lead=0.85, counter=0.45, comp=0.4, bass=0.85, pad=0.55, drums=0.75), reverb=0.4,
    ),
}


# ------------------------------------------------------------------------------
# Rendu d'un monde
# ------------------------------------------------------------------------------


def render(wid):
    spec = WORLDS[wid]
    rng = np.random.default_rng(1000 + wid)
    beat = 60 / spec['bpm']
    sixteenth = beat / 4
    bars = 32
    loop = bars * 4 * beat
    tail = 2.5
    n_total = int(SR * (loop + tail))
    scale = Scale(spec['key'], spec['mode'])
    swing = spec['swing']

    def at(step):
        """Position (en s) d'une double croche, avec le swing sur les contretemps."""
        b, s = divmod(step, 4)
        frac = s / 4
        if swing:
            frac = frac * (1 + swing) if frac < 0.5 else 0.5 + swing / 2 + (frac - 0.5) * (1 - swing)
        return (b + frac) * beat

    buses = {k: np.zeros(n_total) for k in ('lead', 'counter', 'comp', 'bass', 'pad', 'drums', 'fx')}

    def add(bus, sig, t):
        i = int(round(t * SR))
        if i >= n_total:
            return
        m = min(len(sig), n_total - i)
        buses[bus][i : i + m] += sig[:m]

    def play(bus, inst, m, step, dur16, vel=0.8):
        dur = max(0.05, at(step + dur16) - at(step) - 0.01)
        add(bus, INSTRUMENTS[inst](m, dur, vel, rng), at(step))

    # Plan : A (8 mesures) · B (8) · A' (8) · C (8)
    def chords_of(name, n=8):
        p = spec['prog'][name]
        return [chord(p[i % len(p)], scale.key) for i in range(n)]

    plan = [('A', chords_of('A'), 0), ('B', chords_of('B'), 8), ("A'", chords_of('A'), 16), ('C', chords_of('C'), 24)]
    all_chords = []
    for _, ch, _ in plan:
        all_chords += ch

    center = spec['center']
    melody_a = section_melody(rng, scale, chords_of('A'), 0, spec['style'], center)
    melody_b = section_melody(rng, scale, chords_of('B'), 0, spec['style'], center + 3)
    melody_c = section_melody(rng, scale, chords_of('C'), 0, 'calm', center - 2)

    # --- mélodies
    for p, d, m in melody_a:
        play('lead', spec['lead'], m, p, d, 0.8)
    for p, d, m in melody_b:
        play('lead', spec['lead2'], m, 8 * 16 + p, d, 0.78)
    for p, d, m in melody_a:  # A' : le thème à l'octave, avec une seconde voix
        play('lead', spec['lead'], m + 12 if m + 12 <= 93 else m, 16 * 16 + p, d, 0.72)
        play('lead', spec['lead2'], m, 16 * 16 + p, d, 0.35)
    for p, d, m in harmonize(scale, melody_a):
        play('counter', spec['counter'], m, 16 * 16 + p, d, 0.5)
    for p, d, m in sparse(melody_c):
        play('lead', spec['lead2'], m, 24 * 16 + p, d, 0.6)

    # --- accompagnement (avec conduite des voix)
    prev = None
    for bar, (root, tones) in enumerate(all_chords):
        section = plan[bar // 8][0]
        inst, pattern = spec['comp_c'] if section == 'C' else spec['comp']
        v = voicing(root, tones, prev)
        prev = v
        light = section == 'A' and bar < 2
        for pos, dur, which in COMP[pattern]:
            if light and pos % 8:
                continue
            notes = v if which == 'all' else [v[which % len(v)] + (12 if isinstance(which, int) and which >= len(v) else 0)]
            for k, m in enumerate(notes):
                # léger décalage entre les cordes d'un accord gratté
                play('comp', inst, m, bar * 16 + pos, dur, 0.55 - 0.05 * k + (0.1 if pos == 0 else 0))
        if spec.get('pad') and section in ('B', "A'", 'C'):
            for m in v:
                play('pad', spec['pad'], m, bar * 16, 16, 0.5)

    # --- basse
    inst, pattern = spec['bass']
    for bar, (root, tones) in enumerate(all_chords):
        nroot, ntones = all_chords[(bar + 1) % len(all_chords)]
        r = 36 + (root - 36) % 12
        fifth = r + (tones[2] if len(tones) > 2 else 7)
        target = 36 + (nroot - 36) % 12
        approach = target - 1 if target - 1 != r else target + 2
        section = plan[bar // 8][0]
        pat = BASS['long'] if section == 'C' and pattern not in ('long',) else BASS[pattern]
        for pos, dur, role in pat:
            m = {'R': r, 'F': fifth, 'O': r + 12, 'A': approach}[role]
            play('bass', inst, m, bar * 16 + pos, dur, 0.55 if section == 'C' else 0.85)

    # --- batterie
    for bar in range(bars):
        section = plan[bar // 8][0].replace("'", '')
        groove = spec['drums']['B' if section == 'A' and bar >= 16 else section]
        if section == 'A' and bar < 16 and bar < 2:
            groove = {k: v for k, v in groove.items() if k in ('x', 'j', 'h', 'K', 'w', 'r', 'T')}
        last = bar % 8 == 7
        for name, pat in groove.items():
            for s, ch in enumerate(pat):
                if ch == '.':
                    continue
                if last and s >= 8:
                    continue  # place au break
                vel = 0.95 if s % 4 == 0 else 0.6 + 0.15 * rng.uniform()
                add('drums', DRUMS[name](vel, rng), at(bar * 16 + s))
        if last:
            fill = spec['fill']
            for i in range(8):
                add('drums', DRUMS[fill[i // 2]](0.55 + i * 0.05, rng), at(bar * 16 + 8 + i))
        if bar % 8 == 0 and bar > 0:
            add('drums', d_crash(0.9, rng), at(bar * 16))
            if spec.get('timpani'):
                add('drums', d_timpani(0.9, rng, m=scale.key - 24), at(bar * 16))
    if spec.get('bell'):
        for bar in (0, 8, 16, 24):
            add('fx', d_shipbell(0.5, rng), at(bar * 16 + 2))
    if spec.get('thunder'):
        add('fx', d_thunder(0.6, rng), at(24 * 16))
    # montée vers la reprise du début
    add('fx', d_riser(0.5, rng, dur=at(32 * 16) - at(30 * 16)), at(30 * 16))

    # --- mixage
    mix = spec['mix']
    out = np.zeros(n_total)
    send = np.zeros(n_total)
    for bus, sig in buses.items():
        g = mix.get(bus, 0.5)
        peak = np.max(np.abs(sig)) or 1
        s = sig / peak * g
        if bus == 'bass':
            s = lowpass(s, 900)
        if bus in ('comp', 'pad', 'counter'):
            s = highpass(s, 180)
        if bus == 'lead' and spec.get('echo'):
            d = int(SR * beat * 0.75)
            echo = np.zeros_like(s)
            echo[d:] = s[:-d] * 0.35
            echo[2 * d :] += s[: -2 * d] * 0.15
            s = s + echo
        out += s
        send += s * (0.35 if bus in ('lead', 'pad', 'counter', 'fx') else 0.15)
    # réverbération : bruit qui décroît (convolution par FFT)
    ir_n = int(SR * 1.8)
    t = taxis(ir_n)
    ir = lowpass(rng.standard_normal(ir_n), 5000) * np.exp(-t * 3.6)
    ir /= np.sqrt(np.sum(ir**2))
    size = 1 << (n_total + ir_n).bit_length()
    wet = np.fft.irfft(np.fft.rfft(send, size) * np.fft.rfft(ir, size), size)[:n_total]
    out = out + wet * spec['reverb'] * 2.2
    # pompe sur la grosse caisse (styles électroniques)
    if spec.get('duck'):
        duck = np.ones(n_total)
        for q in range(bars * 4):
            i = int(at(q * 4) * SR)
            m = min(int(SR * beat * 0.6), n_total - i)
            duck[i : i + m] = np.minimum(duck[i : i + m], 0.55 + 0.45 * (np.arange(m) / m) ** 0.5)
        out = out * (0.6 + 0.4 * duck)
    out = highpass(out, 35)
    # boucle sans couture : la queue (réverbération, notes tenues) revient au début
    n_loop = int(SR * loop)
    looped = out[:n_loop].copy()
    rest = out[n_loop:]
    looped[: len(rest)] += rest
    # même volume perçu d'un monde à l'autre : on vise un niveau moyen, puis on arrondit les crêtes
    rms = np.sqrt(np.mean(looped**2)) or 1
    looped = looped * (10 ** (-12 / 20) / rms)
    looped = np.tanh(looped * 1.25) / 1.25
    return looped * min(1.0, 0.95 / (np.max(np.abs(looped)) or 1)), spec


def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    ids = [int(a) for a in sys.argv[1:]] or list(WORLDS)
    for wid in ids:
        x, spec = render(wid)
        with tempfile.TemporaryDirectory() as tmp:
            wav = os.path.join(tmp, 'out.wav')
            write_wav(wav, x)
            out = os.path.join(OUT_DIR, f'world-{wid}.m4a')
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'aac', '-b:a', '48k', '-ac', '1', out], check=True)
        print(f"monde {wid} · {spec['name']} : {len(x) / SR:.1f} s, {os.path.getsize(out) // 1024} Ko → {out}")


if __name__ == '__main__':
    main()
