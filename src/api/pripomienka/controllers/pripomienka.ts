import { factories } from '@strapi/strapi';

/**
 * PRIPOMIENKY — poznámky pripnuté na konkrétny prvok stránky.
 *
 * Slúžia na dve veci naraz: nahlásenie chyby webu (`druh: 'chyba'`) a
 * redakčnú poznámku k obsahu (`druh: 'obsah'`). Vznikajú kliknutím priamo
 * na webe, čítajú sa v administrácii.
 *
 * KTO ČO SMIE
 *   • písať a čítať — KTOKOĽVEK, aj neprihlásený. Web je zatiaľ technický,
 *     verejnosť naň nechodí a testeri naň dostávajú odkaz; keby sa to malo
 *     zmeniť, stačí z `setupPublicPermissions` v src/index.ts odobrať
 *     `create`/`find` a zvyšok kódu ostáva.
 *   • meniť stav a mazať — LEN REDAKCIA (rola `authenticated`).
 *
 * ČO URČUJE SERVER, NIE KLIENT
 *   `stav` je pri vytvorení vždy `nova`, `user` sa berie z tokenu (neprihlásený
 *   ostane bez autora) a `zariadenie` sa dopočíta zo šírky okna.
 *
 * OBMEDZENIE RÝCHLOSTI
 *   prihlásený 20/min na účet, neprihlásený 10/min na IP. Pamäť je v procese —
 *   po reštarte sa zabudne, čo pri tomto použití stačí (rovnaký prístup ako
 *   `src/middlewares/authRateLimit.ts`).
 */
const isStaff = (user: any) => user?.role?.type === 'authenticated';

const LEN = { text: 2000, url: 500, nadpis: 255, selektor: 1000, popis: 255, otisok: 500 };
const orez = (v: any, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);

/** Počítadlo zápisov podľa IP pre neprihlásených. */
const hostia = new Map<string, number[]>();
const hostPrekrocil = (ip: string, limit = 10) => {
  const teraz = Date.now();
  const cerstve = (hostia.get(ip) ?? []).filter((t) => teraz - t < 60_000);
  cerstve.push(teraz);
  hostia.set(ip, cerstve);
  if (hostia.size > 500) hostia.clear();   // jednoduchá poistka proti rastu
  return cerstve.length > limit;
};

export default factories.createCoreController('api::pripomienka.pripomienka', ({ strapi }) => ({
  async find(ctx) {
    /* Neprihlásený nesmie ťahať, čo si zmyslí: `populate` sa mu prepíše na
       prezývku autora, aby sa cez reláciu nedal vytiahnuť e-mail účtu. */
    if (!isStaff(ctx.state?.user)) {
      ctx.query = { ...ctx.query, populate: { user: { fields: ['username'] } } } as any;
    }
    return super.find(ctx);
  },

  async findOne(ctx) {
    if (!isStaff(ctx.state?.user)) {
      ctx.query = { ...ctx.query, populate: { user: { fields: ['username'] } } } as any;
    }
    return super.findOne(ctx);
  },

  async create(ctx) {
    const user = ctx.state?.user;

    if (user) {
      const minuteAgo = new Date(Date.now() - 60_000).toISOString();
      const recent = await strapi.documents('api::pripomienka.pripomienka').count({
        filters: { user: { id: user.id }, createdAt: { $gt: minuteAgo } } as any,
      });
      if (recent >= 20) return ctx.tooManyRequests('Priveľa pripomienok za krátky čas. Skúste o chvíľu.');
    } else if (hostPrekrocil(ctx.request.ip || 'neznama')) {
      return ctx.tooManyRequests('Priveľa pripomienok za krátky čas. Skúste o chvíľu.');
    }

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
        user: user ? user.id : null,
      } as any,
      populate: { user: { fields: ['username'] } } as any,
    });

    ctx.body = { data: created };
  },

  async update(ctx) {
    if (!isStaff(ctx.state?.user)) return ctx.forbidden('Stav pripomienky mení len redakcia.');

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
