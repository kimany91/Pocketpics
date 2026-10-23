"""Sons des emotes de PocketPics (python3 scripts/generate-emote-sounds.py [id…]).

Tout est synthétisé ici (numpy seulement), rien sous licence :
 - une vraie petite « voix » : impulsions de glotte (forme de Rosenberg, avec
   tremblement, voix éraillée, souffle) passées dans une cascade de 5 formants
   (résonateurs de Klatt) qui suivent les voyelles et leurs consonnes ;
 - des bruits mis en forme (souffle, vapeur, éclaboussure, tonnerre, feu…),
   des cloches, des cordes pincées (Karplus-Strong), des anches d'accordéon ;
 - une petite réverbération (Schroeder) pour que la voix sonne dans une pièce ;
 - un volume égalisé : chaque son est ramené à la même intensité perçue
   (fenêtre de 300 ms, aigus un peu pondérés), puis adouci en crête.

Courts et légers : mono 16 bits, 16 kHz, 1,38 s au plus (45 Ko au plus).
Sortie : assets/sfx/emote/<id>.wav. `--check` écrit aussi un spectrogramme de
chaque son (et une planche de tous) dans le dossier donné par PP_SPECTRO.
"""
import math
import os
import sys
import wave

import numpy as np

SR = 16000
OUT = "assets/sfx/emote"
MAX_DUR = 1.38
rng = np.random.default_rng(2024)

# ----------------------------------------------------------------- outils


def n_of(dur):
    return int(round(SR * dur))


def t_axis(dur):
    return np.arange(n_of(dur)) / SR


def noise(n):
    return rng.standard_normal(n)


def track(points, n, smooth=False):
    """Courbe par morceaux [(t, valeur), …] → `n` échantillons (lissée en cosinus si `smooth`)."""
    ts = np.array([p[0] for p in points], dtype=float)
    vs = np.array([p[1] for p in points], dtype=float)
    x = np.arange(n) / SR
    if not smooth or len(points) < 2:
        return np.interp(x, ts, vs)
    i = np.clip(np.searchsorted(ts, x, side="right") - 1, 0, len(ts) - 2)
    span = np.maximum(ts[i + 1] - ts[i], 1e-9)
    u = np.clip((x - ts[i]) / span, 0, 1)
    u = 0.5 - 0.5 * np.cos(math.pi * u)
    return vs[i] + (vs[i + 1] - vs[i]) * u


def place(buf, sig, at, gain=1.0):
    i = n_of(at)
    if i >= len(buf):
        return buf
    n = min(len(sig), len(buf) - i)
    buf[i:i + n] += sig[:n] * gain
    return buf


def onepole_lp(x, f):
    """Passe-bas d'ordre 1 (f peut varier)."""
    f = np.broadcast_to(np.asarray(f, dtype=float), x.shape)
    a = np.exp(-2 * math.pi * np.clip(f, 10, SR * 0.45) / SR)
    y = np.empty_like(x)
    s = 0.0
    for i in range(len(x)):
        s = (1 - a[i]) * x[i] + a[i] * s
        y[i] = s
    return y


def biquad(x, kind, f, q=0.707):
    """Filtre RBJ (lp / hp / bp / peak) ; `f` et `q` peuvent varier dans le temps."""
    n = len(x)
    f = np.broadcast_to(np.asarray(f, dtype=float), (n,))
    q = np.broadcast_to(np.asarray(q, dtype=float), (n,))
    w0 = 2 * math.pi * np.clip(f, 20.0, SR * 0.45) / SR
    c, s = np.cos(w0), np.sin(w0)
    alpha = s / (2 * q)
    if kind == "lp":
        b0, b1, b2 = (1 - c) / 2, 1 - c, (1 - c) / 2
    elif kind == "hp":
        b0, b1, b2 = (1 + c) / 2, -(1 + c), (1 + c) / 2
    else:  # bp, gain 1 au centre
        b0, b1, b2 = alpha, np.zeros(n), -alpha
    a0, a1, a2 = 1 + alpha, -2 * c, 1 - alpha
    b0, b1, b2, a1, a2 = (np.broadcast_to(v / a0, (n,)) for v in (b0, b1, b2, a1, a2))
    y = np.empty(n)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(n):
        yi = b0[i] * x[i] + b1[i] * x1 + b2[i] * x2 - a1[i] * y1 - a2[i] * y2
        x2, x1, y2, y1 = x1, x[i], y1, yi
        y[i] = yi
    return y


def resonator(x, f, bw):
    """Résonateur de Klatt (gain 1 en continu) : une formante, fréquence et largeur variables."""
    n = len(x)
    f = np.broadcast_to(np.asarray(f, dtype=float), (n,))
    bw = np.broadcast_to(np.asarray(bw, dtype=float), (n,))
    T = 1 / SR
    C = -np.exp(-2 * math.pi * bw * T)
    B = 2 * np.exp(-math.pi * bw * T) * np.cos(2 * math.pi * np.clip(f, 30, SR * 0.47) * T)
    A = 1 - B - C
    y = np.empty(n)
    y1 = y2 = 0.0
    for i in range(n):
        yi = A[i] * x[i] + B[i] * y1 + C[i] * y2
        y2, y1 = y1, yi
        y[i] = yi
    return y


def env_adsr(n, a=0.01, d=0.05, s=0.7, r=0.08, dur=None):
    t = np.arange(n) / SR
    dur = dur if dur is not None else n / SR
    e = np.where(t < a, t / max(a, 1e-6), np.where(t < a + d, 1 - (1 - s) * (t - a) / max(d, 1e-6), s))
    e *= np.clip((dur - t) / max(r, 1e-6), 0, 1)
    return e


def reverb(x, mix=0.18, size=1.0, damp=0.35):
    """Petite réverbération de Schroeder : 4 peignes en parallèle, 2 passe-tout."""
    out = np.zeros(len(x))
    for d, g in ((0.0297, 0.77), (0.0371, 0.75), (0.0411, 0.73), (0.0437, 0.71)):
        D = max(1, int(d * size * SR))
        y = np.zeros(len(x))
        lp = 0.0
        for k in range(0, len(x), D):
            seg = x[k:k + D].copy()
            if k >= D:
                fb = y[k - D:k - D + len(seg)]
                # amorti : les aigus s'éteignent plus vite
                lp = fb * (1 - damp) + damp * np.concatenate([[fb[0]], fb[:-1]])
                seg += g * lp
            y[k:k + len(seg)] = seg
        out += y
    out /= 4
    for d, g in ((0.005, 0.7), (0.0017, 0.7)):
        D = max(1, int(d * SR))
        y = np.zeros(len(out))
        for i in range(len(out)):
            xd = out[i - D] if i >= D else 0.0
            yd = y[i - D] if i >= D else 0.0
            y[i] = -g * out[i] + xd + g * yd
        out = y
    return x * (1 - mix) + out * mix * 2.2


# ---------------------------------------------------------------- la voix

# Formantes (F1…F5, en Hz) et largeurs de bande, voix adulte moyenne.
VOWELS = {
    "a": ((780, 1250, 2550, 3500, 4200), (110, 110, 140, 200, 250)),
    "e": ((450, 1950, 2600, 3500, 4200), (70, 100, 140, 200, 250)),
    "è": ((600, 1750, 2550, 3500, 4200), (90, 100, 140, 200, 250)),
    "i": ((290, 2300, 3000, 3600, 4300), (60, 90, 150, 200, 250)),
    "o": ((480, 860, 2450, 3400, 4200), (80, 90, 140, 200, 250)),
    "ô": ((640, 1050, 2450, 3400, 4200), (100, 100, 140, 200, 250)),
    "u": ((310, 750, 2300, 3400, 4200), (60, 80, 130, 200, 250)),
    "eu": ((480, 1450, 2350, 3400, 4200), (80, 100, 140, 200, 250)),
    "y": ((290, 1800, 2200, 3400, 4200), (60, 90, 140, 200, 250)),
    # m / n : murmure nasal (premier pôle bas, tout le reste étouffé)
    "m": ((250, 1100, 2300, 3400, 4200), (60, 300, 400, 400, 400)),
    # « grr » : voyelle neutre, sombre
    "r": ((500, 1300, 2300, 3400, 4200), (120, 160, 200, 250, 300)),
}


