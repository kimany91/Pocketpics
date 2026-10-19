/**
 * Une ligne par personne dans la liste d'amis.
 *
 * Un code ami, c'est une sauvegarde : quelqu'un qui joue sur deux appareils (ou
 * qui a réinstallé le jeu) a deux codes, et apparaissait donc deux fois dans la
 * liste — une fois en ligne, une fois hors ligne. On regroupe ces lignes sous
 * le même pseudo : on en montre une seule, celle de l'appareil allumé, et
 * retirer l'ami retire tous ses codes.
 *
 * Pur (testable sous Node).
 */
import type { Friend } from '../storage/model';

export interface FriendEntry {
  /** La ligne à afficher (l'appareil en ligne s'il y en a un). */
  friend: Friend;
  /** Tous les codes de cette personne (plusieurs si elle a plusieurs appareils). */
  codes: string[];
  online: boolean;
}

/** Pseudo ramené à sa forme comparable (espaces et majuscules ignorés). */
const key = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** Un pseudo vide ou générique ne suffit pas à dire que c'est la même personne. */
const vague = (name: string) => {
  const k = key(name);
  return k === '' || k === 'ami' || k === 'nouvel ami' || k === 'joueur';
};

/**
 * Regroupe les amis par personne, les connectés d'abord puis par ordre
 * alphabétique (le même classement qu'avant).
 */
export function groupFriends(friends: readonly Friend[], isOnline: (code: string) => boolean): FriendEntry[] {
  const groups = new Map<string, FriendEntry>();
  for (const f of friends) {
    const k = vague(f.name) ? `code:${f.code}` : `nom:${key(f.name)}`;
    const g = groups.get(k);
    const online = isOnline(f.code);
    if (!g) {
      groups.set(k, { friend: f, codes: [f.code], online });
      continue;
    }
    g.codes.push(f.code);
    g.online = g.online || online;
    // on garde l'appareil allumé ; sinon le plus récemment ajouté
    const better = online && !isOnline(g.friend.code);
    const newer = online === isOnline(g.friend.code) && (f.addedAt ?? 0) > (g.friend.addedAt ?? 0);
    if (better || newer) g.friend = f;
  }
  return [...groups.values()].sort((a, b) => Number(b.online) - Number(a.online) || a.friend.name.localeCompare(b.friend.name));
}
