import { factories } from '@strapi/strapi';

/**
 * Komentáre k článkom.
 *
 * ── Model po pridaní účtov (2026-07-20) ────────────────────────────────────
 * Komentáre sa zobrazujú HNEĎ (`status: visible`) — bez schvaľovania, podľa
 * rozhodnutia používateľa. Admin ich môže dodatočne skryť/spam/zmazať.
 *
 * `status` [visible|hidden|spam] nahradil rozhodovanie cez `approved`. Pole
 * `approved` ostáva kvôli 732 migrovaným Blogger komentárom, ale verejný filter
 * ide už podľa `status`.
 *
 * Bezpečnosť:
 *   - staff (rola `authenticated` = admin) môže všetko (moderácia)
 *   - prihlásený člen: `user` = on sám; upraviť/zmazať len VLASTNÝ komentár
 *   - anonymný POST (Blogger dedičstvo / neprihlásený) sa zachováva, ale bez
 *     väzby na účet
 */
const isStaff = (user: any) => user?.role?.type === 'authenticated';

export default factories.createCoreController(
  'api::blog-comment.blog-comment',
  ({ strapi }) => ({
    async create(ctx) {
      const auth = ctx.state?.auth;
      const hasApiToken = auth?.strategy?.name === 'api-token';
      // API token (migrácia) smie nastaviť všetko.
      if (hasApiToken) return super.create(ctx);

      const user = ctx.state?.user;
      // Komentovať smú LEN prihlásení členovia. Obrana do hĺbky priamo tu —
      // nespoliehame sa len na oprávnenia roly (tie sa dajú omylom prepnúť).
      if (!user) return ctx.unauthorized('Komentovať môžu len prihlásení používatelia.');

      // Anti-spam: max 5 komentárov za minútu na účet. Chráni pred botmi a
      // omylom viacnásobného odoslania.
      const minuteAgo = new Date(Date.now() - 60_000).toISOString();
      const recent = await strapi.documents('api::blog-comment.blog-comment').count({
        filters: { user: { id: user.id }, createdAt: { $gt: minuteAgo } } as any,
      });
      if (recent >= 5) {
        return ctx.tooManyRequests('Priveľa komentárov za krátky čas. Skúste o chvíľu.');
      }

      const body = ctx.request.body?.data ?? {};
      if (!body.content?.trim() || !body.post) return ctx.badRequest('content a post sú povinné.');

      // Zápis cez document service, nie super.create: content-API sanitizácia
      // pri užívateľskej role odmieta reláciu `post` ako holý documentId
      // („Invalid key post"). Document service ho prijme rovnako ako token cesta.
      const created = await strapi.documents('api::blog-comment.blog-comment').create({
        data: {
          authorName: user.displayName || user.username,
          authorEmail: user.email,
          content: body.content,
          post: body.post,
          inReplyTo: body.inReplyTo ?? null,
          status: 'visible',   // zobrazí sa hneď
          approved: true,      // dorovnané kvôli starému filtru
          sourceBlogger: false,
          user: user.id,
        } as any,
        populate: { user: true } as any,
      });
      return { data: created };
    },

    async update(ctx) {
      const auth = ctx.state?.auth;
      const hasApiToken = auth?.strategy?.name === 'api-token';
      // API token (migrácia — 2. prechod threadingu: doplnenie inReplyTo) smie všetko.
      if (hasApiToken) return super.update(ctx);

      const user = ctx.state?.user;
      if (!user) return ctx.unauthorized();
      const rec = await strapi.documents('api::blog-comment.blog-comment').findOne({
        documentId: ctx.params.id, populate: { user: true } as any,
      });
      if (!rec) return ctx.notFound();

      const own = (rec as any).user?.id === user.id;
      if (!own && !isStaff(user)) return ctx.forbidden('Môžete upraviť len vlastný komentár.');

      const body = ctx.request.body?.data ?? {};
      const data: any = {};
      if (own && typeof body.content === 'string') { data.content = body.content; data.editedAt = new Date(); }
      if (isStaff(user) && body.status) data.status = body.status;   // moderácia
      ctx.request.body = { data };
      return super.update(ctx);
    },

    async delete(ctx) {
      const user = ctx.state?.user;
      if (!user) return ctx.unauthorized();
      const rec = await strapi.documents('api::blog-comment.blog-comment').findOne({
        documentId: ctx.params.id, populate: { user: true } as any,
      });
      if (!rec) return ctx.notFound();
      if ((rec as any).user?.id !== user.id && !isStaff(user)) {
        return ctx.forbidden('Môžete zmazať len vlastný komentár.');
      }
      return super.delete(ctx);
    },

    async find(ctx) {
      // Verejnosť vidí len viditeľné; staff (admin) vidí všetko.
      if (!isStaff(ctx.state?.user)) {
        const q = (ctx.query || {}) as Record<string, any>;
        q.filters = { ...(q.filters || {}), status: { $eq: 'visible' } };
        ctx.query = q;
      }
      return super.find(ctx);
    },

    /**
     * GET /blog-comments/mine?post=<documentId>
     * Vráti documentId vlastných komentárov prihláseného člena k danému článku.
     * Frontend tým označí „môj komentár" (zobrazí tlačidlo Zmazať) bez toho, aby
     * musel posielať token na verejný GET — ten pri Member role padá na
     * sanitizácii filtra `post` („Invalid key post"). Tu ide dotaz cez document
     * service so servisnými právami, takže sanitizácia roly ho neobmedzuje, a
     * von posielame LEN pole documentId, nikdy údaje účtu.
     */
    async mine(ctx) {
      const user = ctx.state?.user;
      if (!user) return ctx.unauthorized();
      const post = ctx.query?.post;
      if (!post) return ctx.badRequest('post (documentId) je povinný.');
      const rows = await strapi.documents('api::blog-comment.blog-comment').findMany({
        filters: { post: { documentId: post }, user: { id: user.id } } as any,
        fields: ['documentId'],
        pagination: { pageSize: 500 } as any,
      });
      return { data: rows.map((r: any) => r.documentId) };
    },

    async like(ctx) {
      // PONECHANÉ kvôli spätnej kompatibilite frontendu, ale lajky sa presúvajú
      // na kolekciu `reaction` (per účet). Tento endpoint len zvyšuje counter.
      const documentId = ctx.params?.id || ctx.params?.documentId;
      if (!documentId) return ctx.badRequest('id (documentId) required');
      const existing = await strapi.documents('api::blog-comment.blog-comment').findOne({ documentId });
      if (!existing) return ctx.notFound();
      const updated = await strapi.documents('api::blog-comment.blog-comment').update({
        documentId, data: { likes: ((existing as any).likes || 0) + 1 } as any,
      });
      return { data: { likes: (updated as any)?.likes ?? 0 } };
    },

    async unlike(ctx) {
      const documentId = ctx.params?.id || ctx.params?.documentId;
      if (!documentId) return ctx.badRequest('id (documentId) required');
      const existing = await strapi.documents('api::blog-comment.blog-comment').findOne({ documentId });
      if (!existing) return ctx.notFound();
      const next = Math.max(0, ((existing as any).likes || 0) - 1);
      const updated = await strapi.documents('api::blog-comment.blog-comment').update({
        documentId, data: { likes: next } as any,
      });
      return { data: { likes: (updated as any)?.likes ?? 0 } };
    },
  }),
);
