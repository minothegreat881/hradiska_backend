/**
 * Odoslanie Web Push notifikácie. VAPID kľúče sú v env (VAPID_PUBLIC_KEY,
 * VAPID_PRIVATE_KEY, VAPID_SUBJECT). Ak knižnica `web-push` alebo kľúče chýbajú,
 * odoslanie je ticho no-op — notifikácia v DB tým netrpí.
 */
const UID = 'api::push-subscription.push-subscription';

let webpush: any = null;
let configured = false;
function getWebPush() {
  if (configured) return webpush;
  configured = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    webpush = require('web-push');
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (pub && priv) {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@hradiska.sk', pub, priv);
    } else {
      webpush = null; // bez kľúčov nemá zmysel
    }
  } catch {
    webpush = null; // knižnica nie je nainštalovaná
  }
  return webpush;
}

const TITLES: Record<string, string> = {
  reply: 'Nová odpoveď na tvoj komentár',
  like: 'Tvoj komentár niekto ocenil',
  warning: 'Upozornenie od správcu',
  post: 'Nový článok na Hradiská.sk',
};

export default ({ strapi }: { strapi: any }) => ({
  async sendToUser(userId: number, payload: { type: string; text?: string; notifId?: string }) {
    const wp = getWebPush();
    if (!wp) return;
    const subs = await strapi.documents(UID).findMany({
      filters: { user: { id: userId } }, pagination: { pageSize: 50 },
    });
    if (!subs.length) return;
    const body = JSON.stringify({
      title: TITLES[payload.type] || 'Hradiská.sk',
      body: (payload.text || '').slice(0, 120),
      url: '/profil',
      notifId: payload.notifId,
    });
    for (const s of subs) {
      const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        await wp.sendNotification(subscription, body);
      } catch (err: any) {
        // 404/410 = odber zanikol (odhlásený/expirovaný) → uprac
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          try { await strapi.documents(UID).delete({ documentId: s.documentId }); } catch { /* ignore */ }
        }
      }
    }
  },
});
