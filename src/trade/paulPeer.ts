/**
 * Paul à l'autre bout d'un échange (tuto, phase 2) : une fausse liaison, sur ce
 * téléphone, qui parle le vrai protocole d'échange. L'écran d'échange est donc
 * le vrai, rien ne passe par le réseau.
 *
 * Ce que fait Paul :
 *  - il se présente, puis pose UNE carte commune (une illustration du jeu) ;
 *  - il valide dès que tu as validé une offre d'UNE carte ;
 *  - il confirme quand tu confirmes ;
 *  - il « enregistre » ta carte (il l'accuse, sans la garder) et envoie la sienne.
 */
import { botArt } from '../battle/botArt';
import { bundledImageBase64 } from '../game/bundledImage';
import { botReply, readEmoteMessage } from '../game/emotes';
import { makeCard } from '../game/pack';
import { PAUL_NAME, paulHash, pickPaulArt } from '../game/paul';
import type { TradeLink } from './link';
import { helloFields, peerRange } from '../net/compat';
import { type OfferCard, type TradeMessage, type TransferCard, mirrorKey, offerKey, offerTag } from './protocol';

/** Sa carte : une illustration au hasard, devenue une vraie carte commune. */
async function paulCard(): Promise<TransferCard | null> {
  for (const ref of pickPaulArt(4)) {
    const mod = botArt(ref);
    if (mod === undefined) continue;
    try {
      const img = await bundledImageBase64(mod);
      if (!img) continue;
      const card = makeCard({ hash: paulHash(ref), width: img.width, height: img.height, sourceId: null }, 'common', Date.now(), {
        origin: 'trade',
        giver: PAUL_NAME,
        chromatic: false,
      });
      return { card, image: img.base64, thumb: img.base64 };
    } catch (e) {
      console.warn('Carte de Paul illisible', ref, e);
    }
  }
  return null;
}

export function paulTradeLink(): TradeLink {
  let toPlayer: ((m: TradeMessage) => void) | null = null;
  let onClose: ((error?: string) => void) | null = null;
  let closed = false;
  let mine: TransferCard | null = null;
  let theirs: OfferCard[] = [];
  let locked = false;
  let sentCards = false;

  /** Un petit délai, comme une vraie personne au bout du fil. */
  const say = (m: TradeMessage, ms: number) =>
    setTimeout(() => {
      if (!closed) toPlayer?.(m);
    }, ms);
  const myOffer = (): OfferCard[] => (mine ? [{ id: mine.card.id, name: null, rarity: mine.card.rarity, thumb: mine.thumb }] : []);
  // l'accord vu de son côté : ses cartes | les tiennes
  const key = () =>
    offerKey(
      myOffer().map((c) => offerTag(c.id, false)),
      theirs.map((c) => offerTag(c.id, c.locked === true)),
    );

  const fromPlayer = (m: TradeMessage) => {
    switch (m.t) {
      case 'hello':
        say({ t: 'hello', ...helloFields('trade', peerRange(m)), name: PAUL_NAME }, 350);
        void paulCard().then((c) => {
          if (closed) return;
          if (!c) {
            closed = true;
            onClose?.('Les cartes de Paul ne se sont pas chargées.');
            return;
          }
          mine = c;
          say({ t: 'offer', cards: myOffer() }, 900);
        });
        return;
      case 'offer':
        // ton offre a changé : il annule sa validation, comme tout le monde
        theirs = Array.isArray(m.cards) ? m.cards : [];
        locked = false;
        return;
      case 'lock':
        if (!m.locked) {
          locked = false;
          return;
        }
        // il ne valide qu'un échange d'une carte contre une
        if (!mine || theirs.length !== 1 || m.key !== mirrorKey(key())) return;
        locked = true;
        say({ t: 'lock', locked: true, key: key() }, 1100);
        return;
      case 'confirm':
        if (locked && m.key === mirrorKey(key())) say({ t: 'confirm', key: key() }, 900);
        return;
      case 'cards':
        if (sentCards || !mine) return;
        sentCards = true;
        say({ t: 'ack', ids: m.cards.map((c) => c?.card?.id) }, 250);
        say({ t: 'cards', cards: [mine] }, 450);
        return;
      case 'emote': {
        // Paul répond parfois à une emote, comme un vrai joueur
        const got = readEmoteMessage(m);
        const reply = got ? botReply(got, Math.random, 0.65) : null;
        if (reply) say({ t: 'emote', id: reply }, 900 + Math.random() * 900);
        return;
      }
      default:
        return;
    }
  };

  return {
    send(m) {
      // jamais pendant l'envoi : le message part « sur le réseau »
      setTimeout(() => !closed && fromPlayer(m), 0);
    },
    close() {
      closed = true;
    },
    onMessage(cb) {
      toPlayer = cb;
    },
    onClose(cb) {
      onClose = cb;
    },
  };
}
