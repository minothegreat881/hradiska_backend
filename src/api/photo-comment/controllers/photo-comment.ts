import { factories } from '@strapi/strapi';

/**
 * Komentáre k fotkám (lightbox v galérii článku).
 *
 * Bezpečnosť:
 *   - komentovať môže len prihlásený; `user` sa nastaví na neho (klient ho neurčuje)
 *   - `status` sa pri vytvorení VŽDY nastaví na 'visible' (zobrazí sa hneď) —
 *     klient ho nesmie ovplyvniť
 *   - upraviť/zmazať sa dá len VLASTNÝ komentár; výnimka je staff (rola
 *     `authenticated` = admin), ktorý moderuje čokoľvek
 *   - verejný GET vidí len status='visible'
 */
const isStaff = (user: any) => user?.role?.type === 'authenticated';

export default factories.createCoreController('api::photo-comment.photo-comment', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized('Komentovať môžu len prihlásení používatelia.');

    // Anti-spam: max 5 foto-komentárov za minútu na účet.
    const minuteAgo = new Date(Date.now() - 60_000).toISOString();
    const recent = await strapi.documents('api::photo-comment.photo-comment').count({
      filters: { user: { id: user.id }, createdAt: { $gt: minuteAgo } } as any,
    });
    if (recent >= 5) return ctx.tooManyRequests('Priveľa komentárov za krátky čas. Skúste o chvíľu.');

    const body = ctx.request.body?.data ?? {};
    if (!body.fileId || !body.content?.trim()) return ctx.badRequest('fileId a content sú povinné.');

    // Document service (nie super.create) — rovnaký dôvod ako pri blog-comment:
    // content-API sanitizácia by pri užívateľskej role reláciu `user` odmietla.
    const created = await strapi.documents('api::photo-comment.photo-comment').create({
      data: {
        fileId: body.fileId,
        content: body.content,
        inReplyTo: body.inReplyTo ?? null,
        status: 'visible',
        user: user.id,
      } as any,
      populate: { user: true } as any,
    });
    return { data: created };
  },

  async update(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();
    const rec = await strapi.documents('api::photo-comment.photo-comment').findOne({
      documentId: ctx.params.id, populate: { user: true } as any,
    });
    if (!rec) return ctx.notFound();

    const own = (rec as any).user?.id === user.id;
    if (!own && !isStaff(user)) return ctx.forbidden('Môžete upraviť len vlastný komentár.');

    const body = ctx.request.body?.data ?? {};
    // Člen smie meniť len obsah. Staff smie meniť aj status (moderácia).
    const data: any = {};
    if (own && typeof body.content === 'string') { data.content = body.content; data.editedAt = new Date(); }
    if (isStaff(user) && body.status) data.status = body.status;
    ctx.request.body = { data };
    return super.update(ctx);
  },

  async delete(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();
    const rec = await strapi.documents('api::photo-comment.photo-comment').findOne({
      documentId: ctx.params.id, populate: { user: true } as any,
    });
    if (!rec) return ctx.notFound();
    if ((rec as any).user?.id !== user.id && !isStaff(user)) {
      return ctx.forbidden('Môžete zmazať len vlastný komentár.');
    }
    return super.delete(ctx);
  },

  async find(ctx) {
    // Verejnosť vidí len viditeľné. Staff (admin) vidí všetko.
    if (!isStaff(ctx.state?.user)) {
      const q = (ctx.query || {}) as Record<string, any>;
      q.filters = { ...(q.filters || {}), status: { $eq: 'visible' } };
      ctx.query = q;
    }
    const response: any = await super.find(ctx);

    // Doťaženie mena autora a príznaku „môj". `populate[user]` cez verejné API
    // Strapi ticho zahodí (rovnako ako pri blog-comment), takže by autor ostal
    // vždy „Člen" a mazanie vlastného by sa nezobrazilo. Meno aj vlastníctvo
    // preto dopočítame tu cez document service (servisné práva) a von pošleme
    // LEN authorName (reťazec) + mine (boolean), nikdy údaje účtu.
    if (Array.isArray(response?.data) && response.data.length) {
      const ids = response.data.map((d: any) => d.documentId);
      const rows = await strapi.documents('api::photo-comment.photo-comment').findMany({
        filters: { documentId: { $in: ids } } as any,
        populate: { user: true } as any,
        fields: ['documentId'],
        pagination: { pageSize: ids.length } as any,
      });
      const meta = new Map(rows.map((r: any) => [r.documentId, r.user]));
      const uid = ctx.state?.user?.id;
      response.data.forEach((d: any) => {
        const u: any = meta.get(d.documentId);
        d.authorName = u?.displayName || u?.username || 'Zmazaný účet';
        d.mine = !!(uid && u?.id === uid);
      });
    }
    return response;
  },
}));