def glottal(f0, oq=0.6, tense=0.5, jitter=0.01, shimmer=0.0, sub=0.0):
    """Impulsions de glotte (dérivée d'une onde de Rosenberg) qui suivent `f0`.

    `oq` : part ouverte du cycle ; `tense` : 0 voix douce, 1 voix serrée
    (fermeture brutale, plus d'aigus) ; `jitter`/`shimmer` : tremblement de la
    hauteur et de l'intensité d'un cycle à l'autre ; `sub` : sous-harmonique
    (un cycle sur deux plus faible : voix éraillée, grognement).
    """
    n = len(f0)
    # tremblement lent et cycle à cycle
    drift = onepole_lp(noise(n), 25) * 6
    f = f0 * (1 + jitter * drift)
    phase = np.cumsum(f) / SR
    cyc = np.floor(phase).astype(int)
    p = phase - cyc
    tp = oq * 0.68
    tn = oq - tp
    flow = np.where(p < tp, 0.5 * (1 - np.cos(math.pi * p / tp)), np.where(p < oq, np.cos(math.pi * (p - tp) / (2 * tn)), 0.0))
    # intensité par cycle : shimmer, et sous-harmonique (un cycle sur deux)
    ncyc = cyc.max() + 2
    amp_c = 1 + shimmer * rng.standard_normal(ncyc)
    if sub:
        amp_c *= np.where(np.arange(ncyc) % 2 == 0, 1.0, 1 - sub * 0.75)
    flow = flow * amp_c[cyc]
    d = np.diff(flow, prepend=0.0)
    # voix douce : les aigus tombent plus vite
    soft = onepole_lp(d, 1200 + 3800 * tense)
    out = soft * (1 - tense) + d * tense
    return out / (np.max(np.abs(out)) + 1e-9), flow


def vowel_tracks(points, n, scale=1.0):
    """[(t, 'a'), …] → 5 fréquences et 5 largeurs qui glissent d'une voyelle à l'autre."""
    fs, bs = [], []
    for k in range(5):
        fs.append(track([(t, VOWELS[v][0][k] * (scale if k < 4 else max(scale, 1.0))) for t, v in points], n, smooth=True))
        bs.append(track([(t, VOWELS[v][1][k]) for t, v in points], n, smooth=True))
    return fs, bs


def voice(dur, f0, vowels, amp, *, scale=1.0, breath=0.12, aspir=None, tense=0.5, oq=0.6, jitter=0.012, shimmer=0.03, sub=0.0, trill=0.0, trill_hz=27.0, vib=(0.0, 5.5), growl=0.0):
    """Une voix : hauteur `f0` [(t, Hz)], voyelles [(t, 'a')], intensité [(t, 0…1)].

    `scale` : taille du conduit (1,15 enfant / dessin animé, 0,75 gros animal) ;
    `breath` : souffle mêlé à la voix ; `aspir` [(t, 0…1)] : part de souffle
    pur (les « h ») ; `trill` : la voix claque vite (« rrr », lèvres « brrr ») ;
    `vib` : (profondeur, Hz) du vibrato ; `growl` : grondement rauque.
    """
    n = n_of(dur)
    f = track(f0, n, smooth=True)
    t = np.arange(n) / SR
    if vib[0]:
        f = f * (1 + vib[0] * np.sin(2 * math.pi * vib[1] * t + rng.uniform(0, 6)))
    src, flow = glottal(f, oq=oq, tense=tense, jitter=jitter + growl * 0.03, shimmer=shimmer + growl * 0.15, sub=sub + growl * 0.5)
    # souffle : en partie pulsé avec la glotte (plus naturel)
    nz = noise(n)
    pulsed = nz * (0.35 + flow)
    asp = track(aspir, n, smooth=True) if aspir else np.zeros(n)
    voiced = (1 - asp)
    s = src * voiced + breath * 0.5 * pulsed * voiced + asp * nz * 0.6
    if growl:
        # grondement : modulation lente et irrégulière, comme des cordes vocales qui frottent
        rough = onepole_lp(noise(n), 60) * 8
        s = s * (1 + growl * 0.6 * np.tanh(rough))
    fs, bs = vowel_tracks(vowels, n, scale)
    y = s
    for k in range(5):
        y = resonator(y, fs[k], bs[k] * (1 + growl * 0.5))
    # rayonnement aux lèvres : un peu d'aigus
    y = np.diff(y, prepend=0.0) * 0.5 + y * 0.5
    e = track(amp, n, smooth=True)
    if trill:
        tr = 0.5 + 0.5 * np.sin(2 * math.pi * trill_hz * t + 0.6 * np.sin(2 * math.pi * 3 * t))
        e = e * (1 - trill + trill * tr ** 1.5)
    out = y * e
    return out / (np.max(np.abs(out)) + 1e-9) * np.max(e)


def syllables(starts, length, peak=1.0, decay=0.08, attack=0.18):
    """Enveloppe de syllabes (« ha ha ha ») : [(t, amp), …], chacune un peu plus faible."""
    pts = [(0, 0)]
    for i, s in enumerate(starts):
        a = peak * max(0.2, 1 - decay * i)
        pts += [(s, 0), (s + length * attack, a), (s + length * 0.6, a * 0.75), (s + length, 0)]
    return pts


# --------------------------------------------------------- bruits et objets


def hiss(dur, kind, f, q=0.7, attack=0.005, decay=None, release=0.03):
    """Bruit filtré avec une enveloppe (décroissance exponentielle si `decay`)."""
    t = t_axis(dur)
    e = np.clip(t / max(attack, 1e-6), 0, 1) * np.clip((dur - t) / max(release, 1e-6), 0, 1)
    if decay:
        e *= np.exp(-t * decay)
    return biquad(noise(len(t)), kind, f, q) * e


def click(freq=2500, q=6, dur=0.025, decay=180):
    """Petit claquement : une impulsion qui fait sonner une résonance."""
    x = np.zeros(n_of(dur))
    x[0] = 1.0
    x[1:20] += noise(19) * 0.3
    return biquad(x, "bp", freq, q) * np.exp(-t_axis(dur) * decay) * q


def bell(freq, dur, amp=1.0, bright=1.0, decay=4.5):
    t = t_axis(dur)
    s = np.zeros_like(t)
    for ratio, a, d in ((1, 1, 1), (2.0, 0.5 * bright, 0.6), (2.76, 0.35 * bright, 0.45), (4.07, 0.2 * bright, 0.3), (5.4, 0.1 * bright, 0.2)):
        if freq * ratio < SR * 0.45:
            s += a * np.sin(2 * math.pi * freq * ratio * t + rng.uniform(0, 6)) * np.exp(-t * decay / (dur * d))
    return amp * s * np.clip(t / 0.002, 0, 1)


def chirp(f_from, f_to, dur, amp=1.0, shape="sin", curve=1.0):
    """Ton qui glisse de f_from à f_to (exponentiel), sinus ou dent de scie adoucie."""
    t = t_axis(dur)
    u = (t / dur) ** curve
    f = f_from * (f_to / f_from) ** u
    ph = 2 * math.pi * np.cumsum(f) / SR
    if shape == "saw":
        s = np.zeros_like(t)
        for k in range(1, 30):
            s += np.sin(k * ph) / k * (k * f < SR * 0.45)
    elif shape == "square":
        s = np.zeros_like(t)
        for k in range(1, 30, 2):
            s += np.sin(k * ph) / k * (k * f < SR * 0.45)
    else:
        s = np.sin(ph)
    return s * amp


