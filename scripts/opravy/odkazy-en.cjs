#!/usr/bin/env node
/**
 * odkazy-en.cjs — vnútorné odkazy v ANGLICKÝCH článkoch na anglické adresy.
 *
 * Prekladatelia ponechali odkazy v tele tak, ako sú v slovenčine, teda
 * `/blog/<slovenský-slug>`. Na anglickej stránke má taký odkaz viesť na
 * `/en/blog/<anglický-slug>` — inak čitateľ z anglického článku vypadne do
 * slovenčiny. Mapovanie slovenský → anglický slug sa dá postaviť až keď sú
 * preklady hotové, preto je to samostatný priechod.
 *
 * Odkaz na článok, ktorý anglickú verziu NEMÁ, sa nechá na slovenskú stránku
 * (lepšie než 404) a vypíše sa.
 *
 * Zapisuje Document Service (nie REST) a po zápise overí, že slovenská verzia
 * ostala nedotknutá — rovnako ako ostatné skripty v tomto priečinku.
 *
 *   node scripts/opravy/odkazy-en.cjs            # nasucho
 *   node scripts/opravy/odkazy-en.cjs --zapis
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

/** Blok do zápisu — médiá na id, bez technických kľúčov. */
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

/* Adresy, ktoré prepisujeme: absolútne na hradiska.sk aj relatívne. Starý
   blogspot je už prepísaný skriptom `prepis-stare-odkazy.mjs`, takže tu stačí
   tvar `/blog/<slug>`. */
const VZOR = /^(https?:\/\/(?:www\.)?hradiska\.sk)?\/blog\/([a-z0-9-]+)(\/?)(\?[^#]*)?(#.*)?$/i;

async function main() {
  console.log(`\n=== VNÚTORNÉ ODKAZY V ANGLIČTINE — ${ZAPIS ? 'ZÁPIS' : 'NASUCHO'} ===\n`);
  const app = await createStrapi({ appDir: KOREN, distDir: resolve(KOREN, 'dist') }).load();

  try {
    /* Mapovanie slovenský slug → anglický slug. */
    const sk = await app.documents(UID).findMany({ locale: 'sk', status: 'published', fields: ['slug'], limit: 1000 });
    const en = await app.documents(UID).findMany({ locale: 'en', status: 'published', fields: ['slug'], limit: 1000 });
    const enPodlaDoc = new Map(en.map((x) => [x.documentId, x.slug]));
    const mapa = new Map();
    for (const s of sk) {
      const e = enPodlaDoc.get(s.documentId);
      if (e) mapa.set(s.slug, e);
    }
    console.log(`mapovanie slugov: ${mapa.size} / ${sk.length}\n`);

    let clankov = 0, odkazov = 0, nezmenenych = 0, chyb = 0;
    const bezAnglictiny = new Set();

    for (const e0 of en) {
      const documentId = e0.documentId;
      const clanok = await app.documents(UID).findOne({ documentId, locale: 'en', status: 'published', populate: POPULATE });
      if (!clanok) continue;

      let zmien = 0;
      const prepis = (n) => {
        if (Array.isArray(n)) return n.forEach(prepis);
        if (!n || typeof n !== 'object') return;
        if (n.type === 'link' && typeof n.url === 'string') {
          const m = n.url.match(VZOR);
          if (m) {
            const [, zaklad = '', slug, lomka = '', dopyt = '', kotva = ''] = m;
            const anglicky = mapa.get(slug);
            if (anglicky) {
              n.url = `${zaklad}/en/blog/${anglicky}${lomka}${dopyt}${kotva}`;
              zmien++;
            } else {
              bezAnglictiny.add(slug);
              nezmenenych++;
            }
          }
        }
        for (const v of Object.values(n)) prepis(v);
      };
      const bloky = (clanok.blocks || []).map((b) => zloz(b));
      prepis(bloky);
      if (!zmien) continue;

      clankov++; odkazov += zmien;
      console.log(`• ${clanok.slug}: ${zmien} odkazov`);
      if (!ZAPIS) continue;

      /* Snímka slovenského konceptu — zápis anglickej verzie ho prepíše. */
      const skKoncept = await app.documents(UID).findOne({ documentId, locale: 'sk', status: 'draft', populate: POPULATE });
      const predSk = await app.documents(UID).findOne({ documentId, locale: 'sk', status: 'published', populate: POPULATE });

      try {
        await app.documents(UID).update({
          documentId, locale: 'en',
          data: {
            title: clanok.title, slug: clanok.slug, excerpt: clanok.excerpt,
            metaTitle: clanok.metaTitle, metaDescription: clanok.metaDescription,
            blocks: bloky,
            keyFacts: (clanok.keyFacts || []).map(({ id, ...z }) => z),
            timeline: (clanok.timeline || []).map(({ id, ...z }) => z),
            quotes: (clanok.quotes || []).map(({ id, ...z }) => z),
            mediaTexts: (clanok.mediaTexts || []).map(({ id, ...z }) => z),
          },
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
        if (poSk.title !== predSk.title || poSk.slug !== predSk.slug) {
          console.log('    !! POZOR, slovenská verzia sa zmenila');
          chyb++;
        }
      } catch (err) {
        console.error(`    !! ${clanok.slug}: ${err.message.slice(0, 160)}`);
        chyb++;
      }
    }

    console.log(`\nčlánkov ${clankov} · prepísaných odkazov ${odkazov} · ponechaných na slovenčinu ${nezmenenych} · chýb ${chyb}`);
    if (bezAnglictiny.size) console.log(`bez anglickej verzie: ${[...bezAnglictiny].join(', ')}`);
    if (!ZAPIS) console.log('(nasucho — nič sa nezapísalo)');
  } finally {
    await app.destroy();
  }
}

main().catch((e) => { console.error('\nCHYBA:', e.message); process.exit(1); });
