/**
 * Transport pair-à-pair sur le réseau local (TCP direct, sans serveur).
 * L'hôte ouvre un port ; l'invité s'y connecte grâce au code / QR code.
 *
 * Pour un futur mode en ligne, il suffira de fournir un autre `TradeLink`
 * (ex. WebSocket via un relais) : la logique d'échange ne change pas.
 */
import * as Network from 'expo-network';
import TcpSocket from 'react-native-tcp-socket';

import { TRADE_PORTS, type TradeAddress, encodeTradeCode } from './code';
import { LineDecoder, type TradeMessage, isTradeMessage } from './protocol';

export interface TradeLink {
  send(msg: TradeMessage): void;
  close(): void;
  onMessage(cb: (msg: TradeMessage) => void): void;
  onClose(cb: (error?: string) => void): void;
}

type Socket = ReturnType<typeof TcpSocket.createConnection>;
type Server = ReturnType<typeof TcpSocket.createServer>;

class SocketLink implements TradeLink {
  private decoder = new LineDecoder();
  /** `null` tant que personne n'écoute : les messages reçus sont mis en file. */
  private messageCb: ((m: TradeMessage) => void) | null = null;
  private closeCb: (e?: string) => void = () => {};
  private queue: TradeMessage[] = [];
  private closed = false;

  constructor(private socket: Socket) {
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      for (const m of this.decoder.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))) {
        if (!isTradeMessage(m)) continue;
        if (this.messageCb) this.messageCb(m);
        else this.queue.push(m);
      }
    });
    socket.on('error', (err) => this.finish(err?.message ?? 'Erreur réseau'));
    socket.on('close', () => this.finish());
  }

  private finish(error?: string) {
    if (this.closed) return;
    this.closed = true;
    this.closeCb(error);
  }

  send(msg: TradeMessage) {
    if (!this.closed) this.socket.write(`${JSON.stringify(msg)}\n`);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.socket.destroy();
    } catch {}
  }

  onMessage(cb: (m: TradeMessage) => void) {
    this.messageCb = cb;
    const pending = this.queue;
    this.queue = [];
    pending.forEach(cb);
  }

  onClose(cb: (e?: string) => void) {
    this.closeCb = cb;
  }
}

export class NotOnWifiError extends Error {
  constructor() {
    super('Connecte-toi au même réseau Wi-Fi que ton ami (ou partage de connexion).');
  }
}

async function localIPv4(): Promise<string> {
  const ip = await Network.getIpAddressAsync();
  if (!ip || ip === '0.0.0.0' || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) throw new NotOnWifiError();
  return ip;
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (e: Error) => reject(e);
    server.once('error', onError);
    server.listen({ port, host: '0.0.0.0' }, () => {
      server.off('error', onError);
      resolve();
    });
  });
}

export interface HostHandle {
  code: string;
  stop(): void;
}

/** Ouvre un échange. `onGuest` est appelé une seule fois, au premier joueur connecté. */
export async function hostTrade(onGuest: (link: TradeLink) => void): Promise<HostHandle> {
  const ip = await localIPv4();
  let accepted = false;
  let lastError: unknown;
  for (const port of TRADE_PORTS) {
    const server = TcpSocket.createServer((socket) => {
      if (accepted) {
        socket.destroy();
        return;
      }
      accepted = true;
      onGuest(new SocketLink(socket as Socket));
    });
    try {
      await listen(server, port);
      return {
        code: encodeTradeCode({ host: ip, port }),
        stop: () => {
          try {
            server.close();
          } catch {}
        },
      };
    } catch (e) {
      lastError = e;
      try {
        server.close();
      } catch {}
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Impossible d'ouvrir l'échange");
}

export function joinTrade(addr: TradeAddress, timeoutMs = 8000): Promise<TradeLink> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = TcpSocket.createConnection({ host: addr.host, port: addr.port, connectTimeout: timeoutMs }, () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(link);
    });
    const link = new SocketLink(socket);
    const fail = (msg: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {}
      reject(new Error(msg));
    };
    const timer = setTimeout(() => fail("L'hôte ne répond pas. Vérifie que vous êtes sur le même Wi-Fi."), timeoutMs + 500);
    link.onClose(() => fail("Connexion refusée. L'échange est peut-être déjà complet ou fermé."));
  });
}
