import { factories } from '@strapi/strapi';
import { oznamNahlasenie } from '../../../maily/oznamenia';

/**
 * NAHLÁSENIE KOMENTÁRA.
 *
 * Čitateľ označí príspevok, ktorý podľa neho na web nepatrí. Nahlásenie
 * komentár nijako neskryje — o tom rozhoduje redakcia; správcom však o ňom
 * okamžite príde e-mail, aby to nevisele týždne.
 *
 * PREČO VÔBEC: bez možnosti nahlásiť príspevok a zablokovať jeho autora
 * neprijme App Store aplikáciu, ktorá zobrazuje obsah od používateľov.
 * Webu to prospeje tak či tak.
 *
 * KTO ČO SMIE
 *   • nahlásiť — len PRIHLÁSENÝ člen. Anonymné nahlasovanie je pozvánka
 *     pre toho, kto chce niekomu uškodiť.
 *   • čítať, meniť stav a mazať — len REDAKCIA (rola `authenticated`).
 *
 * ČO URČUJE SERVER, NIE KLIENT
 *   `stav` je pri vzniku vždy `nove`, `user` sa berie z tokenu a odpis
 *   komentára aj meno jeho autora si server prečíta sám z databázy —
 *   klientovi sa v tomto neverí, inak by do zoznamu nahlásení mohol napísať
 *   čokoľvek a komukoľvek.
 *
 * ODPIS OBSAHU sa ukladá zámerne: keď redakcia komentár zmaže, v nahlásení
 * musí ostať vidieť, čo sa vlastne riešilo.
 */
const isStaff = (user: any) => user?.role?.type === 'authenticated';

const DOVODY = ['spam', 'urazka', 'nevhodne', 'nepravda', 'ine'];
const DRUHY = { komentar: 'api::blog-comment.blog-comment', fotokomentar: 'api::photo-comment.photo-comment' } as const;

export default factories.createCoreController('api::nahlasenie.nahlasenie', ({ strapi }) => ({
  async find(ctx) {
    if (!isStaff(ctx.state?.user)) return ctx.forbidden();
    return super.find(ctx);
  },

  async findOne(ctx) {
    if (!isStaff(ctx.state?.user)) return ctx.forbidden();
    return super.findOne(ctx);
  },

  async create(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized('Nahlásiť príspevok môže len prihlásený člen.');

    const body = ctx.request.body?.data ?? {};
    const druh = String(body.druh || '');
    if (!(druh in DRUHY)) return ctx.badRequest('Neznámy druh príspevku.');
    const cielDocumentId = String(body.cielDocumentId || '');
    if (!cielDocumentId) return ctx.badRequest('Chýba príspevok, ktorý sa nahlasuje.');

    /* Päť za minútu stačí aj tomu najpozornejšiemu čitateľovi a zároveň to
       zavrie dvere zahltenie schránky správcov. */
    const minutaSpat = new Date(Date.now() - 60_000).toISOString();
    const nedavne = await strapi.documents('api::nahlasenie.nahlasenie').count({
      filters: { user: { id: user.id }, createdAt: { $gt: minutaSpat } } as any,
    });
    if (nedavne >= 5) return ctx.tooManyRequests('Priveľa nahlásení za krátky čas. Skúste o chvíľu.');

    // Rovnaký príspevok druhýkrát tým istým človekom nemá zmysel.
    const uzNahlasene = await strapi.documents('api::nahlasenie.nahlasenie').count({
      filters: { user: { id: user.id }, cielDocumentId, druh } as any,
    });
    if (uzNahlasene > 0) return ctx.send({ data: null, uzNahlasene: true });

    // Odpis komentára a jeho autora si server prečíta sám.
    let odpisObsahu = '';
    let autorObsahu = '';
    try {
      const ciel: any = await strapi.documents(DRUHY[druh as keyof typeof DRUHY]).findOne({
        documentId: cielDocumentId,
        populate: { user: { fields: ['username', 'displayName'] } } as any,
      });
      if (!ciel) return ctx.notFound('Taký príspevok neexistuje.');
      odpisObsahu = String(ciel.content || '').slice(0, 2000);
      autorObsahu = String(ciel.authorName || ciel.user?.displayName || ciel.user?.username || '').slice(0, 120);
    } catch {
      return ctx.badRequest('Príspevok sa nepodarilo načítať.');
    }

    const created = await strapi.documents('api::nahlasenie.nahlasenie').create({
      data: {
        druh,
        cielDocumentId,
        dovod: DOVODY.includes(body.dovod) ? body.dovod : 'ine',
        poznamka: typeof body.poznamka === 'string' ? body.poznamka.slice(0, 1000) : null,
        url: typeof body.url === 'string' ? body.url.slice(0, 500) : null,
        stav: 'nove',
        odpisObsahu,
        autorObsahu,
        user: user.id,
      } as any,
    });

    // Oznámenie správcom je vedľajší účinok — keď zlyhá, nahlásenie ostáva.
    try {
      await oznamNahlasenie(strapi, {
        kto: user.displayName || user.username || user.email,
        dovod: String(body.dovod || 'ine'),
        poznamka: typeof body.poznamka === 'string' ? body.poznamka : '',
        autorObsahu,
        obsah: odpisObsahu,
        odkaz: typeof body.url === 'string' ? body.url : '',
      });
    } catch (e: any) {
      strapi.log?.error?.(`[nahlasenie] oznámenie správcom zlyhalo: ${e?.message || e}`);
    }

    return { data: created };
  },

  async update(ctx) {
    if (!isStaff(ctx.state?.user)) return ctx.forbidden();
    // Redakcia mení iba stav; ostatné polia sú záznam o tom, čo sa stalo.
    const stav = ctx.request.body?.data?.stav;
    ctx.request.body = { data: stav ? { stav } : {} };
    return super.update(ctx);
  },

  async delete(ctx) {
    if (!isStaff(ctx.state?.user)) return ctx.forbidden();
    return super.delete(ctx);
  },
}));
