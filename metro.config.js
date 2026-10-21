// Config Metro d'Expo, plus le détecteur de contenu adulte (src/game/nsfw*.ts, assets/nsfw).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Le modèle TFLite (.tflite, Android/iOS) et les poids TensorFlow.js (.bin.gz, navigateur).
config.resolver.assetExts.push('tflite', 'gz');

// Navigateur : TensorFlow.js est pris dans ses fichiers déjà réduits (deux fois plus
// légers que ses sources, la version en un seul fichier doit rester petite). Leurs
// branches pour Node (crypto, util, node-fetch) ne servent pas dans un navigateur.
const TFJS_WEB = {
  '@tensorflow/tfjs-core': 'tfjs-core/dist/tf-core.es2017.min.js',
  '@tensorflow/tfjs-layers': 'tfjs-layers/dist/tf-layers.es2017.min.js',
  '@tensorflow/tfjs-backend-webgl': 'tfjs-backend-webgl/dist/tf-backend-webgl.es2017.min.js',
  '@tensorflow/tfjs-backend-cpu': 'tfjs-backend-cpu/dist/tf-backend-cpu.es2017.min.js',
};
const NODE_ONLY = new Set(['crypto', 'util', 'node-fetch']);

config.resolver.resolveRequest = (context, name, platform) => {
  if (platform === 'web') {
    if (TFJS_WEB[name]) return { type: 'sourceFile', filePath: path.join(__dirname, 'node_modules/@tensorflow', TFJS_WEB[name]) };
    if (NODE_ONLY.has(name) && context.originModulePath.includes(`${path.sep}@tensorflow${path.sep}`)) return { type: 'empty' };
  }
  return context.resolveRequest(context, name, platform);
};

module.exports = config;
