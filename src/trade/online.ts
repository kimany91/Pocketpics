/** Branchement de l'échange en ligne dans l'app (relais public + hasard sûr d'Expo). */
import { getRandomBytes } from 'expo-crypto';
import nacl from 'tweetnacl';

import type { HostHandle, TradeLink } from './link';
import { connectMqtt } from './mqtt';
import { type RelayDeps, type RoomOptions, hostOnline as hostCore, joinOnline as joinCore } from './relayCore';

// Hasard cryptographique fourni par Expo (fonctionne sur iOS, Android et web).
nacl.setPRNG((x, n) => {
  const b = getRandomBytes(n);
  for (let i = 0; i < n; i++) x[i] = b[i];
});

/**
 * Relais publics gratuits (MQTT sur WebSocket sécurisé), essayés dans l'ordre.
 * Pour une version publiée, remplace-les par ton propre relais : rien d'autre à changer.
 */
export const RELAYS = ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt'];

export function deps(): RelayDeps {
  // Permet de pointer vers un relais de test (ex. relais local) sans recompiler.
  const override = (globalThis as { __pocketpicsRelays?: unknown }).__pocketpicsRelays;
  const urls = Array.isArray(override) && override.every((u) => typeof u === 'string') ? (override as string[]) : RELAYS;
  return { connect: connectMqtt, urls, randomBytes: getRandomBytes };
}

export const hostOnline = (onGuest: (link: TradeLink) => void): Promise<HostHandle> => hostCore(deps(), onGuest);
export const joinOnline = (code: string): Promise<TradeLink> => joinCore(deps(), code);

/** Salon générique (combats) : même relais, même chiffrement, autre espace de noms. */
export const hostRoom = <M,>(onGuest: (link: TradeLink<M>) => void, opts: RoomOptions): Promise<HostHandle> => hostCore<M>(deps(), onGuest, opts);
export const joinRoom = <M,>(code: string, opts: RoomOptions): Promise<TradeLink<M>> => joinCore<M>(deps(), code, opts);
