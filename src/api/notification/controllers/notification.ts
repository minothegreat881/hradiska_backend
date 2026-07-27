/**
 * Notifikácie člena — LEN nad vlastnými (recipient === ctx.state.user).
 *
 * Žiadne verejné CRUD: notifikácie vznikajú serverovo (viď services/notification `notify`),
 * člen ich smie len čítať, počítať neprečítané a označiť ako prečítané. Rolová
 * autorizácia je vynútená tu, nespoliehame sa len na oprávnenia roly.
 */
const UID = 'api::notification.notification';

export default ({ strapi }: { strapi: any }) => ({
  /** GET /notifications/mine?page=&pageSize= */
  async mine(ctx: any) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();
    const page = Math.max(1, Number(ctx.query?.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(ctx.query?.pageSize) || 20));
    const rows = await strapi.documents(UID).findMany({
      filters: { recipient: { id: user.id } },
      sort: { createdAt: 'desc' },
      populate: {
        actor: { fields: ['username', 'displayName'] },
        post: { fields: ['title', 'slug'] },
        comment: { fields: ['content', 'documentId'] },
        aktualita: { fields: ['nazov'] },
      },
      pagination: { page, pageSize },
    });
    const total = await strapi.documents(UID).count({ filters: { recipient: { id: user.id } } });
    return { data: rows, meta: { pagination: { page, pageSize, total } } };
  },

  /** GET /notifications/unread-count */
  async unreadCount(ctx: any) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();
    const count = await strapi.documents(UID).count({
      filters: { recipient: { id: user.id }, read: false },
    });
    return { count };
  },

  /** PUT /notifications/mark-all-read */
  async markAllRead(ctx: any) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();
    const unread = await strapi.documents(UID).findMany({
      filters: { recipient: { id: user.id }, read: false },
      fields: ['documentId'],
      pagination: { pageSize: 1000 },
    });
    for (const n of unread) {
      await strapi.documents(UID).update({ documentId: n.documentId, data: { read: true } });
    }
    return { ok: true, updated: unread.length };
  },

  /** PUT /notifications/:id/read — označí jednu (musí patriť volajúcemu) */
  async markRead(ctx: any) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();
    const rec = await strapi.documents(UID).findOne({
      documentId: ctx.params.id, populate: { recipient: { fields: ['id'] } },
    });
    if (!rec) return ctx.notFound();
    if (rec.recipient?.id !== user.id) return ctx.forbidden();
    const updated = await strapi.documents(UID).update({ documentId: ctx.params.id, data: { read: true } });
    return { data: updated };
  },
});
