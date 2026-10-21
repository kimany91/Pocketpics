"""
Filtre de contenu adulte : convertit le modèle NSFWJS MobileNetV2 (TensorFlow.js,
assets/nsfw/nsfw-mobilenet-v2.json + .bin.gz, poids quantifiés uint8) en TFLite pour
Android / iOS (assets/nsfw/nsfw-mobilenet-v2-f16.tflite, poids en float16), puis
compare les sorties des deux sur les illustrations du jeu.

Les fichiers viennent du paquet npm nsfwjs 4.4.0 (licence MIT,
dist/models/mobilenet_v2 : le base64 des fichiers .min.js, décodé ; les poids
sont ensuite compressés en gzip).

    python3 -m venv /tmp/venv && /tmp/venv/bin/pip install tensorflow tf_keras pillow
    /tmp/venv/bin/python scripts/convert-nsfw-model.py
"""
import glob
import gzip
import json
import os

import numpy as np

os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')
import tensorflow as tf  # noqa: E402
import tf_keras  # noqa: E402
from PIL import Image  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NSFW = os.path.join(ROOT, 'assets', 'nsfw')

mj = json.load(open(os.path.join(NSFW, 'nsfw-mobilenet-v2.json')))
model = tf_keras.models.model_from_json(json.dumps(mj['modelTopology']['model_config']))

# Poids : à la suite, dans l'ordre du manifeste ; quantifiés uint8 → valeur = q * scale + min
buf = gzip.open(os.path.join(NSFW, 'nsfw-mobilenet-v2.bin.gz'), 'rb').read()
off = 0
weights = {}
for group in mj['weightsManifest']:
    for w in group['weights']:
        n = int(np.prod(w['shape'])) if w['shape'] else 1
        q = w.get('quantization')
        if q:
            v = np.frombuffer(buf, np.uint8, n, off).astype(np.float32) * q['scale'] + q['min']
            off += n
        else:
            v = np.frombuffer(buf, np.float32, n, off)
            off += 4 * n
        weights[w['name']] = v.reshape(w['shape']).astype(np.float32)
assert off == len(buf), 'taille des poids inattendue'
for layer in model.layers:
    if layer.weights:
        layer.set_weights([weights[v.name.split(':')[0]] for v in layer.weights])


@tf.function(input_signature=[tf.TensorSpec([1, 224, 224, 3], tf.float32, name='input')])
def infer(x):
    return model(x, training=False)


conv = tf.lite.TFLiteConverter.from_concrete_functions([infer.get_concrete_function()], model)
conv.optimizations = [tf.lite.Optimize.DEFAULT]
conv.target_spec.supported_types = [tf.float16]
out = os.path.join(NSFW, 'nsfw-mobilenet-v2-f16.tflite')
open(out, 'wb').write(conv.convert())
print('écrit', out, os.path.getsize(out), 'octets')

# Vérification : Keras (poids d'origine) contre TFLite float16, mêmes entrées
it = tf.lite.Interpreter(model_path=out)
it.allocate_tensors()
inp, outp = it.get_input_details()[0], it.get_output_details()[0]
worst = 0.0
for p in sorted(glob.glob(os.path.join(ROOT, 'assets', 'bots', '*.jpg'))):
    x = np.asarray(Image.open(p).convert('RGB').resize((224, 224), Image.BILINEAR), np.float32)[None] / 255
    it.set_tensor(inp['index'], x)
    it.invoke()
    worst = max(worst, float(np.abs(it.get_tensor(outp['index'])[0] - model(x, training=False).numpy()[0]).max()))
print(f'écart max TFLite f16 / original : {worst:.4f}')
assert worst < 0.05
