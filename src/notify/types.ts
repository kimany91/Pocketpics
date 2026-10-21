/** Ce qu'un ami reçoit en notification quand son app est fermée. */
export interface FriendPush {
  title: string;
  body: string;
  /** Pour ouvrir le bon écran au toucher (plus tard) ; aujourd'hui l'app s'ouvre simplement. */
  data?: Record<string, string>;
}

/** Un jeton de notification Expo valide (ce qu'un ami nous donne pour être prévenu). */
export const isPushToken = (t: unknown): t is string => typeof t === 'string' && t.length < 120 && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(t);