def tone(freqs, dur, shape="saw", amp=1.0):
    """Accord de dents de scie (ou carrés) à bande limitée."""
    t = t_axis(dur)
    s = np.zeros_like(t)
    for f in freqs:
        ph = 2 * math.pi * f * t + rng.uniform(0, 6)
        for k in range(1, 40, 2 if shape == "square" else 1):
            if k * f >= SR * 0.45:
                break
            s += np.sin(k * ph) / k
    return s * amp / max(1, len(freqs))


def pluck(freq, dur, amp=1.0, bright=0.5):
    """Corde pincée (Karplus-Strong) : ukulélé, guitare."""
    n = n_of(dur)
    period = SR / freq
    D = int(period)
    frac_ = period - D
    buf = noise(D + 2) * 0.5
    buf = onepole_lp(buf, 1500 + 4000 * bright)
    out = np.zeros(n)
    line = list(buf[:D])
    prev = 0.0
    for i in range(n):
        x = line[i % D]
        out[i] = x
        nxt = line[(i + 1) % D]
        v = 0.996 * ((1 - frac_) * x + frac_ * nxt) * 0.5 + 0.5 * prev * 0.996
        prev = x
        line[i % D] = v
    return out * amp


def thump(f_from=110, f_to=40, dur=0.25, amp=1.0, decay=14):
    """Coup sourd (grosse caisse, cœur, choc) : un sinus qui tombe."""
    t = t_axis(dur)
    return chirp(f_from, f_to, dur, curve=0.4) * np.exp(-t * decay) * np.clip(t / 0.003, 0, 1) * amp


def knock(freq=180, dur=0.15, decay=28):
    """Coup bref dans les bas-médiums (s'entend même sur un petit haut-parleur)."""
    t = t_axis(dur)
    x = noise(len(t)) * np.exp(-t * 90)
    return biquad(x, "bp", freq, 1.6) * np.exp(-t * decay) * 4


def crackle(dur, rate=40, amp=1.0, f=2500, q=1.2):
    """Crépitement : de petits claquements au hasard (feu, étincelles)."""
    n = n_of(dur)
    x = np.zeros(n)
    k = int(rate * dur)
    for i in rng.integers(0, max(1, n - 1), k):
        x[i] += rng.uniform(-1, 1) * rng.uniform(0.3, 1)
    return biquad(x, "bp", f, q) * amp * 6


# ------------------------------------------------------------- finition

TARGET = 0.30  # intensité perçue visée (RMS pondéré, fenêtre de 300 ms ; les anciens sons allaient de 0,24 à 0,41)


def loudness(x):
    """Intensité perçue approchée : RMS max sur 300 ms, graves coupés, aigus un peu pondérés."""
    # graves coupés comme par un haut-parleur de téléphone
    w = biquad(x, "hp", 200, 0.7)
    w = w + 0.6 * biquad(w, "hp", 1800, 0.7)
    win = n_of(0.3)
    p = np.convolve(w ** 2, np.ones(win) / win, mode="valid") if len(w) > win else np.array([np.mean(w ** 2)])
    return float(np.sqrt(np.max(p)))


def finish(x, dur, room=0.0, target=TARGET, peak=0.93):
    """Coupe à `dur`, fondu au bout, réverbération, puis même intensité pour tous et crêtes adoucies."""
    dur = min(dur, MAX_DUR)
    n = n_of(dur)
    x = x[:n] if len(x) >= n else np.concatenate([x, np.zeros(n - len(x))])
    x = x - np.mean(x)
    x = biquad(x, "hp", 55, 0.7)
    if room:
        x = reverb(x, mix=room)
    x[: n_of(0.003)] *= np.linspace(0, 1, n_of(0.003))
    fade = n_of(0.04)
    x[-fade:] *= np.linspace(1, 0, fade) ** 2
    x = x / (np.max(np.abs(x)) + 1e-9)
    for _ in range(4):
        x = limit(x * target / (loudness(x) + 1e-9), peak)
    return x


def limit(x, peak=0.93, knee=0.6):
    """Limiteur doux : rien ne change sous `knee`, au-dessus les crêtes s'arrondissent jusqu'à `peak`."""
    a = np.abs(x)
    k = knee * peak
    over = a > k
    y = a.copy()
    y[over] = k + (peak - k) * np.tanh((a[over] - k) / (peak - k))
    return np.sign(x) * y


