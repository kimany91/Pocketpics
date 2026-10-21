/**
 * Notifications (téléphone) :
 *  - locale, sans réseau : « Tes paquets sont prêts » à l'heure où la réserve
 *    de tirages sera pleine ;
 *  - entre amis, quand l'app de l'ami est fermée : défi, échange, Pioche
 *    amicale, demande d'ami. Sans serveur à nous : chaque joueur donne son
 *    jeton de notification à ses amis (dans sa présence chiffrée), et l'app de
 *    celui qui invite demande directement au service de notifications d'Expo
 *    de prévenir l'ami.
 *
 * Il faut une version compilée de l'app. Les notifications entre amis
 * demandent en plus un projet EAS (`extra.eas.projectId` dans app.json) et les
 * accès Firebase (Android) / Apple (iOS) déclarés sur EAS ; sans eux, seule la
 * notification des paquets fonctionne.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { type FriendPush, isPushToken } from './types';

export { isPushToken } from './types';
export type { FriendPush } from './types';

const DRAWS_ID = 'paquets-prets';
const PUSH_URL = 'https://exp.host/--/api/v2/push/send';

let ready = false;

/** Réglages de base : canaux Android, et rien d'affiché quand l'app est ouverte (l'écran le montre déjà). */
export async function setupNotifications() {
  if (ready) return;
  ready = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('paquets', { name: 'Paquets prêts', importance: Notifications.AndroidImportance.DEFAULT }).catch(() => {});
    await Notifications.setNotificationChannelAsync('amis', { name: 'Amis (défis, échanges, pioches)', importance: Notifications.AndroidImportance.HIGH }).catch(() => {});
  }
}

/** Demande l'autorisation (une fois). Rend `true` si les notifications sont permises. */
export async function askPermission(): Promise<boolean> {
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    if (!cur.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** « Tes paquets sont prêts » à cette heure-là (remplace la précédente) ; `null` l'annule. */
export async function scheduleDrawsReady(at: number | null) {
  try {
    await Notifications.cancelScheduledNotificationAsync(DRAWS_ID).catch(() => {});
    if (at === null || at <= Date.now() + 5000) return;
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    await Notifications.scheduleNotificationAsync({
      identifier: DRAWS_ID,
      content: {
        title: 'Tes paquets sont prêts !',
        body: 'Ta réserve est pleine : viens voir ce que ta galerie te réserve.',
        sound: 'default',
        ...(Platform.OS === 'android' ? { channelId: 'paquets' } : {}),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), ...(Platform.OS === 'android' ? { channelId: 'paquets' } : {}) },
    });
  } catch {
    // pas d'autorisation, ou module indisponible : tant pis
  }
}

/** Mon jeton de notification (pour mes amis), ou `null` si impossible (pas de projet EAS, émulateur, refus). */
export async function getPushToken(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    if (!(await Notifications.getPermissionsAsync()).granted) return null;
    const t = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    return isPushToken(t) ? t : null;
  } catch {
    return null;
  }
}

/** Prévient un ami dont l'app est fermée. */
export async function pushToFriend(token: string, msg: FriendPush) {
  if (!isPushToken(token)) return;
  try {
    await fetch(PUSH_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: token, title: msg.title, body: msg.body, data: msg.data ?? {}, sound: 'default', priority: 'high', channelId: 'amis' }),
    });
  } catch {
    // pas de réseau : l'invitation reste visible dans l'app s'il l'ouvre
  }
}
