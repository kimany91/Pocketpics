import type { TradeMessage } from './protocol';

/** Liaison entre deux joueurs, quel que soit le transport (Wi-Fi local ou en ligne). */
export interface TradeLink<M = TradeMessage> {
  send(msg: M): void;
  close(): void;
  onMessage(cb: (msg: M) => void): void;
  onClose(cb: (error?: string) => void): void;
}

export interface HostHandle {
  code: string;
  stop(): void;
}
