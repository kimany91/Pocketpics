import type { TradeMessage } from './protocol';

/** Liaison entre deux joueurs, quel que soit le transport (Wi-Fi local ou en ligne). */
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
