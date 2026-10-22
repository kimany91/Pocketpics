"""
Reconnaissance de la photo : prépare le modèle TinyCLIP (encodeur d'images
seulement) et la table des textes du vocabulaire (src/game/recognize/vocabV2.ts).

Modèle : TinyCLIP ViT-40M/32 Text-19M, entraîné sur LAION-400M (Microsoft,
licence MIT, https://github.com/microsoft/Cream/tree/main/TinyCLIP). C'est un
CLIP réduit par distillation : 40 M de paramètres pour l'image (OpenAI CLIP
ViT-B/32 : 88 M), 59,8 % en zéro-shot sur ImageNet (ViT-B/32 : 63 %).

Ce que le script écrit dans assets/clip/ :
  - tinyclip-vit-40m-32-int8.tflite : l'encodeur d'images pour Android / iOS
    (poids int8, calcul en float) ; entrée 224 × 224 × 3 en RGB 0..1, sortie
    le vecteur de l'image (512, normé) ;
  - tinyclip-web.json + tinyclip-web.N.bin : les mêmes poids pour le navigateur
    (int8 par canal de sortie + échelles), coupés en morceaux de moins de 14 Mo ;
  - clip-labels.bin + clip-labels.json : le vecteur de chaque label (float16),
    dans l'ordre de VOCAB : moyenne des vecteurs (normés) de ses phrases
    anglaises (« a dog », « a small bird perched on a branch »…) et, sauf
    pour les captures d'écran, des mêmes phrases dans « a photo of {}. » et
    « a phone photo of {}. ». Chaque label y est nommé par sa première phrase.
    (Mesuré sur 300 photos de galerie : ces deux modèles de phrase en plus
    font +3 points de catégorie juste ; voir le README.)

Puis il compare, sur des images sans risque, le modèle d'origine (PyTorch,
float32) aux versions TFLite et navigateur : même label en tête. Mesuré sur 320
images (illustrations du jeu, échantillon ImageNet, photos de test) : TFLite
int8 304/320 (même catégorie : 225/230 hors illustrations), navigateur 313/320.
En float16, tout concorde, mais chaque fichier pèserait 80 Mo au lieu de 40.

    python3 -m venv /tmp/venv && /tmp/venv/bin/pip install torch open_clip_torch tensorflow pillow
    /tmp/venv/bin/python scripts/convert-clip-model.py [--labels-only] [--out DOSSIER] [dossier-d-images-de-test]

--labels-only : seulement la table des labels (après un changement du
vocabulaire ; le modèle ne change pas, TensorFlow n'est pas nécessaire).
--out : écrit ailleurs que dans assets/clip (pour comparer).

Le poids d'origine (168 Mo) est téléchargé une fois dans /tmp/clip-cache.
"""
import glob
import hashlib
import json
import os
import subprocess
import sys
import urllib.request

import numpy as np

args = sys.argv[1:]
LABELS_ONLY = '--labels-only' in args
OUT_ARG = args[args.index('--out') + 1] if '--out' in args else None
TEST_DIRS = [a for i, a in enumerate(args) if not a.startswith('--') and (i == 0 or args[i - 1] != '--out')]

os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')
import open_clip  # noqa: E402
import torch  # noqa: E402
if not LABELS_ONLY:
    import tensorflow as tf  # noqa: E402
from open_clip.model import CLIP  # noqa: E402
from PIL import Image  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.abspath(OUT_ARG) if OUT_ARG else os.path.join(ROOT, 'assets', 'clip')
CACHE = '/tmp/clip-cache'
NAME = 'TinyCLIP-ViT-40M-32-Text-19M-LAION400M.pt'
URL = f'https://github.com/wkcn/TinyCLIP-model-zoo/releases/download/checkpoints/{NAME}'
SHA256 = 'af5042c3e3662c43573c16113d4a72014cf3aa19267a7a50c4b94be3c4e8366a'
CHUNK = 14_000_000
# phrases ajoutées à celles du vocabulaire (pas pour les captures d'écran, qui ne sont pas des photos)
TEMPLATES = ['{}', 'a photo of {}.', 'a phone photo of {}.']
NOT_PHOTOS = ('screenshot',)
MEAN = [0.48145466, 0.4578275, 0.40821073]
STD = [0.26862954, 0.26130258, 0.27577711]
WIDTH, LAYERS, HEADS, PATCH = 512, 12, 8, 32

os.makedirs(OUT, exist_ok=True)
os.makedirs(CACHE, exist_ok=True)

# --- Poids d'origine -------------------------------------------------------
ckpt = os.path.join(CACHE, NAME)
if not os.path.exists(ckpt):
    print('téléchargement', URL)
    urllib.request.urlretrieve(URL, ckpt + '.part')
    os.replace(ckpt + '.part', ckpt)