def save(name, x):
    os.makedirs(OUT, exist_ok=True)
    data = (np.clip(x, -1, 1) * 32767).astype("<i2").tobytes()
    path = os.path.join(OUT, f"{name}.wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data)
    print(f"{path} : {len(x) / SR:.2f} s, {os.path.getsize(path) / 1000:.1f} Ko, crête {np.max(np.abs(x)):.2f}, intensité {loudness(x):.3f}")


# ------------------------------------------------------------------ émotions


def make_lol():
    """Mort de rire : un vrai fou rire « HA-HA-HA-ha-ha-ha » (chaque « ha » est
    un coup de souffle puis une voyelle qui tombe), qui s'emballe, et la
    reprise d'air aiguë « hiii » de celui qui n'en peut plus."""
    dur = 1.36
    buf = np.zeros(n_of(dur))
    starts = [0.0, 0.19, 0.37, 0.54, 0.7, 0.85]
    for i, s in enumerate(starts):
        top = 360 - i * 14
        L = 0.16 - i * 0.008
        ha = voice(
            L,
            [(0, top * 0.92), (0.025, top * 1.06), (L, top * 0.78)],
            [(0, "a"), (L * 0.5, "a"), (L, "ô")],
            [(0, 0), (0.012, 0.55), (0.03, 1), (L * 0.55, 0.7), (L, 0)],
            aspir=[(0, 0.95), (0.028, 0.75), (0.045, 0.05), (L, 0.2)],
            scale=1.12,
            breath=0.35,
            tense=0.55,
            jitter=0.02,
        )
        place(buf, ha, s, 1.0 - i * 0.07)
    # reprise d'air : un « hiii » aigu, sifflé, presque sans voix
    inh = voice(0.3, [(0, 700), (0.3, 880)], [(0, "i"), (0.3, "i")], [(0, 0), (0.08, 0.6), (0.24, 0.5), (0.3, 0)], aspir=[(0, 0.8), (0.3, 0.6)], scale=1.2, breath=0.6, tense=0.3)
    place(buf, inh, 1.03, 0.75)
    return finish(buf, dur, room=0.12)


def make_cry():
    """Snif : des sanglots. Trois hoquets d'air saccadés (« h-h-hh »), une
    longue plainte « ouaaaain » dont la voix se casse, puis deux reniflements."""
    dur = 1.36
    buf = np.zeros(n_of(dur))
    for i, at in enumerate((0.0, 0.09, 0.17)):
        L = 0.07
        hic = voice(L, [(0, 520 + i * 40), (L, 600 + i * 40)], [(0, "eu"), (L, "eu")], [(0, 0), (0.012, 1), (L, 0)], aspir=[(0, 0.9), (L, 0.6)], scale=1.15, breath=0.6, tense=0.3)
        place(buf, hic, at, 0.55 + i * 0.1)
    L = 0.82
    wail = voice(
        L,
        [(0, 430), (0.08, 560), (0.3, 540), (0.45, 600), (0.5, 470), (0.6, 520), (0.82, 360)],
        [(0, "u"), (0.08, "a"), (0.45, "a"), (0.6, "è"), (0.82, "eu")],
        [(0, 0), (0.05, 0.9), (0.45, 1), (0.5, 0.6), (0.56, 0.95), (0.82, 0)],
        aspir=[(0, 0.3), (0.1, 0.12), (0.47, 0.25), (0.55, 0.1), (0.82, 0.3)],
        scale=1.15,
        breath=0.4,
        tense=0.65,
        jitter=0.03,
        shimmer=0.08,
        vib=(0.04, 7.5),
    )
    # la voix tremble en sanglotant
    tw = t_axis(L)
    wail *= 0.7 + 0.3 * np.sin(2 * math.pi * 6.5 * tw) ** 2
    place(buf, wail, 0.26)
    for at in (1.12, 1.24):
        sn = hiss(0.08, "bp", track([(0, 2200), (0.08, 3800)], n_of(0.08)), 2.5, attack=0.02, release=0.03)
        place(buf, sn, at, 0.5)
    return finish(buf, dur, room=0.14)


def make_angry():
    """Rage : un grognement « grrrRRAAH » qui monte (voix grave, éraillée, la
    langue qui roule), puis la vapeur sort des oreilles : bouilloire qui siffle
    et jet de vapeur « pschhh »."""
    dur = 1.36
    buf = np.zeros(n_of(dur))
    L = 0.78
    g = voice(
        L,
        [(0, 92), (0.4, 110), (0.55, 150), (0.78, 120)],
        [(0, "r"), (0.42, "eu"), (0.55, "a"), (0.78, "a")],
        [(0, 0), (0.08, 0.55), (0.42, 0.75), (0.55, 1), (0.7, 0.8), (0.78, 0)],
        scale=0.9,
        breath=0.3,
        tense=0.85,
        growl=0.9,
        trill=0.6,
        trill_hz=26,
    )
    place(buf, g, 0, 1.3)
    # bouilloire : sifflet qui monte et tremble
    L2 = 0.62
    t = t_axis(L2)
    wh = chirp(2300, 2900, L2, curve=0.6) * (1 + 0.15 * np.sin(2 * math.pi * 9 * t))
    wh *= np.clip(t / 0.12, 0, 1) * np.clip((L2 - t) / 0.12, 0, 1)
    wh += hiss(L2, "bp", 2600, 3, attack=0.1, release=0.1) * 0.6
    place(buf, wh, 0.8, 0.22)
    # jets de vapeur
    for at, a in ((0.8, 0.3), (1.02, 0.26)):
        ps = hiss(0.38, "hp", track([(0, 2500), (0.38, 4500)], n_of(0.38)), 0.7, attack=0.015, decay=5)
        place(buf, ps, at, a)
    return finish(buf, dur, room=0.08)


def make_puke():
    """Beurk : deux haut-le-cœur (« heuk ! heuk ! », gorge serrée), le gros
    « BLEUAAARGH » qui gargouille, puis l'éclaboussure par terre (flaque et gouttes)."""
    dur = 1.37
    buf = np.zeros(n_of(dur))
    for at, top in ((0.0, 210), (0.2, 230)):
        L = 0.12
        gag = voice(L, [(0, top), (0.03, top * 1.15), (L, top * 0.7)], [(0, "eu"), (L, "u")], [(0, 0), (0.008, 1), (0.06, 0.7), (L, 0)], aspir=[(0, 0.4), (0.02, 0.1), (L, 0.4)], tense=0.95, growl=0.5, breath=0.4)
        place(buf, gag, at, 0.75)
        place(buf, click(900, 3, 0.03, 120), at + 0.105, 0.25)
    L = 0.6
    hurl = voice(
        L,
        [(0, 170), (0.08, 150), (0.35, 120), (0.6, 90)],
        [(0, "eu"), (0.08, "a"), (0.35, "ô"), (0.6, "o")],
        [(0, 0), (0.03, 1), (0.4, 0.85), (0.6, 0)],
        aspir=[(0, 0.2), (0.6, 0.35)],
        scale=0.95,
        breath=0.5,
        tense=0.8,
        growl=1.0,
    )
    # gargouillis : l'intensité saute au hasard
    gurgle = onepole_lp(noise(len(hurl)), 35)
    hurl *= 0.55 + 0.45 * np.tanh(gurgle * 9) ** 2
    place(buf, hurl, 0.36)
    wet = hiss(0.55, "bp", track([(0, 600), (0.55, 350)], n_of(0.55)), 1.2, attack=0.03, release=0.1)
    place(buf, wet, 0.4, 0.3)
    # éclaboussure : choc liquide, puis des gouttes qui retombent
    splat = hiss(0.35, "lp", track([(0, 3500), (0.35, 500)], n_of(0.35)), 0.9, attack=0.003, decay=10)
    place(buf, splat, 0.98, 0.7)
    place(buf, thump(140, 60, 0.12, decay=30), 0.98, 0.6)
    for _ in range(9):
        at = rng.uniform(1.02, 1.3)
        f = rng.uniform(900, 2200)
        place(buf, chirp(f, f * 1.6, 0.035) * np.exp(-t_axis(0.035) * 70), at, rng.uniform(0.15, 0.35))
    return finish(buf, dur, room=0.08)


def make_disgust():
    """Dégoûté : « beuuurk » écœuré qui traîne et grince, puis la langue tirée
    qui fait un « blblbl » (pouet des lèvres)."""
    dur = 1.32
    buf = np.zeros(n_of(dur))
    L = 0.62
    b = voice(
        L,
        [(0, 260), (0.12, 240), (0.45, 175), (0.62, 140)],
        [(0, "m"), (0.04, "eu"), (0.42, "eu"), (0.62, "r")],
        [(0, 0), (0.03, 1), (0.45, 0.7), (0.62, 0)],
        scale=1.05,
        breath=0.2,
        tense=0.6,
        sub=0.3,
        trill=0.0,
    )
    tb = t_axis(L)
    b *= np.where(tb > 0.42, 0.75 + 0.25 * np.sin(2 * math.pi * 28 * tb), 1.0)  # le « rrr » final
    place(buf, b, 0)
    place(buf, click(1800, 4, 0.04, 100), 0.62, 0.5)  # le « k »
    # « blblbl » : bourdonnement des lèvres, claqué 30 fois par seconde
    L2 = 0.55
    t = t_axis(L2)
    src, _ = glottal(np.full(n_of(L2), 110.0), tense=0.9)
    lips = 0.5 + 0.5 * np.sign(np.sin(2 * math.pi * 31 * t))
    lips = onepole_lp(lips, 300)
    rasp = (src * 0.8 + noise(len(t)) * 0.4) * lips
    rasp = biquad(rasp, "lp", 1400, 0.8) + biquad(rasp, "bp", 600, 2) * 0.5
    rasp *= np.clip(t / 0.03, 0, 1) * np.clip((L2 - t) / 0.12, 0, 1)
    place(buf, rasp, 0.74, 1.1)
    return finish(buf, dur, room=0.08)


def make_scared():
    """Trouille : on retient son souffle d'un coup (« hhh ! »), puis une petite
    voix qui tremble de partout « ou-ou-ou-ouh » (vibrato rapide), et des dents qui claquent."""
    dur = 1.32
    buf = np.zeros(n_of(dur))
    L = 0.16
    gasp = hiss(L, "bp", track([(0, 1200), (L, 2600)], n_of(L)), 2.0, attack=0.1, release=0.02)
    place(buf, gasp, 0, 0.7)
    L = 0.95
    w = voice(
        L,
        [(0, 520), (0.1, 600), (0.7, 560), (0.95, 430)],
        [(0, "u"), (0.2, "o"), (0.6, "u"), (0.95, "u")],
        [(0, 0), (0.05, 0.9), (0.75, 0.85), (0.95, 0)],
        aspir=[(0, 0.3), (0.95, 0.3)],
        scale=1.15,
        breath=0.45,
        tense=0.35,
        jitter=0.03,
        vib=(0.07, 9.5),
    )
    tw = t_axis(L)
    w *= 0.55 + 0.45 * (0.5 + 0.5 * np.sin(2 * math.pi * 9.5 * tw)) ** 1.5
    place(buf, w, 0.18)
    for i in range(10):
        place(buf, click(2600 + rng.uniform(-300, 300), 5, 0.02, 220), 0.9 + i * 0.045 + rng.uniform(-0.006, 0.006), 0.25)
    return finish(buf, dur, room=0.1)


def make_shock():
    """Choqué : on aspire d'un coup (« HHH ! »), un coup de théâtre (accord de
    cuivres qui claque, coup sourd), puis « QUOI ?! » qui monte, incrédule."""
    dur = 1.3
    buf = np.zeros(n_of(dur))
    L = 0.2
    gasp = hiss(L, "bp", track([(0, 900), (L, 3200)], n_of(L)), 1.8, attack=0.15, release=0.015)
    place(buf, gasp, 0, 0.9)
    L = 0.75
    stab = tone([147, 175, 208, 247], L, "saw")
    stab = biquad(stab, "lp", track([(0, 4500), (0.2, 1600), (L, 600)], n_of(L)), 1.2)
    stab *= np.exp(-t_axis(L) * 4) * np.clip(t_axis(L) / 0.006, 0, 1)
    place(buf, stab, 0.19, 1.2)
    place(buf, thump(120, 45, 0.4, decay=8), 0.19, 1.0)
    L = 0.42
    q = voice(L, [(0, 200), (0.1, 230), (0.42, 420)], [(0, "u"), (0.08, "a"), (0.42, "a")], [(0, 0), (0.03, 1), (0.36, 0.9), (0.42, 0)], scale=1.1, breath=0.25, tense=0.7)
    place(buf, q, 0.62, 1.0)
    return finish(buf, dur, room=0.16)


def make_cold():
    """Gelé : le vent glacé qui siffle, un « brrrrr » (lèvres qui vibrent, voix
    qui grelotte), puis les dents qui claquent à toute vitesse."""
    dur = 1.36
    buf = np.zeros(n_of(dur))
    wind = hiss(dur, "bp", track([(0, 500), (0.4, 900), (0.8, 600), (1.36, 1000)], n_of(dur), smooth=True), 4, attack=0.3, release=0.3)
    place(buf, wind, 0, 0.1)
    L = 0.72
    brr = voice(L, [(0, 190), (0.2, 210), (0.72, 170)], [(0, "u"), (0.72, "u")], [(0, 0), (0.04, 1), (0.6, 0.8), (L, 0)], scale=1.0, breath=0.3, tense=0.5, trill=0.95, trill_hz=29, vib=(0.05, 8))
    place(buf, brr, 0.04)
    for i in range(16):
        at = 0.78 + i * 0.036 + rng.uniform(-0.004, 0.004)
        place(buf, click(2900 + rng.uniform(-400, 400), 6, 0.018, 260), at, rng.uniform(0.35, 0.6))
        place(buf, click(1400, 3, 0.015, 300), at + 0.002, 0.15)
    return finish(buf, dur, room=0.1)


def make_sleep():
    """Dodo : un gros ronflement qui vibre en inspirant (voile du palais qui
    claque), le souffle qui siffle en ressortant, et la bulle qui éclate."""
    dur = 1.36
    buf = np.zeros(n_of(dur))
    L = 0.62
    t = t_axis(L)
    snore = voice(L, [(0, 70), (L, 85)], [(0, "r"), (L, "ô")], [(0, 0), (0.25, 0.7), (0.5, 1), (L, 0)], aspir=[(0, 0.6), (L, 0.4)], scale=0.85, breath=0.6, growl=0.8, tense=0.3)
    flutter = 0.5 + 0.5 * np.sin(2 * math.pi * 32 * t) ** 3
    snore *= 0.4 + 0.6 * flutter
    place(buf, snore, 0, 1.4)
    L = 0.5
    t = t_axis(L)
    whistle = chirp(1500, 800, L, curve=0.8) * np.sin(math.pi * t / L) ** 1.5
    whistle += hiss(L, "bp", track([(0, 1400), (L, 900)], n_of(L)), 3, attack=0.06, release=0.1) * 0.3
    place(buf, whistle, 0.7, 0.3)
    pop = chirp(900, 2400, 0.03) * np.exp(-t_axis(0.03) * 120)
    place(buf, pop, 1.24, 0.8)
    place(buf, click(3000, 3, 0.02, 250), 1.24, 0.4)
    return finish(buf, dur, room=0.1)


def make_hot():
    """En feu : la tête s'enflamme d'un coup (« FWOUMP » qui monte), le feu
    crépite, la voix halète « hah… hah… hah » et une goutte de sueur grésille."""
    dur = 1.36
    buf = np.zeros(n_of(dur))
    L = 0.5
    t = t_axis(L)
    whoomp = biquad(noise(len(t)), "lp", track([(0, 180), (0.12, 2600), (L, 900)], n_of(L)), 0.9)
    whoomp *= np.clip(t / 0.08, 0, 1) * np.exp(-np.maximum(0, t - 0.1) * 4)
    place(buf, whoomp, 0, 1.1)
    place(buf, thump(80, 40, 0.3, decay=9), 0.02, 0.6)
    roar = hiss(dur, "bp", 500, 0.8, attack=0.15, release=0.2)
    place(buf, roar, 0.05, 0.12)
    place(buf, crackle(1.3, rate=55, f=2800, q=1.5), 0.05, 0.3)
    for i, at in enumerate((0.48, 0.74, 1.0)):
        L = 0.19
        pant = voice(L, [(0, 330), (L, 300)], [(0, "a"), (L, "è")], [(0, 0), (0.03, 1), (L, 0)], aspir=[(0, 0.9), (0.05, 0.7), (L, 0.85)], scale=1.1, breath=0.8)
        place(buf, pant, at, 1.2)
    sizzle = hiss(0.25, "hp", 4500, 0.7, attack=0.005, decay=10)
    place(buf, sizzle, 1.1, 0.45)
    return finish(buf, dur, room=0.06)


def make_love():
    """Amoureux : le cœur qui bat fort (« ba-boum, ba-boum »), un bisou qui
    claque (« mwah ! ») et un long soupir rêveur « aaah~ », avec des étincelles."""
    dur = 1.36
    buf = np.zeros(n_of(dur))
    for at in (0.0, 0.34):
        for dt, a in ((0.0, 0.9), (0.13, 0.75)):
            place(buf, thump(110, 50, 0.18, decay=18), at + dt, a)
            place(buf, knock(190, 0.12), at + dt, a * 0.8)
    L = 0.12
    mwah = voice(L, [(0, 380), (L, 330)], [(0, "m"), (0.03, "u"), (0.07, "a"), (L, "a")], [(0, 0), (0.02, 0.4), (0.05, 1), (L, 0)], scale=1.15, breath=0.3)
    place(buf, click(1800, 3, 0.02, 200), 0.66, 0.6)
    place(buf, mwah, 0.66, 0.7)
    L = 0.58
    sigh = voice(L, [(0, 420), (0.15, 460), (L, 330)], [(0, "a"), (L, "ô")], [(0, 0), (0.08, 0.9), (0.4, 0.7), (L, 0)], aspir=[(0, 0.4), (0.15, 0.25), (L, 0.5)], scale=1.18, breath=0.45, tense=0.25, vib=(0.035, 5.5))
    place(buf, sigh, 0.78)
    for i, f in enumerate((1568, 1976, 2349, 3136)):
        place(buf, bell(f, 0.5, 0.18, bright=0.3), 0.7 + i * 0.07)
    return finish(buf, dur, room=0.18)


def make_balloon():
    """Ballon : la tête gonfle à coups de pompe (« pff, pff, pff » et le
    caoutchouc qui couine de plus en plus aigu), puis BANG ! et la fête
    (sifflet de fête qui se déroule, confettis qui tintent)."""
    dur = 1.36
    buf = np.zeros(n_of(dur))
    for i, at in enumerate((0.0, 0.17, 0.34)):
        puff = hiss(0.12, "bp", 1400 + i * 300, 1.0, attack=0.02, decay=18)
        place(buf, puff, at, 0.6)
        L = 0.14
        t = t_axis(L)
        squeak = chirp(500 + i * 250, 700 + i * 300, L, shape="saw")
        squeak = biquad(squeak, "bp", 1800 + i * 400, 4) * (0.6 + 0.4 * np.sin(2 * math.pi * 40 * t))
        squeak *= np.sin(math.pi * t / L)
        place(buf, squeak, at + 0.03, 0.45)
    L = 0.06
    bang = noise(n_of(L)) * np.exp(-t_axis(L) * 70)
    place(buf, bang, 0.56, 2.2)
    place(buf, thump(160, 50, 0.2, decay=20), 0.56, 1.4)
    place(buf, hiss(0.3, "hp", 3000, 0.7, attack=0.002, decay=14), 0.57, 0.4)
    L = 0.4
    t = t_axis(L)
    horn = chirp(520, 470, L, shape="saw") * np.clip(t / 0.02, 0, 1) * np.clip((L - t) / 0.08, 0, 1)
    horn = biquad(horn, "bp", 1200, 1.2) * (1 + 0.2 * np.sin(2 * math.pi * 14 * t))
    place(buf, horn, 0.78, 0.6)
    for i in range(10):
        place(buf, bell(rng.uniform(2400, 4200), 0.25, 0.12, bright=0.2, decay=6), 0.66 + i * 0.06)
    return finish(buf, dur, room=0.12)


def make_cool():
    """Trop fort : les lunettes qui volent (« fwiiit »), se posent (« clac »),
    un « yeaaah » grave et nonchalant, et l'éclat qui brille (« ting ! »)."""
    dur = 1.3
    buf = np.zeros(n_of(dur))
    L = 0.26
    sw = hiss(L, "bp", track([(0, 600), (L, 4200)], n_of(L)), 1.6) * np.sin(math.pi * t_axis(L) / L) ** 2
    place(buf, sw, 0, 0.8)
    place(buf, click(3200, 4, 0.03, 160), 0.27, 0.8)
    place(buf, click(1500, 3, 0.03, 160), 0.29, 0.5)
    L = 0.62
    yeah = voice(L, [(0, 125), (0.15, 135), (L, 98)], [(0, "i"), (0.08, "è"), (0.25, "a"), (L, "a")], [(0, 0), (0.04, 0.9), (0.4, 0.8), (L, 0)], scale=0.92, breath=0.3, tense=0.5, growl=0.25, vib=(0.01, 5))
    place(buf, yeah, 0.38)
    place(buf, bell(2637, 0.6, 0.45, bright=0.6), 0.6)
    place(buf, bell(3951, 0.5, 0.25, bright=0.4), 0.63)
    return finish(buf, dur, room=0.14)


# ------------------------------------------------------------------ photo


def make_selfie():
    """Selfie : le flash se charge (petit sifflement qui monte), le déclencheur
    fait « clic-clac » (miroir qui bascule, rideau qui retombe), et le flash
    scintille."""
    dur = 1.0
    buf = np.zeros(n_of(dur))
    L = 0.32
    t = t_axis(L)
    whine = chirp(1800, 4200, L, curve=0.7) * (t / L) * 0.12
    place(buf, whine, 0)
    for at, f, a in ((0.34, 3400, 1.0), (0.4, 2100, 0.9), (0.47, 1300, 0.7)):
        place(buf, click(f, 5, 0.04, 150), at, a)
        place(buf, hiss(0.02, "hp", 4500, 0.8, attack=0.001, decay=200), at, 0.5 * a)
    place(buf, thump(220, 120, 0.06, decay=60), 0.4, 0.25)
    place(buf, bell(3520, 0.45, 0.3, bright=0.3), 0.5)
    return finish(buf, dur, room=0.1)


def reed(freq, dur, amp=1.0):
    """Anche d'accordéon musette : trois anches un peu désaccordées (ça bat), soufflet qui ondule."""
    t = t_axis(dur)
    s = np.zeros_like(t)
    for det in (-0.006, 0.0, 0.0065):
        ph = 2 * math.pi * freq * (1 + det) * t + rng.uniform(0, 6)
        for k in range(1, 18):
            if k * freq > SR * 0.45:
                break
            s += np.sin(k * ph) / k ** 1.1 * (1.0 if k % 2 else 0.6)
    s = biquad(s, "lp", 3000, 0.7)
    env = np.clip(t / 0.025, 0, 1) * np.clip((dur - t) / 0.05, 0, 1) * (1 + 0.08 * np.sin(2 * math.pi * 5 * t))
    return amp * s * env / 3


def make_eiffel():
    """Tour Eiffel : un petit air de valse à l'accordéon musette (« oum-pa-pa »
    à la basse), et les ampoules de la tour qui scintillent à la fin."""
    dur = 1.36
    buf = np.zeros(n_of(dur))
    notes = ((392, 0.0, 0.18), (523, 0.19, 0.18), (659, 0.38, 0.3), (587, 0.7, 0.16), (523, 0.87, 0.45))
    for f, at, d in notes:
        place(buf, reed(f, d, 0.6), at)
    for f, at in ((131, 0.0), (330, 0.19), (330, 0.38), (98, 0.57), (294, 0.76), (131, 0.87)):
        place(buf, reed(f, 0.17, 0.3), at)
    for i in range(7):
        place(buf, bell(rng.uniform(2600, 4200), 0.3, 0.14, bright=0.3), 0.92 + i * 0.06)
    return finish(buf, dur, room=0.15)


def make_dog():
    """Léchouille : « OUAF ! » (aboiement sec et rauque), puis la langue qui
    lape l'écran, bien mouillée (« slurp, slurp, slurp »)."""
    dur = 1.34
    buf = np.zeros(n_of(dur))
    L = 0.2
    woof = voice(L, [(0, 520), (0.03, 560), (L, 300)], [(0, "u"), (0.03, "a"), (L, "ô")], [(0, 0), (0.01, 1), (0.08, 0.8), (L, 0)], aspir=[(0, 0.5), (0.03, 0.15), (L, 0.5)], scale=0.95, breath=0.5, tense=0.9, growl=0.5)
    place(buf, woof, 0.0, 1.1)
    place(buf, woof * 0.7, 0.22, 0.6)
    for at in (0.52, 0.78, 1.04):
        L = 0.2
        t = t_axis(L)
        lap = biquad(noise(len(t)), "bp", track([(0, 500), (L, 1800)], n_of(L)), 4)
        lap *= np.sin(math.pi * t / L) * (0.6 + 0.4 * np.sin(2 * math.pi * 45 * t))
        place(buf, lap, at, 1.0)
        place(buf, click(2200, 5, 0.03, 150), at + 0.17, 0.5)
        for _ in range(2):
            f = rng.uniform(700, 1500)
            place(buf, chirp(f, f * 1.8, 0.03) * np.exp(-t_axis(0.03) * 80), at + rng.uniform(0.05, 0.18), 0.25)
    return finish(buf, dur, room=0.08)


def make_cat():
    """Miaou : « mi-aaa-ou » d'un chat (murmure du « m », voix fine qui monte
    puis redescend en traînant), suivi d'un petit ronron."""
    dur = 1.36
    buf = np.zeros(n_of(dur))
    L = 0.9
    meow = voice(
        L,
        [(0, 560), (0.12, 760), (0.4, 880), (0.7, 700), (L, 520)],
        [(0, "m"), (0.06, "i"), (0.22, "è"), (0.45, "a"), (0.7, "o"), (L, "u")],
        [(0, 0), (0.04, 0.5), (0.12, 1), (0.6, 0.9), (L, 0)],
        aspir=[(0, 0.1), (0.7, 0.15), (L, 0.4)],
        scale=1.35,
        breath=0.25,
        tense=0.6,
        vib=(0.02, 6),
    )
    place(buf, meow, 0.02)
    L = 0.42
    t = t_axis(L)
    purr = voice(L, [(0, 26), (L, 24)], [(0, "u"), (L, "u")], [(0, 0), (0.1, 1), (L, 0)], aspir=[(0, 0.5), (L, 0.5)], scale=1.0, breath=0.6, tense=0.9)
    purr *= 0.4 + 0.6 * (0.5 + 0.5 * np.sin(2 * math.pi * 2.2 * t))
    place(buf, purr, 0.92, 0.7)
    return finish(buf, dur, room=0.1)


def make_car():
    """Tut tut : un klaxon de petite voiture (deux notes en même temps, nasal),
    deux coups « tut-tut », puis la voiture rebondit sur ses ressorts (« boïng-boïng »)."""
    dur = 1.32
    buf = np.zeros(n_of(dur))
    for at, L in ((0.0, 0.16), (0.22, 0.26)):
        t = t_axis(L)
        h = tone([415, 523], L, "square")
        h = biquad(h, "bp", 1100, 0.9) + biquad(h, "lp", 2600, 0.8) * 0.4
        h *= np.clip(t / 0.008, 0, 1) * np.clip((L - t) / 0.02, 0, 1)
        place(buf, h, at, 1.0)
    for at, f in ((0.58, 210), (0.92, 250)):
        L = 0.36
        t = t_axis(L)
        wob = f * (1 + 0.35 * np.sin(2 * math.pi * 16 * t) * np.exp(-t * 7) + 0.15 * (t / L))
        boing = np.sin(2 * math.pi * np.cumsum(wob) / SR) * np.exp(-t * 7) * np.clip(t / 0.004, 0, 1)
        place(buf, boing, at, 0.8)
        place(buf, click(600, 2, 0.04, 90), at, 0.5)
    return finish(buf, dur, room=0.08)


# ------------------------------------------------------------- aventure


def make_beach():
    """Noix de coco : un ukulélé qui gratte (deux accords d'été), la vague
    qui roule, et un joyeux « You-hou ! » de vacances."""
    dur = 1.36
    buf = np.zeros(n_of(dur))
    wave_ = hiss(1.2, "lp", track([(0, 400), (0.6, 1500), (1.2, 500)], n_of(1.2), smooth=True), 0.7, attack=0.45, release=0.5)
    place(buf, wave_, 0.1, 0.35)
    for at, chord in ((0.0, (392, 523, 659, 880)), (0.32, (440, 587, 698, 880))):
        for i, f in enumerate(chord):
            place(buf, pluck(f, 0.7, bright=0.6), at + i * 0.018, 0.45)
    for at, (a, b), vw in ((0.62, (560, 640), "u"), (0.86, (720, 560), "u")):
        L = 0.24 if at < 0.8 else 0.36
        v = voice(L, [(0, a), (L, b)], [(0, "y" if at < 0.8 else "u"), (L, "u")], [(0, 0), (0.025, 1), (L * 0.6, 0.8), (L, 0)], aspir=[(0, 0.6), (0.04, 0.1), (L, 0.2)], scale=1.2, breath=0.3, tense=0.55, vib=(0.02, 6))
        place(buf, v, at)
    return finish(buf, dur, room=0.14)


def make_cow():
    """Meuh : un long « mmmeuuuh » de vache (murmure fermé, puis la bouche
    s'ouvre, voix grave qui monte et retombe), et elle mâche son herbe (« crountch »)."""
    dur = 1.36
    buf = np.zeros(n_of(dur))
    L = 1.0
    moo = voice(
        L,
        [(0, 110), (0.2, 135), (0.55, 150), (0.85, 120), (L, 100)],
        [(0, "m"), (0.16, "m"), (0.3, "eu"), (0.65, "ô"), (L, "u")],
        [(0, 0), (0.06, 0.45), (0.25, 0.8), (0.55, 1), (0.85, 0.6), (L, 0)],
        aspir=[(0, 0.1), (0.8, 0.15), (L, 0.4)],
        scale=0.78,
        breath=0.35,
        tense=0.75,
        growl=0.2,
        vib=(0.015, 4),
    )
    place(buf, moo, 0, 1.3)
    for at in (1.04, 1.2):
        crunch = crackle(0.12, rate=180, f=2600, q=0.9) * np.exp(-t_axis(0.12) * 14)
        crunch += hiss(0.12, "bp", 1200, 1.5, attack=0.004, decay=18) * 0.5
        place(buf, crunch, at, 0.3)
    return finish(buf, dur, room=0.1)


def make_boat():
    """Ohé ! : la mer qui clapote, la grosse corne du bateau (« POUUUUH », deux
    notes graves qui vibrent), puis la cloche du bord « ding-ding »."""
    dur = 1.36
    buf = np.zeros(n_of(dur))
    t = t_axis(dur)
    lap = biquad(noise(len(t)), "lp", 700, 0.8) * (0.5 + 0.5 * np.sin(2 * math.pi * 1.6 * t) ** 2)
    place(buf, lap, 0, 0.25)
    L = 0.85
    tl = t_axis(L)
    f = np.array([98.0, 147.0])
    horn = np.zeros(n_of(L))
    for ff in f:
        pitch = ff * (1 - 0.06 * np.exp(-tl * 18))  # le petit glissé au départ
        ph = 2 * math.pi * np.cumsum(pitch) / SR
        for k in range(1, 30):
            if k * ff > SR * 0.45:
                break
            horn += np.sin(k * ph) / k
    horn = resonator(horn, 520, 120) + resonator(horn, 1100, 200) * 0.6
    horn *= np.clip(tl / 0.06, 0, 1) * np.clip((L - tl) / 0.15, 0, 1) * (1 + 0.04 * np.sin(2 * math.pi * 5 * tl))
    place(buf, horn, 0.02, 1.0)
    for at in (0.94, 1.12):
        place(buf, bell(1320, 0.4, 0.5, bright=0.7, decay=5), at)
    return finish(buf, dur, room=0.16)


def make_bear():
    """Ours polaire : un énorme rugissement qui gronde dans la poitrine, monte,
    s'ouvre (« ROOOAAARRR ») et retombe, avec du souffle et la voix qui racle."""
    dur = 1.36
    buf = np.zeros(n_of(dur))
    L = 1.25
    roar = voice(
        L,
        [(0, 70), (0.25, 88), (0.6, 105), (0.95, 85), (L, 62)],
        [(0, "r"), (0.2, "o"), (0.45, "ô"), (0.75, "a"), (L, "r")],
        [(0, 0), (0.12, 0.6), (0.45, 0.9), (0.75, 1), (1.05, 0.6), (L, 0)],
        aspir=[(0, 0.4), (0.4, 0.25), (L, 0.45)],
        scale=0.78,
        breath=0.7,
        tense=0.95,
        growl=1.0,
        sub=0.4,
    )
    place(buf, roar, 0.02)
    place(buf, knock(150, 0.3, decay=10), 0.0, 0.5)
    return finish(buf, dur, room=0.16)


def make_storm():
    """Orage : le nuage gronde, l'éclair claque (craquement sec et grésillement
    électrique), puis le tonnerre roule longtemps."""
    dur = 1.36
    buf = np.zeros(n_of(dur))
    L = 0.45
    grr = biquad(noise(n_of(L)), "lp", 160, 0.9) * np.clip(t_axis(L) / 0.3, 0, 1)
    grr *= 0.6 + 0.4 * np.tanh(onepole_lp(noise(n_of(L)), 8) * 12)
    place(buf, grr, 0, 1.4)
    L = 0.22
    t = t_axis(L)
    crack = noise(n_of(L)) * np.exp(-t * 35)
    crack = crack + biquad(noise(n_of(L)), "hp", 3000, 0.7) * np.exp(-t * 14) * 0.8
    place(buf, crack, 0.4, 1.4)
    zap = tone([120, 180], 0.25, "saw") * (0.5 + 0.5 * np.sign(np.sin(2 * math.pi * 60 * t_axis(0.25)))) * np.exp(-t_axis(0.25) * 10)
    place(buf, biquad(zap, "hp", 400, 0.7), 0.4, 0.5)
    place(buf, crackle(0.35, rate=120, f=4200, q=0.9) * np.exp(-t_axis(0.35) * 8), 0.42, 0.5)
    L = 0.95
    t = t_axis(L)
    rumble = biquad(noise(n_of(L)), "lp", track([(0, 600), (0.2, 260), (L, 120)], n_of(L)), 0.8)
    swell = 0.5 + 0.5 * np.tanh(onepole_lp(noise(n_of(L)), 6) * 14)
    rumble *= np.clip(t / 0.02, 0, 1) * np.exp(-t * 2.2) * (0.5 + 0.7 * swell)
    place(buf, rumble, 0.43, 2.2)
    place(buf, biquad(crackle(0.8, rate=70, f=700, q=0.8), "lp", 1500, 0.7) * np.exp(-t_axis(0.8) * 3), 0.45, 0.6)
    return finish(buf, dur, room=0.2)


def make_robot():
    """Bug : un robot fait « bip-boup », puis il beugue (son haché qui
    bégaye), crépite d'électricité (bzzt, étincelles) et s'éteint (le moteur
    qui ralentit jusqu'au silence, « clonk »)."""
    dur = 1.36
    buf = np.zeros(n_of(dur))
    for at, f, L in ((0.0, 988, 0.08), (0.1, 1319, 0.08), (0.2, 784, 0.1)):
        b = tone([f], L, "square") * np.clip((L - t_axis(L)) / 0.01, 0, 1)
        place(buf, biquad(b, "lp", 3500, 0.7), at, 0.55)
    # le bégaiement : le même bout de son répété, de plus en plus court, écrasé en 8 niveaux
    grain = tone([660], 0.05, "square") * np.hanning(n_of(0.05))
    at = 0.34
    for k in range(9):
        g = grain[: max(80, len(grain) - k * 70)]
        g = np.round(g * 4) / 4
        place(buf, g, at, 0.5)
        at += len(g) / SR + 0.012
    L = 0.32
    buzz = tone([100], L, "saw") * (0.5 + 0.5 * np.sign(np.sin(2 * math.pi * 13 * t_axis(L))))
    place(buf, biquad(buzz, "bp", 1200, 0.8) * np.exp(-t_axis(L) * 3), 0.52, 0.8)
    place(buf, crackle(0.4, rate=90, f=4500, q=1.0), 0.5, 0.45)
    for at in (0.55, 0.66, 0.74):
        place(buf, hiss(0.05, "hp", 3500, 0.7, attack=0.001, decay=60), at, 0.6)
    L = 0.5
    t = t_axis(L)
    down = chirp(700, 35, L, shape="saw", curve=0.7)
    down = biquad(down, "lp", track([(0, 3000), (L, 300)], n_of(L)), 1.5) * np.clip((L - t) / 0.08, 0, 1)
    place(buf, down, 0.8, 0.8)
    place(buf, thump(180, 60, 0.12, decay=30), 1.27, 0.7)
    place(buf, click(800, 3, 0.04, 100), 1.27, 0.5)
    return finish(buf, dur, room=0.06)


def make_portrait():
    """Grand Portrait : le souffle monte (aspiration à l'envers), le cadre
    explose (énorme coup sourd qui chute, verre qui vole en éclats), et le
    spectre hurle : un cri fantomatique à deux voix qui tremble, dans une
    grande salle, porté par une onde de choc."""
    dur = 1.38
    buf = np.zeros(n_of(dur))
    L = 0.3
    t = t_axis(L)
    rise = hiss(L, "bp", track([(0, 300), (L, 3500)], n_of(L)), 1.2, attack=L * 0.9, release=0.01)
    rise += chirp(60, 220, L, shape="saw") * (t / L) ** 2 * 0.3
    place(buf, rise, 0, 0.9)
    place(buf, thump(95, 28, 0.9, decay=3.2), 0.3, 1.8)
    place(buf, knock(170, 0.4, decay=9), 0.3, 1.0)
    boom = biquad(noise(n_of(0.6)), "lp", track([(0, 2500), (0.6, 150)], n_of(0.6)), 0.8) * np.exp(-t_axis(0.6) * 6)
    place(buf, boom, 0.3, 1.0)
    for _ in range(26):
        place(buf, bell(rng.uniform(2800, 6800), 0.18, 0.12, bright=0.2, decay=8), 0.3 + rng.uniform(0, 0.28))
    place(buf, hiss(0.3, "hp", 4000, 0.7, attack=0.001, decay=12), 0.3, 0.5)
    L = 0.95
    scream = voice(
        L,
        [(0, 470), (0.1, 690), (0.5, 760), (0.8, 620), (L, 420)],
        [(0, "a"), (0.3, "a"), (0.55, "è"), (0.8, "a"), (L, "ô")],
        [(0, 0), (0.06, 1), (0.6, 0.9), (L, 0)],
        aspir=[(0, 0.3), (0.2, 0.2), (L, 0.5)],
        scale=1.12,
        breath=0.5,
        tense=0.8,
        jitter=0.02,
        vib=(0.05, 6.5),
        growl=0.2,
    )
    ghost = voice(L, [(0, 235), (0.1, 345), (0.5, 380), (0.8, 310), (L, 210)], [(0, "o"), (0.5, "ô"), (L, "o")], [(0, 0), (0.08, 1), (0.6, 0.9), (L, 0)], scale=0.85, breath=0.5, tense=0.6, vib=(0.05, 6.1), growl=0.4)
    place(buf, scream, 0.36, 0.9)
    place(buf, ghost, 0.37, 0.55)
    return finish(buf, dur, room=0.3)


SOUNDS = (
    ("lol", make_lol),
    ("cry", make_cry),
    ("angry", make_angry),
    ("puke", make_puke),
    ("disgust", make_disgust),
    ("scared", make_scared),
    ("shock", make_shock),
    ("cold", make_cold),
    ("sleep", make_sleep),
    ("hot", make_hot),
    ("love", make_love),
    ("balloon", make_balloon),
    ("cool", make_cool),
    ("selfie", make_selfie),
    ("eiffel", make_eiffel),
    ("dog", make_dog),
    ("cat", make_cat),
    ("car", make_car),
    ("beach", make_beach),
    ("cow", make_cow),
    ("boat", make_boat),
    ("bear", make_bear),
    ("storm", make_storm),
    ("robot", make_robot),
    ("portrait", make_portrait),
)


# ------------------------------------------------------- vérification


def spectrogram_png(sounds, path):
    """Planche des spectrogrammes (0 → 8 kHz, en dB) avec la forme d'onde, pour vérifier à l'œil."""
    from PIL import Image, ImageDraw

    cols = 3
    W, H = 420, 170
    rows = math.ceil(len(sounds) / cols)
    img = Image.new("RGB", (cols * W, rows * H), (12, 12, 18))
    dr = ImageDraw.Draw(img)
    for i, (name, x) in enumerate(sounds):
        nfft, hop = 512, 96
        win = np.hanning(nfft)
        frames = [x[k:k + nfft] * win for k in range(0, max(1, len(x) - nfft), hop)]
        S = np.abs(np.fft.rfft(np.array(frames), axis=1)).T
        S = 20 * np.log10(S + 1e-6)
        S = np.clip((S - (S.max() - 70)) / 70, 0, 1)
        S = S[::-1]
        heat = np.stack([np.clip(S * 3 - 0.0, 0, 1), np.clip(S * 3 - 1, 0, 1), np.clip(S * 3 - 2, 0, 1) * 0.6 + S * 0.4], -1)
        im = Image.fromarray((heat * 255).astype("uint8")).resize((W - 10, H - 50))
        ox, oy = (i % cols) * W + 5, (i // cols) * H + 20
        img.paste(im, (ox, oy))
        wav = np.abs(x)
        step = max(1, len(wav) // (W - 10))
        for k in range(W - 10):
            a = float(np.max(wav[k * step:(k + 1) * step])) if k * step < len(wav) else 0
            dr.line([(ox + k, oy + H - 30), (ox + k, oy + H - 30 - a * 22)], fill=(120, 200, 255))
        dr.text((ox, oy - 16), f"{name}  {len(x) / SR:.2f}s  L={loudness(x):.3f}", fill=(255, 255, 255))
    img.save(path)
    print("planche :", path)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    only = set(args)
    made = []
    for name, fn in SOUNDS:
        if not only or name in only:
            x = fn()
            save(name, x)
            made.append((name, x))
    if "--check" in sys.argv:
        spectrogram_png(made, os.path.join(os.environ.get("PP_SPECTRO", "."), "emote-spectro.png"))
