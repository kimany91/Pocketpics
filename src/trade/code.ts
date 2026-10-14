/**
 * Code d'échange : encode l'IP locale de l'hôte + le port en 8 caractères
 * (ex. « K7F4-QM2X »). 32 bits d'IP + 3 bits de port + 5 bits de contrôle.
 */
export const TRADE_PORTS = [47821, 47822, 47823, 47824, 47825, 47826, 47827, 47828];

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32
const QR_PREFIX = 'pocketpics://trade/';

export interface TradeAddress {
  host: string;
  port: number;
}

function checksum(bytes: number[], portIndex: number): number {
  let h = 7;
  for (const b of [...bytes, portIndex]) h = (h * 31 + b) % 1021;
  return h & 31;
}

export function encodeTradeCode({ host, port }: TradeAddress): string {
  const bytes = host.split('.').map((p) => Number(p));
  if (bytes.length !== 4 || bytes.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) {
    throw new Error('Adresse IPv4 invalide');
  }
  const portIndex = TRADE_PORTS.indexOf(port);
  if (portIndex < 0) throw new Error('Port non supporté');
  // 40 bits : [ip 32][port 3][check 5] — BigInt évité pour rester compatible partout.
  const hi = bytes[0]; // 8 bits de poids fort
  const lo = ((bytes[1] << 24) >>> 0) + (bytes[2] << 16) + (bytes[3] << 8) + (portIndex << 5) + checksum(bytes, portIndex);
  let out = '';
  let loRem = lo;
  let hiRem = hi;
  for (let i = 0; i < 8; i++) {
    const digit = loRem & 31;
    out = ALPHABET[digit] + out;
    // décalage de 5 bits sur un nombre de 40 bits réparti en (hi:8, lo:32)
    loRem = ((loRem >>> 5) | ((hiRem & 31) << 27)) >>> 0;
    hiRem = hiRem >>> 5;
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 8);
}

export function decodeTradeCode(input: string): TradeAddress | null {
  const code = normalizeCode(input);
  if (code.length !== 8) return null;
  let hi = 0;
  let lo = 0;
  for (const ch of code) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    // (hi:8, lo:32) <<= 5 puis |= v
    hi = ((hi << 5) | (lo >>> 27)) & 0xff;
    lo = (((lo << 5) >>> 0) | v) >>> 0;
  }
  const check = lo & 31;
  const portIndex = (lo >>> 5) & 7;
  const bytes = [hi, (lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff];
  if (checksum(bytes, portIndex) !== check) return null;
  return { host: bytes.join('.'), port: TRADE_PORTS[portIndex] };
}

export function tradeQrValue(code: string): string {
  return QR_PREFIX + normalizeCode(code);
}

export function parseTradeQr(data: string): TradeAddress | null {
  const raw = data.trim();
  const code = raw.startsWith(QR_PREFIX) ? raw.slice(QR_PREFIX.length) : raw;
  return decodeTradeCode(code);
}

export function formatCodeInput(input: string): string {
  const c = normalizeCode(input);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}
