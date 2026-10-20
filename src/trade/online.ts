/** Branchement de l'échange en ligne dans l'app (relais public + hasard sûr d'Expo). */
import { getRandomBytes } from 'expo-crypto';
import nacl from 'tweetnacl';

import type { HostHandle, TradeLink } from './link';
import { type MqttConnection, type MqttWill, connectMqtt } from './mqtt';
import { type RelayDeps, type RoomOptions, hostOnline as hostCore, joinOnline as joinCore } from './relayCore';
import { ROOM_RELAY, connectRoom, inClaudeViewer } from './roomRelay';

// Hasard cryptographique fourni par Expo (fonctionne sur iOS, Android et web).
nacl.setPRNG((x, n) => {
  const b = getRandomBytes(n);
  for (let i = 0; i < n; i++) x[i] = b[i];
});

/**
 * Relais publics gratuits (MQTT sur WebSocket sécurisé). Le jeu se branche sur
 * tous à la fois : deux joueurs se retrouvent dès qu'ils en joignent un en commun.
 * Le premier écoute sur le port 443 (celui des sites web sécurisés), le seul que
 * ni les opérateurs mobiles (4G/5G) ni les Wi-Fi publics ne bloquent ; les deux
 * autres utilisent des ports moins courants, parfois filtrés.
 * Pour une version publiée, remplace-les par ton propre relais : rien d'autre à changer.
 */
export const RELAYS = ['wss://mqtt.eclipseprojects.io:443/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt'];

/**
 * Se connecte à un relais : le canal « room » de claude.ai pour `ROOM_RELAY`
 * (démo publiée sur claude.ai, où les WebSocket vers l'extérieur sont bloqués),
 * un relais MQTT public sinon.
 */
export function connectRelay(url: string, clientId: string, topic: string | string[], opts: { will?: MqttWill } = {}): Promise<MqttConnection> {
  return url === ROOM_RELAY ? connectRoom(clientId, topic, opts) : connectMqtt(url, clientId, topic, opts);
}

/**
 * Relais à utiliser, par ordre de préférence. Dans le visualiseur claude.ai, le
 * canal « room » passe en premier : c'est le seul joignable depuis la page, et
 * les deux joueurs qui ont la démo ouverte s'y retrouvent.
 */
export function relayUrls(): string[] {
  // Permet de pointer vers un relais de test (ex. relais local) sans recompiler.
  const override = (globalThis as { __pocketpicsRelays?: unknown }).__pocketpicsRelays;
  if (Array.isArray(override) && override.every((u) => typeof u === 'string')) return override as string[];
  return inClaudeViewer() ? [ROOM_RELAY, ...RELAYS] : RELAYS;
}

export function deps(): RelayDeps {
  return { connect: connectRelay, urls: relayUrls(), randomBytes: getRandomBytes };
}

export const hostOnline = (onGuest: (link: TradeLink) => void): Promise<HostHandle> => hostCore(deps(), onGuest);
export const joinOnline = (code: string): Promise<TradeLink> => joinCore(deps(), code);

/** Salon générique (combats) : même relais, même chiffrement, autre espace de noms. */
export const hostRoom = <M,>(onGuest: (link: TradeLink<M>) => void, opts: RoomOptions): Promise<HostHandle> => hostCore<M>(deps(), onGuest, opts);
export const joinRoom = <M,>(code: string, opts: RoomOptions): Promise<TradeLink<M>> => joinCore<M>(deps(), code, opts);
