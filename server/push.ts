/// <reference types="node" />
/**
 * Push notifications (friend invites, gifts, events…) even when the game is
 * closed, for players who allowed them. The VAPID keys are created once and
 * kept in the store, so nothing has to be configured on the host.
 */
import webpush from 'web-push';
import type { Store } from './storage.ts';

export type PushSub = webpush.PushSubscription;

let ready = false;
let publicKey = '';

export const setupPush = async (store: Store) => {
  try {
    let keys = JSON.parse((await store.load('vapid')) ?? 'null') as { publicKey: string; privateKey: string } | null;
    if (!keys?.publicKey || !keys?.privateKey) {
      keys = webpush.generateVAPIDKeys();
      await store.save('vapid', JSON.stringify(keys));
    }
    webpush.setVapidDetails('https://hospital-patient-zero.onrender.com', keys.publicKey, keys.privateKey);
    publicKey = keys.publicKey;
    ready = true;
  } catch (e) {
    console.error('[push] indisponible :', (e as Error).message);
  }
};

export const pushPublicKey = () => (ready ? publicKey : null);

export const isPushSub = (s: unknown): s is PushSub => {
  const x = s as PushSub;
  return !!x && typeof x.endpoint === 'string' && /^https:\/\//.test(x.endpoint) && typeof x.keys?.p256dh === 'string' && typeof x.keys?.auth === 'string';
};

/**
 * Sends a notification to every device of a player.
 * Returns the subscriptions still valid (expired ones are dropped).
 */
export const pushTo = async (subs: PushSub[] | undefined, title: string, body: string, tag = 'pz'): Promise<PushSub[]> => {
  if (!ready || !subs?.length) return subs ?? [];
  const payload = JSON.stringify({ title, body, tag });
  const keep: PushSub[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(s, payload, { TTL: 3600 });
        keep.push(s);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code !== 404 && code !== 410) keep.push(s);
      }
    })
  );
  return keep;
};