digest = hashlib.sha256(open(ckpt, 'rb').read()).hexdigest()
print('sha256', digest)
if digest != SHA256:
    print('  (empreinte différente de celle notée : à vérifier)')

model = CLIP(
    embed_dim=512,
    quick_gelu=False,  # TinyCLIP : GELU exacte (58,7 % sur 1000 images ImageNet, QuickGELU : 55,3 %)
    vision_cfg=dict(image_size=224, layers=LAYERS, width=WIDTH, patch_size=PATCH),
    text_cfg=dict(context_length=77, vocab_size=49408, width=512, heads=8, layers=6),
)
sd = torch.load(ckpt, map_location='cpu', weights_only=False)['state_dict']
model.load_state_dict({k.replace('module.', '', 1): v for k, v in sd.items()})
model.eval()
logit_scale = float(model.logit_scale.exp())
W = {k[len('visual.'):]: v.detach().numpy().astype(np.float32) for k, v in model.state_dict().items() if k.startswith('visual.')}

# --- Table des labels -------------------------------------------------------
dump = "import('./src/game/recognize/vocabV2.ts').then((m) => console.log(JSON.stringify((m.VOCAB ?? m.default.VOCAB).map((v) => [v.en, v.category]))))"
vocab = json.loads(subprocess.check_output(['node', '--import', 'tsx', '-e', dump], cwd=ROOT))
labels = [en[0] for en, _ in vocab]
assert len(set(labels)) == len(labels), 'première phrase en double dans le vocabulaire'
tok = open_clip.get_tokenizer('ViT-B-32')
rows = []
with torch.no_grad():
    for en, category in vocab:
        texts = list(en) if category in NOT_PHOTOS else [t.format(p) for t in TEMPLATES for p in en]
        e = model.encode_text(tok(texts)).float()
        e = (e / e.norm(dim=-1, keepdim=True)).mean(0)
        rows.append((e / e.norm()).numpy())
table = np.stack(rows).astype(np.float16)
open(os.path.join(OUT, 'clip-labels.bin'), 'wb').write(table.tobytes())
json.dump(
    {'model': NAME, 'labels': labels, 'dim': 512, 'logitScale': round(logit_scale, 4), 'templates': TEMPLATES, 'notPhotos': list(NOT_PHOTOS)},
    open(os.path.join(OUT, 'clip-labels.json'), 'w'),
    ensure_ascii=False,
    indent=1,
)
print(len(labels), 'labels, échelle', logit_scale)
if LABELS_ONLY:
    sys.exit(0)


# --- Encodeur d'images en TensorFlow (même calcul que open_clip) -----------
def build(w):
    """Fonction TF : image [1, 224, 224, 3] en 0..1 → vecteur normé [1, 512]."""
    c = {k: tf.constant(v) for k, v in w.items()}
    conv = tf.constant(np.transpose(w['conv1.weight'], (2, 3, 1, 0)))  # OIHW → HWIO
    mean = tf.constant(np.array(MEAN, np.float32))
    std = tf.constant(np.array(STD, np.float32))
    dh = WIDTH // HEADS

    def ln(x, p):
        m = tf.reduce_mean(x, -1, keepdims=True)
        v = tf.reduce_mean(tf.square(x - m), -1, keepdims=True)
        return (x - m) * tf.math.rsqrt(v + 1e-5) * c[p + '.weight'] + c[p + '.bias']

    def fc(x, p):
        return tf.matmul(x, c[p + '.weight'], transpose_b=True) + c[p + '.bias']

    def f(img):
        x = (img - mean) / std
        x = tf.nn.conv2d(x, conv, strides=PATCH, padding='VALID')  # [1, 7, 7, 512]
        x = tf.reshape(x, [49, WIDTH])
        x = tf.concat([c['class_embedding'][None], x], 0) + c['positional_embedding']
        x = ln(x, 'ln_pre')
        for i in range(LAYERS):
            p = f'transformer.resblocks.{i}.'
            h = ln(x, p + 'ln_1')
            qkv = tf.matmul(h, c[p + 'attn.in_proj_weight'], transpose_b=True) + c[p + 'attn.in_proj_bias']
            q, k, v = (tf.transpose(tf.reshape(t, [50, HEADS, dh]), [1, 0, 2]) for t in tf.split(qkv, 3, -1))
            a = tf.nn.softmax(tf.matmul(q, k, transpose_b=True) / np.sqrt(dh).astype(np.float32), -1)
            o = tf.reshape(tf.transpose(tf.matmul(a, v), [1, 0, 2]), [50, WIDTH])
            x = x + fc(o, p + 'attn.out_proj')
            h = ln(x, p + 'ln_2')
            x = x + fc(tf.nn.gelu(fc(h, p + 'mlp.c_fc'), approximate=False), p + 'mlp.c_proj')
        y = tf.matmul(ln(x[:1], 'ln_post'), c['proj'])
        return y / tf.norm(y, axis=-1, keepdims=True)

    return f


