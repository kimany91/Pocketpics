/** Version navigateur : pas de notifications (tout reste visible dans la page). */
import type { FriendPush } from './types';

export { isPushToken } from './types';
export type { FriendPush } from './types';

export async function setupNotifications() {}
export async function askPermission(): Promise<boolean> {
  return false;
}
export async function scheduleDrawsReady(_at: number | null) {}
export async function getPushToken(): Promise<string | null> {
  return null;
}
export async function pushToFriend(_token: string, _msg: FriendPush) {}
