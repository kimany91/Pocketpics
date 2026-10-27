/**
 * Réglages de `app.json`, plus le dossier du site web hébergé : avec
 * `POCKETPICS_BASE_URL=/Pocketpics`, la version web vit dans ce dossier
 * (GitHub Pages) et le routeur y garde ses adresses. Sans lui, rien ne change.
 */
module.exports = ({ config }) => {
  const baseUrl = (process.env.POCKETPICS_BASE_URL ?? '').replace(/\/+$/, '');
  if (!baseUrl) return config;
  return { ...config, experiments: { ...config.experiments, baseUrl } };
};
