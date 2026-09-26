/**
 * OZNÁMENIE SPRÁVCOM O NOVOM KOMENTÁRI.
 *
 * Komentár sa dá napísať kedykoľvek a nikto zo združenia pri tom nie je.
 * Doteraz sa o ňom dalo dozvedieť len tak, že si niekto otvoril
 * administráciu — pri komentári, ktorý čaká na schválenie, to znamená, že
 * čitateľ vidí svoj príspevok visieť aj niekoľko dní.
 *
 * Preto ide o každom novom komentári — pod článkom aj pod fotografiou —
 * e-mail všetkým správcom (rola `authenticated`). Autorovi samotného
 * komentára sa neposiela; kto píše, vie, že napísal.
 *
 * Odoslanie je VEDĽAJŠÍ ÚČINOK: keď zlyhá, komentár sa aj tak uloží. Správy
 * idú cez frontu pošty (`src/index.ts`), takže krátky výpadok SMTP ich
 * nestratí.
 */

import type { Core } from '@strapi/strapi';
import { vyplnitSurove, escapujHtml, textDoHtml, textNovyKomentar } from './index';

const FRONTEND = () =>
  (process.env.FRONTEND_URL || 'https://webdesignforhradiskask.vercel.app').replace(/\/$/, '');

/** Správcovia s použiteľnou adresou. Zablokované účty sa preskakujú. */
async function spravcovia(strapi: Core.Strapi, okremId?: number): Promise<{ id: number; email: string }[]> {
  const users: any[] = await strapi.db.query('plugin::users-permissions.user').findMany({
    where: { blocked: { $ne: true }, role: { type: 'authenticated' } },
    populate: { role: true },
    limit: 100,
  });
  return users
    .filter((u) => u?.email && u.id !== okremId)
    .map((u) => ({ id: u.id, email: u.email }));
}

export async function oznamNovyKomentar(
  strapi: Core.Strapi,
  v: { autor: string; kdeVeta: string; komentar: string; caka: boolean; odkaz: string; autorId?: number }
) {
  const prijemcovia = await spravcovia(strapi, v.autorId);
  if (!prijemcovia.length) {
    strapi.log?.info?.('[maily] nový komentár: žiadny správca s adresou — neposlané');
    return;
  }

  const stav = v.caka
    ? 'Komentár čaká na schválenie — kým ho neschválite, verejnosť ho nevidí.'
    : 'Komentár je zverejnený.';
  const orezany = v.komentar.length > 1200 ? `${v.komentar.slice(0, 1200)}…` : v.komentar;

  const html = vyplnitSurove('novy-komentar', {
    AUTOR: escapujHtml(v.autor),
    KDE_VETA: escapujHtml(v.kdeVeta),
    KOMENTAR: textDoHtml(orezany),
    STAV: escapujHtml(stav),
    ODKAZ_URL: escapujHtml(v.odkaz),
  });
  const text = textNovyKomentar({
    autor: v.autor, kdeVeta: v.kdeVeta, komentar: orezany, stav, odkaz: v.odkaz,
  });
  const subject = v.caka
    ? `Komentár čaká na schválenie — ${v.autor}`
    : `Nový komentár — ${v.autor}`;

  for (const prijemca of prijemcovia) {
    try {
      await strapi.plugin('email').service('email').send({ to: prijemca.email, subject, text, html });
    } catch (e: any) {
      strapi.log?.error?.(`[maily] oznámenie o komentári pre ${prijemca.email} zlyhalo: ${e?.message || e}`);
    }
  }
  strapi.log?.info?.(`[maily] nový komentár od ${v.autor} — oznámené ${prijemcovia.length} správcom`);
}

/** Odkaz na komentár pod článkom. Bez slugu vedie aspoň na domovskú. */
export function odkazNaClanok(slug?: string | null): string {
  return slug ? `${FRONTEND()}/blog/${slug}#komentare` : FRONTEND();
}

/** Odkaz na fotografiu v galérii — otvorí sa rovno svetelný box s diskusiou. */
export function odkazNaFotku(fileId?: number | string | null): string {
  return fileId ? `${FRONTEND()}/galeria?fotoFile=${encodeURIComponent(String(fileId))}` : `${FRONTEND()}/galeria`;
}
