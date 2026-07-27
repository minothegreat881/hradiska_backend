/**
 * Pri PRVOM publikovaní aktuality upozorni všetkých členov (notifyPost) — v appke
 * aj cez Web Push. Guard `membersNotified` bráni opakovaniu pri ďalších úpravách.
 *
 * D&P pozn.: lifecycle beží nad publikovaným aj draft záznamom; kľúčová je
 * podmienka `publishedAt && !membersNotified`. Flag nastavíme cez db.query (bez
 * document service), takže druhý prechod už podmienku nesplní → žiadny cyklus.
 */
async function maybeNotify(strapi: any, result: any) {
  try {
    if (!result?.id || !result?.publishedAt || result?.membersNotified) return;
    await strapi.db.query('api::aktualita.aktualita').update({
      where: { id: result.id }, data: { membersNotified: true },
    });
    await strapi.service('api::notification.notification').notifyNewPost(result.id, result.nazov);
  } catch (e) {
    strapi.log?.warn?.(`Aktualita notify zlyhalo: ${e}`);
  }
}

export default {
  async afterCreate(event: any) {
    await maybeNotify((global as any).strapi, event.result);
  },
  async afterUpdate(event: any) {
    await maybeNotify((global as any).strapi, event.result);
  },
};
