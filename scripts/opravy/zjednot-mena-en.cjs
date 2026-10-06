#!/usr/bin/env node
/**
 * zjednot-mena-en.cjs — zjednotenie vlastných mien v ANGLICKÝCH článkoch.
 *
 * Preklady vznikali v desiatkach paralelných dávok, takže sa pri dvoch menách
 * rozišli. Slovník (§1) predpisuje tvar bez diakritiky (*Svatopluk I*) a pri
 * meste ukrajinskej metropoly je dnes ustálený tvar *Kyiv*.
 *
 * ČO SA NEMENÍ:
 *   • slovenské názvy kníh, opier, konferencií a citácie („Svätopluk 894–1994",
 *     Nádašiho-Jégého román, Suchoňova opera, Svätoplukovo námestie),
 *   • článok o Kyjevských listoch: *the Kiev Missal* je ustálený anglický názov
 *     pamiatky a v tom článku je dôsledný, preto ostáva celý nedotknutý.
 *
 * Zapisuje Document Service a po zápise overí slovenskú verziu.
 *
 *   node scripts/opravy/zjednot-mena-en.cjs
 *   node scripts/opravy/zjednot-mena-en.cjs --zapis
 */

const { resolve } = require('node:path');
const { createStrapi } = require('@strapi/strapi');

const KOREN = resolve(__dirname, '..', '..');
const UID = 'api::blog-post.blog-post';
const ZAPIS = process.argv.includes('--zapis');

const POPULATE = {
  coverImage: true, gallery: true, tags: true, category: true, keyFacts: true,
  timeline: true, quotes: true, location: true, mediaTexts: true, blocks: { populate: '*' },
};

/** Článok, ktorý sa nechá na pokoji (názov pamiatky, nie mesta). */
const VYNECHAT = new Set(['kiev-missal-oldest-old-church-slavonic-manuscript']);

/**
 * Pravidlá. `kde` je zoznam presných reťazcov, ktoré sa smú zmeniť — tým sa
 * vyhneme prepísaniu slovenských názvov, v ktorých „Svätopluk" patrí.
 */
const PRAVIDLA = [
  { z: 'King Svätopluk', na: 'King Svatopluk' },
  { z: 'Rastislav and Svätopluk', na: 'Rastislav and Svatopluk' },
  { z: "Svätopluk's sons", na: "Svatopluk's sons" },
  { z: 'Kievan Rus', na: 'Kyivan Rus' },
  { z: 'Kiev', na: 'Kyiv' },  // až po „Kievan Rus", inak by vznikol „Kyivan"
];

function zloz(b) {
  const von = { __component: b.__component };
  for (const [k, v] of Object.entries(b)) {
    if (['__component', 'id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt', 'locale'].includes(k)) continue;
    if (['image', 'images', 'secondImage'].includes(k)) {
      von[k] = Array.isArray(v) ? v.map((m) => m?.id ?? m) : (v && typeof v === 'object' ? v.id : v ?? null);
    } else if (k === 'items') von[k] = (v || []).map(({ id, ...z }) => z);
    else von[k] = v;
  }
  return von;
}

async function main() {
  console.log(`\n=== ZJEDNOTENIE MIEN V ANGLIČTINE — ${ZAPIS ? 'ZÁPIS' : 'NASUCHO'} ===\n`);
  const app = await createStrapi({ appDir: KOREN, distDir: resolve(KOREN, 'dist') }).load();

  try {
    const en = await app.documents(UID).findMany({ locale: 'en', status: 'published', fields: ['slug'], limit: 1000 });
    let clankov = 0, zmien = 0, chyb = 0;

    for (const e0 of en) {
      const documentId = e0.documentId;
      const clanok = await app.documents(UID).findOne({ documentId, locale: 'en', status: 'published', populate: POPULATE });
      if (!clanok || VYNECHAT.has(clanok.slug)) continue;

      let pocet = 0;
      const uprav = (s) => {
        let out = s;
        for (const { z, na } of PRAVIDLA) {
          if (out.includes(z)) {
            pocet += out.split(z).length - 1;
            out = out.split(z).join(na);
          }
        }
        return out;
      };
      const prejdi = (n) => {
        if (Array.isArray(n)) return n.forEach(prejdi);
        if (!n || typeof n !== 'object') return;
        if (typeof n.text === 'string') n.text = uprav(n.text);
        for (const v of Object.values(n)) prejdi(v);
      };

      const bloky = (clanok.blocks || []).map((b) => zloz(b));
      const keyFacts = (clanok.keyFacts || []).map(({ id, ...z }) => z);
      const timeline = (clanok.timeline || []).map(({ id, ...z }) => z);
      const quotes = (clanok.quotes || []).map(({ id, ...z }) => z);
      prejdi(bloky); prejdi(keyFacts); prejdi(timeline); prejdi(quotes);
      const title = uprav(clanok.title || '');
      const excerpt = uprav(clanok.excerpt || '');
      const metaTitle = uprav(clanok.metaTitle || '');
      const metaDescription = uprav(clanok.metaDescription || '');
      if (!pocet) continue;

      clankov++; zmien += pocet;
      console.log(`• ${clanok.slug}: ${pocet}`);
      if (!ZAPIS) continue;

      const skKoncept = await app.documents(UID).findOne({ documentId, locale: 'sk', status: 'draft', populate: POPULATE });
      const predSk = await app.documents(UID).findOne({ documentId, locale: 'sk', status: 'published', fields: ['title', 'slug'] });
      try {
        await app.documents(UID).update({
          documentId, locale: 'en',
          data: { title, slug: clanok.slug, excerpt, metaTitle, metaDescription, blocks: bloky, keyFacts, timeline, quotes,
            mediaTexts: (clanok.mediaTexts || []).map(({ id, ...z }) => z) },
        });
        await app.documents(UID).publish({ documentId, locale: 'en' });
        if (skKoncept) {
          await app.documents(UID).update({
            documentId, locale: 'sk',
            data: {
              title: skKoncept.title, slug: skKoncept.slug, excerpt: skKoncept.excerpt,
              metaTitle: skKoncept.metaTitle, metaDescription: skKoncept.metaDescription,
              blocks: (skKoncept.blocks || []).map((b) => zloz(b)),
              keyFacts: (skKoncept.keyFacts || []).map(({ id, ...z }) => z),
              timeline: (skKoncept.timeline || []).map(({ id, ...z }) => z),
              quotes: (skKoncept.quotes || []).map(({ id, ...z }) => z),
              mediaTexts: (skKoncept.mediaTexts || []).map(({ id, ...z }) => z),
            },
          });
        }
        const poSk = await app.documents(UID).findOne({ documentId, locale: 'sk', status: 'published', fields: ['title', 'slug'] });
        if (poSk.title !== predSk.title || poSk.slug !== predSk.slug) { console.log('    !! slovenčina sa zmenila'); chyb++; }
      } catch (err) {
        console.error(`    !! ${clanok.slug}: ${err.message.slice(0, 160)}`);
        chyb++;
      }
    }

    console.log(`\nčlánkov ${clankov} · zmien ${zmien} · chýb ${chyb}`);
    if (!ZAPIS) console.log('(nasucho — nič sa nezapísalo)');
  } finally {
    await app.destroy();
  }
}

main().catch((e) => { console.error('\nCHYBA:', e.message); process.exit(1); });
