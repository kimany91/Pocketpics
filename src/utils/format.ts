const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Code court et stable d'une carte, affiché au dos (ex. « #4F2A-91C0 »). */
export function cardSerial(id: string): string {
  const hex = id.replace(/[^0-9a-f]/gi, '').toUpperCase();
  return `#${hex.slice(0, 4)}-${hex.slice(-4)}`;
}
