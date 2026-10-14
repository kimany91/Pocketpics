import type { TradeAddress } from './code';
import type { TradeMessage } from './protocol';

export interface TradeLink {
  send(msg: TradeMessage): void;
  close(): void;
  onMessage(cb: (msg: TradeMessage) => void): void;
  onClose(cb: (error?: string) => void): void;
}

export interface HostHandle {
  code: string;
  stop(): void;
}

export class NotOnWifiError extends Error {}

const unsupported = () => Promise.reject(new Error("L'échange n'est disponible que sur l'application mobile."));

export function hostTrade(_onGuest: (link: TradeLink) => void): Promise<HostHandle> {
  return unsupported();
}

export function joinTrade(_addr: TradeAddress): Promise<TradeLink> {
  return unsupported();
}
