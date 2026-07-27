/**
 * Zdieľanie článku prihláseným členom. Slúži na počet zdieľaní a záložku
 * „Obľúbené a zdieľané" v profile. `user` je vždy volajúci — nikdy sa neprijíma z tela.
 */
const UID = 'api::share.share';

export default ({ strapi }: { strapi: any }) => ({
  /** POST /shares { data: { post, channel } } */
  async create(ctx: any) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized('Zdieľať môžu len prihlásení používatelia.');
    const body = ctx.request.body?.data ?? {};
    if (!body.post) return ctx.badRequest('post je povinný.');
    const created = await strapi.documents(UID).create({
      data: { user: user.id, post: body.post, channel: body.channel ?? null } as any,
    });
    return { data: created };
  },

  /** GET /shares/mine — moje zdieľané články (pre profil) */
  async mine(ctx: any) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();
    const rows = await strapi.documents(UID).findMany({
      filters: { user: { id: user.id } },
      sort: { createdAt: 'desc' },
      populate: { post: { fields: ['title', 'slug'] } },
      pagination: { pageSize: 500 },
    });
    return { data: rows };
  },
});
