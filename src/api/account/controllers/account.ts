/**
 * Vlastný účet člena — GDPR akcie + profil a jeho nastavenia nad SVOJÍM účtom.
 *
 * `deleteMe` zmaže LEN volajúceho (ctx.state.user), nikdy iného. Preto netreba
 * dávať Member role nebezpečné `user.delete` na cudzie účty.
 * `getMe`/`updateMe` pracujú tiež len s vlastným účtom.
 */
const USER = 'plugin::users-permissions.user';
const COMMENT = 'api::blog-comment.blog-comment';
const REACTION = 'api::reaction.reaction';
const SHARE = 'api::share.share';

// Polia, ktoré člen smie meniť na SVOJOM účte (nie role/blocked/email/heslo tu).
const EDITABLE = ['displayName', 'notifyReply', 'notifyLike', 'notifyPost', 'notifyEmail', 'avatar'];

export default ({ strapi }: { strapi: any }) => ({
  /** GET /account/me — profil + štatistiky pre hlavičku profilu */
  async getMe(ctx: any) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();
    const full = await strapi.documents(USER).findFirst({
      filters: { id: user.id },
      populate: { avatar: { fields: ['url', 'formats'] } },
    });
    const [comments, favorites, shares] = await Promise.all([
      strapi.documents(COMMENT).count({ filters: { user: { id: user.id }, status: { $ne: 'spam' } } }),
      strapi.documents(REACTION).count({ filters: { user: { id: user.id }, targetType: 'post' } }),
      strapi.documents(SHARE).count({ filters: { user: { id: user.id } } }),
    ]);
    return {
      id: full.id,
      username: full.username,
      email: full.email,
      displayName: full.displayName ?? null,
      avatar: full.avatar ?? null,
      warnsCount: full.warnsCount ?? 0,
      preModerated: full.preModerated ?? false,
      joinedAt: full.createdAt,
      prefs: {
        notifyReply: full.notifyReply !== false,
        notifyLike: full.notifyLike !== false,
        notifyPost: full.notifyPost !== false,
        notifyEmail: full.notifyEmail === true,
      },
      stats: { comments, favorites, shares },
    };
  },

  /** PUT /account/me { data: { displayName, notify*, avatar } } — len vlastné povolené polia */
  async updateMe(ctx: any) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();
    const body = ctx.request.body?.data ?? {};
    const data: any = {};
    for (const key of EDITABLE) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    if (typeof data.displayName === 'string') data.displayName = data.displayName.slice(0, 60);
    if (!Object.keys(data).length) return ctx.badRequest('Žiadne povolené pole na úpravu.');
    const updated = await strapi.documents(USER).update({ documentId: user.documentId, data });
    return { ok: true, displayName: updated.displayName ?? null };
  },

  async deleteMe(ctx: any) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();

    // Komentáre zostávajú (diskusie by sa inak rozpadli), len sa odviažu od účtu
    // a anonymizujú — autor sa premení na „Zmazaný účet".
    try {
      const mine = await strapi.documents('api::blog-comment.blog-comment').findMany({
        filters: { user: { id: user.id } }, limit: 1000,
      });
      for (const c of mine) {
        await strapi.documents('api::blog-comment.blog-comment').update({
          documentId: c.documentId,
          data: { authorName: 'Zmazaný účet', authorEmail: null, user: null },
        });
      }
    } catch { /* aj keby anonymizácia zlyhala, účet zmažeme */ }

    await strapi.documents('plugin::users-permissions.user').delete({ documentId: user.documentId });
    return { ok: true };
  },
});
