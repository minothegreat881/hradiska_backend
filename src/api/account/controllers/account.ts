/**
 * Vlastný účet člena — GDPR akcie nad SVOJÍM účtom.
 *
 * `deleteMe` zmaže LEN volajúceho (ctx.state.user), nikdy iného. Preto netreba
 * dávať Member role nebezpečné `user.delete` na cudzie účty.
 */
export default ({ strapi }: { strapi: any }) => ({
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
