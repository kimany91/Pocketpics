import assert from 'node:assert/strict';
import test from 'node:test';

import { Reliable, type Wire } from '../src/net/reliable';
import type { TradeLink } from '../src/trade/link';

/** Deux bouts de liaison en mémoire qui perdent une part `loss` des messages (hasard fixe) et en désordonnent certains. */
function lossyPair<M>(loss: number) {
  let n = 0;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const make = () => {
    let cb: (m: Wire<M>) => void = () => {};
    let peer: { deliver(m: Wire<M>): void } | null = null;
    const end = {
      deliver: (m: Wire<M>) => cb(m),
      link: {
        send: (m: Wire<M>) => {
          n++;
          if (rnd() < loss) return; // perdu
          const copy = JSON.parse(JSON.stringify(m));
          setTimeout(() => peer?.deliver(copy), n % 5 === 0 ? 30 : 5); // parfois en retard
        },
        close: () => {},
        onMessage: (c: (m: Wire<M>) => void) => (cb = c),
        onClose: () => {},
      } satisfies TradeLink<Wire<M>>,
      setPeer: (p: { deliver(m: Wire<M>): void }) => (peer = p),
    };
    return end;
  };
  const a = make();
  const b = make();
  a.setPeer(b);
  b.setPeer(a);
  return [a.link, b.link] as const;
}

test('canal fiable : tout arrive une fois, dans l’ordre, malgré les pertes et le désordre', async () => {
  const [la, lb] = lossyPair<number>(0.3);
  const A = new Reliable<number>(la);
  const B = new Reliable<number>(lb);
  const gotB: number[] = [];
  const gotA: number[] = [];
  B.onMessage((m) => gotB.push(m));
  A.onMessage((m) => gotA.push(m));
  for (let i = 0; i < 30; i++) A.send(i);
  for (let i = 100; i < 110; i++) B.send(i);
  const deadline = Date.now() + 30000;
  while ((gotB.length < 30 || gotA.length < 10 || A.unacked || B.unacked) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  A.close();
  B.close();
  assert.deepEqual(gotB, Array.from({ length: 30 }, (_, i) => i));
  assert.deepEqual(gotA, Array.from({ length: 10 }, (_, i) => 100 + i));
  assert.equal(A.unacked, 0);
});
