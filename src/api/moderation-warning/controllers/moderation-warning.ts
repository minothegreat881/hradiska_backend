/**
 * Upozornenie správcu autorovi komentára — hlavná väzba admin → profil člena.
 *
 * LEN staff (rola `authenticated`). Odoslanie:
 *   1) uloží moderation-warning,
 *   2) navýši `warnsCount` autora,
 *   3) voliteľne zapne `preModerated` (ďalšie komentáre autora pôjdu do `waiting`),
 *   4) vytvorí notifikáciu typu `warning` (bordová karta v profile + push).
 */
const UID = 'api::moderation-warning.moderation-warning';
const COMMENT = 'api::blog-comment.blog-comment';
const USER = 'plugin::users-permissions.user';
const isStaff = (user: any) => user?.role?.type === 'authenticated';

export default ({ strapi }: { strapi: any }) => ({
  /** POST /moderation-warnings { data: { comment, template, text, preModerate } } */
  async create(ctx: any) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();
    if (!isStaff(user)) return ctx.forbidden('Len správca smie posielať upozornenia.');

    const body = ctx.request.body?.data ?? {};
    if (!body.comment || !body.template || !body.text?.trim()) {
      return ctx.badRequest('comment, template a text sú povinné.');
    }

    const comment = await strapi.documents(COMMENT).findOne({
      documentId: body.comment, populate: { user: { fields: ['id'] } },
    });
    if (!comment) return ctx.notFound('Komentár neexistuje.');
    const recipient = (comment as any).user;
    if (!recipient?.id) return ctx.badRequest('Komentár nemá prihláseného autora (anonymný/migrovaný).');

    const created = await strapi.documents(UID).create({
      data: {
        template: body.template, text: body.text,
        recipient: recipient.id, moderator: user.id, comment: comment.documentId,
      } as any,
    });

    // navýš počet upozornení autora + prípadná pre-moderácia
    const author = await strapi.documents(USER).findFirst({
      filters: { id: recipient.id }, fields: ['id', 'documentId', 'warnsCount'],
    });
    const data: any = { warnsCount: ((author as any)?.warnsCount || 0) + 1 };
    if (body.preModerate) data.preModerated = true;
    await strapi.documents(USER).update({ documentId: (author as any).documentId, data });

    // notifikácia (warning sa doručuje vždy, bez ohľadu na predvoľby)
    await strapi.service('api::notification.notification').notify({
      type: 'warning', recipientId: recipient.id, actorId: user.id,
      commentId: (comment as any).id, text: body.text,
    });

    return { data: created };
  },
});
