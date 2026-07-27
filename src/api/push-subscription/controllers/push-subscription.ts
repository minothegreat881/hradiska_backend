/**
 * Web Push odbery člena. Člen registruje odber svojho prehliadača/PWA; `user` je
 * vždy volajúci. `endpoint` je unikátny → upsert (to isté zariadenie sa neduplikuje).
 */
const UID = 'api::push-subscription.push-subscription';

export default ({ strapi }: { strapi: any }) => ({
  /** GET /push/vapid-public-key — verejný VAPID kľúč pre odber na FE */
  vapidPublicKey(ctx: any) {
    ctx.body = { key: process.env.VAPID_PUBLIC_KEY || '' };
  },

  /** POST /push/subscribe { data: { subscription, userAgent } } */
  async subscribe(ctx: any) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();
    const sub = ctx.request.body?.data?.subscription ?? ctx.request.body?.subscription;
    const endpoint = sub?.endpoint;
    if (!endpoint) return ctx.badRequest('subscription.endpoint je povinný.');
    const keys = sub.keys || {};
    const existing = await strapi.documents(UID).findMany({ filters: { endpoint }, pagination: { pageSize: 1 } });
    const data = {
      endpoint, p256dh: keys.p256dh ?? null, auth: keys.auth ?? null,
      userAgent: (ctx.request.body?.data?.userAgent ?? ctx.request.headers['user-agent'] ?? '').slice(0, 300),
      user: user.id,
    } as any;
    if (existing[0]) {
      await strapi.documents(UID).update({ documentId: existing[0].documentId, data });
    } else {
      await strapi.documents(UID).create({ data });
    }
    return { ok: true };
  },

  /** POST /push/unsubscribe { data: { endpoint } } */
  async unsubscribe(ctx: any) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();
    const endpoint = ctx.request.body?.data?.endpoint ?? ctx.request.body?.endpoint;
    if (!endpoint) return ctx.badRequest('endpoint je povinný.');
    const rows = await strapi.documents(UID).findMany({
      filters: { endpoint, user: { id: user.id } }, pagination: { pageSize: 5 },
    });
    for (const r of rows) await strapi.documents(UID).delete({ documentId: r.documentId });
    return { ok: true };
  },
});
