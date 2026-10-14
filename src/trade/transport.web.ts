import type { TradeAddress } from './code';
import type { HostHandle, TradeLink } from './link';

export type { HostHandle, TradeLink } from './link';

export class NotOnWifiError extends Error {}

const unsupported = () => Promise.reject(new Error("L'échange n'est disponible que sur l'application mobile."));

export function hostTrade(_onGuest: (link: TradeLink) => void): Promise<HostHandle> {
  return unsupported();
}

export function joinTrade(_addr: TradeAddress): Promise<TradeLink> {
  return unsupported();
}
