import { factories } from '@strapi/strapi';

/**
 * BLOKOVANIE ČLENA.
 *
 * Kto si niekoho zablokuje, prestane vidieť jeho príspevky. Nie je to trest
 * ani moderácia — autor o tom nevie a ostatným sa jeho komentáre zobrazujú
 * ďalej. Je to len tichá možnosť nemať niekoho na očiach.
 *
 * PREČO: App Store vyžaduje od aplikácií s obsahom od používateľov oboje —
 * nahlásenie aj blokovanie. Webu to prospeje tak či tak.
 *
 * KDE SA FILTRUJE: v prehliadači, nie tu. Zoznam komentárov sa ťahá BEZ
 * tokenu (Strapi pri rolі Member sanitizáciu verejného GET-u nezvláda, viď
 * poznámku v `CommentSection.tsx`), takže server pri čítaní ani nevie, kto
 * sa pýta. Komentáre preto nesú číslo účtu autora (`authorId`) a prehliadač
 * si podľa vlastného zoznamu odfiltruje, čo nechce vidieť.
 *
 * KAŽDÝ VIDÍ LEN SVOJ ZOZNAM. Nad kolekciou zámerne nie je `find` — inak by
 * sa dalo vyčítať, kto koho blokuje, a to nie je vec nikoho iného.
 */
export default factories.createCoreController('api::blokovanie.blokovanie', ({ strapi }) => ({
  /** GET /blokovania/moje — zoznam účtov, ktoré mám zablokované. */
  async moje(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();
    const zaznamy = await strapi.documents('api::blokovanie.blokovanie').findMany({
      filters: { kto: { id: user.id } } as any,
      fields: ['kohoId', 'kohoMeno'] as any,
      sort: 'createdAt:desc',
      pagination: { pageSize: 500 } as any,
    });
    return {
      data: (zaznamy as any[]).map((z) => ({
        documentId: z.documentId, kohoId: z.kohoId, kohoMeno: z.kohoMeno,
      })),
    };
  },

  async create(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();

    const body = ctx.request.body?.data ?? {};
    const kohoId = Number(body.kohoId);
    if (!Number.isInteger(kohoId) || kohoId <= 0) return ctx.badRequest('Chýba účet, ktorý sa má blokovať.');
    if (kohoId === user.id) return ctx.badRequest('Sám seba blokovať nemusíte.');

    // Ten istý účet druhýkrát netreba — vrátime, čo už existuje.
    const uz = await strapi.documents('api::blokovanie.blokovanie').findMany({
      filters: { kto: { id: user.id }, kohoId } as any,
      pagination: { pageSize: 1 } as any,
    });
    if ((uz as any[]).length) return { data: uz[0] };

    /* Meno si server prečíta sám — keby ho poslal klient, v zozname
       zablokovaných by mohlo stáť čokoľvek. */
    let kohoMeno = '';
    try {
      const riadok: any = await strapi.db.query('plugin::users-permissions.user').findOne({
        where: { id: kohoId }, select: ['username', 'displayName'],
      });
      if (!riadok) return ctx.notFound('Taký účet neexistuje.');
      kohoMeno = String(riadok.displayName || riadok.username || '').slice(0, 120);
    } catch {
      return ctx.badRequest('Účet sa nepodarilo načítať.');
    }

    const created = await strapi.documents('api::blokovanie.blokovanie').create({
      data: { kto: user.id, kohoId, kohoMeno } as any,
    });
    return { data: created };
  },

  async delete(ctx) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();
    const zaznam: any = await strapi.documents('api::blokovanie.blokovanie').findOne({
      documentId: ctx.params.id,
      populate: { kto: { fields: ['id'] } } as any,
    });
    if (!zaznam) return ctx.notFound();
    // Zrušiť blokovanie smie len ten, kto ho nastavil.
    if (zaznam.kto?.id !== user.id) return ctx.forbidden();
    return super.delete(ctx);
  },
}));
