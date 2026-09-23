import { factories } from '@strapi/strapi';

/**
 * PRIPOMIENKY — poznámky redaktora pripnuté na konkrétny prvok stránky.
 *
 * Slúžia na dve veci naraz: nahlásenie chyby webu (`druh: 'chyba'`) a
 * redakčnú poznámku k obsahu (`druh: 'obsah'`). Vznikajú kliknutím priamo
 * na webe, čítajú sa v administrácii.
 *
 * Bezpečnosť — celé je to IBA PRE STAFF:
 *   - práva má len rola `authenticated` (viď `setupStaffUserPermissions`
 *     v src/index.ts), ale kontrola je aj tu v každej akcii; čitateľ s rolou
 *     Member nesmie pripomienky ani čítať, nieto písať,
 *   - `user` a `stav` pri vytvorení určuje SERVER, nie klient,
 *   - 20 zápisov za minútu na účet, nech sa preklikom nezaplní databáza.
 */
const isStaff = (user: any) => user?.role?.type === 'authenticated';

const LEN = { text: 2000, url: 500, nadpis: 255, selektor: 1000, popis: 255, otisok: 500 };
const orez = (v: any, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);

export default factories.createCoreController('api::pripomienka.pripomienka', ({ strapi }) => ({
  async find(ctx) {
    if (!isStaff(ctx.state?.user)) return ctx.forbidden('Pripomienky vidí len redakcia.');
    return super.find(ctx);
  },

  async findOne(ctx) {
    if (!isStaff(ctx.state?.user)) return ctx.forbidden('Pripomienky vidí len redakcia.');
    return super.findOne(ctx);
  },

  async create(ctx) {
    const user = ctx.state?.user;
    if (!isStaff(user)) return ctx.forbidden('Pripomienky píše len redakcia.');

    const minuteAgo = new Date(Date.now() - 60_000).toISOString();
    const recent = await strapi.documents('api::pripomienka.pripomienka').count({
      filters: { user: { id: user.id }, createdAt: { $gt: minuteAgo } } as any,
    });
    if (recent >= 20) return ctx.tooManyRequests('Priveľa pripomienok za krátky čas. Skúste o chvíľu.');

    const body = ctx.request.body?.data ?? {};
    if (!String(body.text || '').trim()) return ctx.badRequest('Pripomienka nemá text.');
    if (!String(body.url || '').trim()) return ctx.badRequest('Chýba adresa stránky.');

    const sirka = Number(body.sirkaOkna) || null;

    // Document service (nie super.create) — rovnaký dôvod ako pri komentároch:
    // content-API sanitizácia by pri užívateľskej role reláciu `user` odmietla.
    const created = await strapi.documents('api::pripomienka.pripomienka').create({
      data: {
        text: orez(body.text, LEN.text),
        druh: body.druh === 'obsah' ? 'obsah' : 'chyba',
        stav: 'nova',
        url: orez(body.url, LEN.url),
        nadpisStranky: orez(body.nadpisStranky, LEN.nadpis) ?? null,
        selektor: orez(body.selektor, LEN.selektor) ?? null,
        popisPrvku: orez(body.popisPrvku, LEN.popis) ?? null,
        otisokTextu: orez(body.otisokTextu, LEN.otisok) ?? null,
        x: typeof body.x === 'number' ? body.x : null,
        y: typeof body.y === 'number' ? body.y : null,
        sirkaOkna: sirka,
        // Zariadenie sa neberie od klienta — dopočíta sa zo šírky okna.
        zariadenie: sirka && sirka < 768 ? 'mobil' : 'pocitac',
        user: user.id,
      } as any,
      populate: { user: { fields: ['id', 'username', 'email'] } } as any,
    });

    ctx.body = { data: created };
  },

  async update(ctx) {
    const user = ctx.state?.user;
    if (!isStaff(user)) return ctx.forbidden('Pripomienky mení len redakcia.');

    // Meniť sa smie stav, druh a text — nič iné (kotva na prvok ostáva, ako bola).
    const body = ctx.request.body?.data ?? {};
    const data: any = {};
    if (body.stav !== undefined) data.stav = body.stav;
    if (body.druh !== undefined) data.druh = body.druh;
    if (body.text !== undefined) data.text = orez(body.text, LEN.text);
    ctx.request.body = { data };

    return super.update(ctx);
  },

  async delete(ctx) {
    if (!isStaff(ctx.state?.user)) return ctx.forbidden('Pripomienky maže len redakcia.');
    return super.delete(ctx);
  },
}));
