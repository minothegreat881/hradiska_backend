import { factories } from '@strapi/strapi';

// Custom controller: pri public POST automaticky nastaví approved=false (vyžaduje
// admin moderation), zabráni návštevníkovi prepísať approved/sourceBlogger flagy.
export default factories.createCoreController(
  'api::blog-comment.blog-comment',
  ({ strapi }) => ({
    async create(ctx) {
      // Rozlíš public requesty (no auth / users-permissions Public role) od
      // requestov s API tokenom (Full Access) — token-authenticated requesty
      // môžu nastaviť všetky polia vrátane approved/sourceBlogger (pre migráciu).
      const auth = ctx.state?.auth;
      const hasApiToken = auth?.strategy?.name === 'api-token';
      if (!hasApiToken) {
        const body = ctx.request.body?.data ?? {};
        ctx.request.body = {
          data: {
            authorName: body.authorName,
            authorEmail: body.authorEmail,
            content: body.content,
            post: body.post,
            inReplyTo: body.inReplyTo,
            approved: false,
            sourceBlogger: false,
          },
        };
      }
      return await super.create(ctx);
    },
    async like(ctx) {
      // Public endpoint: zvýši counter `likes` o 1.
      // Anti-spam riešime na frontende cez localStorage (zabráni opätovnému klik-u
      // z toho istého zariadenia). Backend nepárkuje hlasujúcich.
      // Strapi 5 core route param je `:id` ale internou hodnotou je documentId.
      const documentId = ctx.params?.id || ctx.params?.documentId;
      if (!documentId) return ctx.badRequest('id (documentId) required');
      const existing = await strapi
        .documents('api::blog-comment.blog-comment')
        .findOne({ documentId });
      if (!existing) return ctx.notFound();
      const updated = await strapi
        .documents('api::blog-comment.blog-comment')
        .update({
          documentId,
          data: { likes: ((existing as any).likes || 0) + 1 } as any,
        });
      return { data: { likes: (updated as any)?.likes ?? 0 } };
    },
    async unlike(ctx) {
      // Public endpoint: zníži counter `likes` o 1 (nie pod 0).
      // Pár-uje sa s `like` — toggle vzor cez localStorage na frontende.
      // Strapi 5 core route param je `:id` ale internou hodnotou je documentId.
      const documentId = ctx.params?.id || ctx.params?.documentId;
      if (!documentId) return ctx.badRequest('id (documentId) required');
      const existing = await strapi
        .documents('api::blog-comment.blog-comment')
        .findOne({ documentId });
      if (!existing) return ctx.notFound();
      const next = Math.max(0, ((existing as any).likes || 0) - 1);
      const updated = await strapi
        .documents('api::blog-comment.blog-comment')
        .update({
          documentId,
          data: { likes: next } as any,
        });
      return { data: { likes: (updated as any)?.likes ?? 0 } };
    },
    async find(ctx) {
      // Public GET vidí len approved=true komentáre
      const auth = ctx.state?.auth;
      const isAdminOrToken = !!auth?.credentials || !!auth?.strategy;
      if (!isAdminOrToken) {
        const q = (ctx.query || {}) as Record<string, any>;
        const existingFilters = (q.filters && typeof q.filters === 'object' ? q.filters : {}) as Record<string, any>;
        q.filters = { ...existingFilters, approved: { $eq: true } };
        ctx.query = q;
      }
      return await super.find(ctx);
    },
  }),
);
