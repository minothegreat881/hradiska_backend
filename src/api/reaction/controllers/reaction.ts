import { factories } from '@strapi/strapi';

/**
 * Lajky viazané na účet.
 *
 * ── Prečo vlastný controller ──────────────────────────────────────────────
 * Holý core create nezaviaže reakciu na používateľa a nedáva dedup — dala by
 * sa tak vytvoriť ľubovoľne veľa lajkov na tú istú vec. Tu:
 *   - `user` sa VŽDY nastaví na prihláseného (ignoruje sa, čo pošle klient)
 *   - dvojica (user, targetType, targetId) je unikátna — druhý pokus vráti
 *     existujúcu reakciu, nevytvorí novú
 *   - lajkovať môže LEN prihlásený (bez usera → 401)
 *   - zmazať (unlike) sa dá len vlastná reakcia
 */
export default factories.createCoreController('api::reaction.reaction', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized('Lajkovať môžu len prihlásení používatelia.');

    const body = ctx.request.body?.data ?? {};
    const targetType = body.targetType;
    const targetId = body.targetId;
    if (!targetType || !targetId) return ctx.badRequest('targetType a targetId sú povinné.');

    // Dedup: ak už lajk existuje, vráť ho namiesto vytvorenia druhého.
    const existing = await strapi.documents('api::reaction.reaction').findMany({
      filters: { targetType, targetId, user: { id: user.id } } as any,
      limit: 1,
    });
    if (existing.length) return { data: existing[0], meta: { deduped: true } };

    const created = await strapi.documents('api::reaction.reaction').create({
      data: { targetType, targetId, user: user.id } as any,
    });
    return { data: created };
  },

  async delete(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();

    const documentId = ctx.params?.id;
    const rec = await strapi.documents('api::reaction.reaction').findOne({
      documentId, populate: { user: true } as any,
    });
    if (!rec) return ctx.notFound();
    if ((rec as any).user?.id !== user.id) return ctx.forbidden('Môžete odobrať len vlastný lajk.');

    await strapi.documents('api::reaction.reaction').delete({ documentId });
    return { data: { ok: true } };
  },
}));
