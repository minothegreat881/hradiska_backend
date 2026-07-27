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

    // Notifikácia „odpoveď" autorovi rodičovského foto-komentára (galéria).
    if (body.inReplyTo) {
      try {
        const parent = await strapi.documents('api::photo-comment.photo-comment').findOne({
          documentId: body.inReplyTo,
          populate: { user: { fields: ['id'] } } as any,
        });
        const parentUserId = (parent as any)?.user?.id;
        if (parentUserId) {
          await strapi.service('api::notification.notification').notify({
            type: 'reply', recipientId: parentUserId, actorId: user.id,
            photoCommentId: (created as any).id, fileId: body.fileId ?? null,
            text: body.content.slice(0, 300),
          });
        }
      } catch { /* notifikácia je vedľajší efekt */ }
    }
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

  /**
   * GET /photo-comments/mine-all — VŠETKY foto-komentáre člena (profil → Moje
   * komentáre). Doťaží počet lajkov (reactions), počet odpovedí, stav a článok
   * (dohľadaný z fileId cez galériu) pre preklik.
   */
  async mineAll(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();
    const rows = await strapi.documents('api::photo-comment.photo-comment').findMany({
      filters: { user: { id: user.id } } as any,
      sort: { createdAt: 'desc' },
      pagination: { pageSize: 500 } as any,
    });
    const out: any[] = [];
    for (const c of rows as any[]) {
      const replyCount = await strapi.documents('api::photo-comment.photo-comment').count({
        filters: { inReplyTo: c.documentId, status: { $ne: 'spam' } } as any,
      });
      const likeCount = await strapi.documents('api::reaction.reaction').count({
        filters: { targetType: 'photo-comment', targetId: c.documentId } as any,
      });
      let post: any = null;
      try {
        const posts = await strapi.documents('api::blog-post.blog-post').findMany({
          filters: { gallery: { id: c.fileId } } as any,
          fields: ['title', 'slug'],
          pagination: { pageSize: 1 } as any,
        });
        if (posts[0]) post = { title: (posts[0] as any).title, slug: (posts[0] as any).slug };
      } catch { /* prelink je voliteľný */ }
      out.push({
        documentId: c.documentId,
        content: c.content,
        status: c.status,
        likes: likeCount,
        replyCount,
        editedAt: c.editedAt ?? null,
        createdAt: c.createdAt,
        fileId: c.fileId,
        post,
      });
    }
    return { data: out };
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

      // Lajky komentárov: reaction targetType='photo-comment', targetId = documentId.
      // Von posielame počet + (pre prihláseného) documentId vlastnej reakcie na unlike.
      const reactions = await strapi.documents('api::reaction.reaction').findMany({
        filters: { targetType: 'photo-comment', targetId: { $in: ids } } as any,
        populate: { user: { fields: ['id'] } } as any,
        pagination: { pageSize: 5000 } as any,
      });
      const likeCount = new Map<string, number>();
      const myLike = new Map<string, string>();
      for (const r of reactions as any[]) {
        likeCount.set(r.targetId, (likeCount.get(r.targetId) || 0) + 1);
        if (uid && r.user?.id === uid) myLike.set(r.targetId, r.documentId);
      }

      response.data.forEach((d: any) => {
        const u: any = meta.get(d.documentId);
        d.authorName = u?.displayName || u?.username || 'Zmazaný účet';
        d.mine = !!(uid && u?.id === uid);
        d.likeCount = likeCount.get(d.documentId) || 0;
        d.myLikeId = myLike.get(d.documentId) || null;
      });
    }
    return response;
  },
}));