# --- TFLite (Android / iOS) : poids int8, calcul en float --------------------
fn = tf.function(build(W), input_signature=[tf.TensorSpec([1, 224, 224, 3], tf.float32, name='image')])
conv_ = tf.lite.TFLiteConverter.from_concrete_functions([fn.get_concrete_function()], fn)
conv_.optimizations = [tf.lite.Optimize.DEFAULT]
tfl_path = os.path.join(OUT, 'tinyclip-vit-40m-32-int8.tflite')
open(tfl_path, 'wb').write(conv_.convert())
print('écrit', tfl_path, os.path.getsize(tfl_path), 'octets')


# --- Navigateur : int8 par canal de sortie ------------------------------------
def quantize(a):
    """Matrice [sortie, ...] → int8 + une échelle par ligne (valeur = q × échelle)."""
    flat = a.reshape(a.shape[0], -1)
    scale = np.maximum(np.abs(flat).max(1), 1e-12) / 127
    q = np.clip(np.round(flat / scale[:, None]), -127, 127).astype(np.int8)
    return q.reshape(a.shape), scale.astype(np.float32)


blob = bytearray()
entries = []
deq = {}
for k, v in W.items():
    if v.ndim >= 2 and v.size >= 65536:
        q, s = quantize(v)
        deq[k] = (q.astype(np.float32).reshape(q.shape[0], -1) * s[:, None]).reshape(v.shape)
        entries.append({'name': k, 'shape': list(v.shape), 'dtype': 'int8', 'offset': len(blob)})
        blob += q.tobytes()
        entries.append({'name': k + '.scale', 'shape': [len(s)], 'dtype': 'float32', 'offset': len(blob)})
        blob += s.tobytes()
    else:
        deq[k] = v
        entries.append({'name': k, 'shape': list(v.shape), 'dtype': 'float32', 'offset': len(blob)})
        blob += v.tobytes()
    while len(blob) % 4:
        blob += b'\0'
for old in glob.glob(os.path.join(OUT, 'tinyclip-web.*.bin')):
    os.remove(old)
parts = []
for i in range(0, len(blob), CHUNK):
    name = f'tinyclip-web.{len(parts)}.bin'
    open(os.path.join(OUT, name), 'wb').write(blob[i:i + CHUNK])
    parts.append(name)
json.dump(
    {'model': NAME, 'width': WIDTH, 'layers': LAYERS, 'heads': HEADS, 'patch': PATCH, 'mean': MEAN, 'std': STD, 'bytes': len(blob), 'parts': parts, 'tensors': entries},
    open(os.path.join(OUT, 'tinyclip-web.json'), 'w'),
    indent=0,
)
print('navigateur :', len(blob), 'octets en', len(parts), 'morceaux')

# --- Vérification -------------------------------------------------------------
tests = sorted(glob.glob(os.path.join(ROOT, 'assets', 'bots', '*.jpg')))
for d in TEST_DIRS:
    tests += sorted(glob.glob(os.path.join(d, '**', '*.[jJ][pP]*[gG]'), recursive=True))
it = tf.lite.Interpreter(model_path=tfl_path)
it.allocate_tensors()
inp, outp = it.get_input_details()[0], it.get_output_details()[0]
web = build(deq)
T = table.astype(np.float32)
same_tfl = same_web = 0
worst = 1.0


def prep(path):
    """Comme le jeu : carré du centre, ramené à 224 × 224, RGB 0..1."""
    im = Image.open(path).convert('RGB')
    s = min(im.size)
    l, t = (im.width - s) // 2, (im.height - s) // 2
    return np.asarray(im.crop((l, t, l + s, t + s)).resize((224, 224), Image.BICUBIC), np.float32)[None] / 255


for p in tests:
    x = prep(p)
    with torch.no_grad():
        ref = model.encode_image(torch.from_numpy((x[0] - MEAN) / STD).permute(2, 0, 1)[None].float()).numpy()[0]
    ref /= np.linalg.norm(ref)
    it.set_tensor(inp['index'], x)
    it.invoke()
    a = it.get_tensor(outp['index'])[0]
    b = web(tf.constant(x)).numpy()[0]
    worst = min(worst, float(a @ ref), float(b @ ref))
    top = int(np.argmax(T @ ref))
    same_tfl += int(np.argmax(T @ a)) == top
    same_web += int(np.argmax(T @ b)) == top
n = len(tests)
print(f'{n} images : même label en tête TFLite {same_tfl}/{n}, navigateur {same_web}/{n} ; cosinus minimal avec l’original {worst:.4f}')
# (TFLite int8 quantifie aussi les calculs à la volée : un peu moins fidèle que le navigateur)
assert worst > 0.95 and same_tfl > 0.9 * n and same_web > 0.95 * n
