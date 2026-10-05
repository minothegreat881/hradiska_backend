#!/usr/bin/env node
/**
 * zapis-davku.cjs — zapíše VIAC prekladov v jednom spustení Strapi.
 *
 * `zapis-preklad.cjs` spustí celé Strapi na jeden článok (~10 s). Pri 360
 * článkoch je to hodina čakania na štarty, a keby bežalo niekoľko naraz nad
 * tou istou SQLite databázou, bijú sa o zámok. Tento skript teda naštartuje
 * Strapi raz a prejde celú frontu po jednom.
 *
 * Logika zápisu je ZHODNÁ so `zapis-preklad.cjs` (overená cesta: zdieľané
 * polia zo slovenskej verzie, médiá a bibliografia pozične, dva kroky
 * update → publish, vrátenie slovenského konceptu). Tu je navyše:
 *   • kontrola, že anglický slug nekoliduje s iným článkom,
 *   • prehľadná tabuľka na konci a kód 1, keď niečo nesedí.
 *
 *   node scripts/preklad/zapis-davku.cjs                      # nasucho, všetko nezapísané
 *   node scripts/preklad/zapis-davku.cjs --zapis
 *   node scripts/preklad/zapis-davku.cjs --zapis --len=detva-kalamarka,nitra
 *   node scripts/preklad/zapis-davku.cjs --zapis --znova      # aj tie, čo už anglickú verziu majú
 */

const { readFileSync, readdirSync } = require('node:fs');
const { resolve, basename } = require('node:path');
const { createStrapi } = require('@strapi/strapi');

const KOREN = resolve(__dirname, '..', '..');
const PREKLADY = resolve(__dirname, 'preklady');
const UID = 'api::blog-post.blog-post';

const arg = (m, d = null) => (process.argv.find((a) => a.startsWith(m))?.slice(m.length)) ?? d;
const ZAPIS = process.argv.includes('--zapis');
const ZNOVA = process.argv.includes('--znova');
const LEN = (arg('--len=') || '').split(',').map((s) => s.trim()).filter(Boolean);

const POLIA = ['title', 'slug', 'excerpt', 'metaTitle', 'metaDescription', 'blocks', 'keyFacts', 'timeline', 'quotes', 'mediaTexts'];
const ZAKAZANE = ['coverImage', 'gallery', 'galleryColumns', 'coverPosition', 'category', 'tags',
  'location', 'comments', 'authorName', 'featured', 'readingTime', 'originalPublishedDate',
  'id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt', 'locale', 'localizations'];

const POPULATE = {
  coverImage: true, gallery: true, tags: true, category: true, keyFacts: true,
  timeline: true, quotes: true, location: true, mediaTexts: true, blocks: { populate: '*' },
};

/** Odtlačok slovenskej verzie — porovná sa pred zápisom a po ňom. */
const odtlacok = (d) => JSON.stringify({
  title: d.title, slug: d.slug, excerpt: d.excerpt, metaTitle: d.metaTitle,
  blokov: (d.blocks || []).length, cover: d.coverImage?.id ?? null,
  galeria: (d.gallery || []).length, stitky: (d.tags || []).map((t) => t.id).sort(),
  kategoria: d.category?.id ?? null,
});

function skontrolujVstup(vstup, subor) {
  const { slug, data } = vstup;
  if (!slug || !data) throw new Error('chýba `slug` alebo `data`');
  const zle = Object.keys(data).filter((k) => ZAKAZANE.includes(k));
  if (zle.length) throw new Error(`zdieľané polia do prekladu nepatria: ${zle.join(', ')}`);
  const neznáme = Object.keys(data).filter((k) => !POLIA.includes(k));
  if (neznáme.length) throw new Error(`neznáme polia: ${neznáme.join(', ')}`);
  if (!data.slug || /[^a-z0-9-]/.test(data.slug)) throw new Error(`anglický slug „${data.slug}" musí byť a-z, 0-9 a spojovníky`);
  if (data.slug === slug) throw new Error('anglický slug sa nesmie rovnať slovenskému');
  for (const m of data.mediaTexts || []) {
    if (typeof m.mediaId !== 'number') throw new Error('mediaTexts: chýba číselné `mediaId`');
    if (m.alt && m.alt.length > 255) throw new Error(`mediaTexts ${m.mediaId}: alt má ${m.alt.length} znakov (limit 255)`);
  }
  if (basename(subor, '.json') !== slug) throw new Error(`meno súboru nesedí so slugom (${basename(subor)} vs ${slug})`);
}

async function main() {
  const subory = readdirSync(PREKLADY).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  const front = subory.filter((f) => !LEN.length || LEN.includes(basename(f, '.json')));
  console.log(`\n=== DÁVKOVÝ ZÁPIS PREKLADOV — ${ZAPIS ? 'ZÁPIS' : 'NASUCHO'} ===`);
  console.log(`súborov v priečinku: ${subory.length} · vo fronte: ${front.length}\n`);

  const app = await createStrapi({ appDir: KOREN, distDir: resolve(KOREN, 'dist') }).load();
  const hlasenia = [];
  let ok = 0, chyb = 0, preskocenych = 0;

  try {
    /* Anglické slugy, ktoré už v databáze sú — nový preklad nesmie prepísať
       cudzí článok. */
    const anglicke = await app.documents(UID).findMany({ locale: 'en', fields: ['slug'], limit: 1000 });
    const obsadene = new Map(anglicke.map((a) => [a.slug, a.documentId]));

    for (const subor of front) {
      const cesta = resolve(PREKLADY, subor);
      let vstup;
      try {
        vstup = JSON.parse(readFileSync(cesta, 'utf8'));
        skontrolujVstup(vstup, subor);
      } catch (e) {
        hlasenia.push(`!! ${subor}: ${e.message}`);
        chyb++;
        continue;
      }
      const { slug, data } = vstup;

      const [sk] = await app.documents(UID).findMany({ filters: { slug }, locale: 'sk', status: 'published', limit: 1, fields: ['slug'] });
      if (!sk) { hlasenia.push(`!! ${slug}: slovenský článok sa nenašiel`); chyb++; continue; }
      const documentId = sk.documentId;

      const cudzi = obsadene.get(data.slug);
      if (cudzi && cudzi !== documentId) {
        hlasenia.push(`!! ${slug}: anglický slug „${data.slug}" už patrí inému článku`);
        chyb++;
        continue;
      }
      const uzMa = [...obsadene.entries()].some(([, id]) => id === documentId);
      if (uzMa && !ZNOVA && !LEN.length) { preskocenych++; continue; }

      const predSk = await app.documents(UID).findOne({ documentId, locale: 'sk', status: 'published', populate: POPULATE });
      const skKoncept = await app.documents(UID).findOne({ documentId, locale: 'sk', status: 'draft', populate: POPULATE });
      const predOdtlacok = odtlacok(predSk);

      /* Bloky: štruktúra a médiá zo slovenskej verzie, text z prekladu. */
      const skBloky = predSk.blocks || [];
      if ((data.blocks || []).length !== skBloky.length) {
        hlasenia.push(`!! ${slug}: blokov ${(data.blocks || []).length}, slovenská verzia má ${skBloky.length}`);
        chyb++;
        continue;
      }
      const zleTypy = (data.blocks || []).filter((b, i) => b.__component !== skBloky[i].__component);
      if (zleTypy.length) {
        hlasenia.push(`!! ${slug}: ${zleTypy.length} blokov má iný typ než slovenská verzia`);
        chyb++;
        continue;
      }
      if (!ZAPIS) { hlasenia.push(`· ${slug} → ${data.slug} · ${skBloky.length} blokov · nasucho`); continue; }

      const bloky = (data.blocks || []).map((b, i) => {
        const zo = skBloky[i];
        const von = { ...b };
        for (const pole of ['image', 'images', 'secondImage']) {
          if (zo[pole] === undefined) continue;
          const idcka = Array.isArray(zo[pole]) ? zo[pole].map((m) => m?.id ?? m) : (zo[pole]?.id ?? zo[pole] ?? null);
          if (von[pole] === undefined || von[pole] === null || (Array.isArray(von[pole]) && !von[pole].length)) von[pole] = idcka;
        }
        if (b.__component === 'content.sources' && Array.isArray(zo.items) && !(b.items || []).length) {
          von.items = zo.items.map(({ id, ...z }) => z);
        }
        return von;
      });

      const zdielane = {
        coverImage: predSk.coverImage?.id ?? null,
        coverPosition: predSk.coverPosition ?? null,
        gallery: (predSk.gallery || []).map((g) => g.id),
        galleryColumns: predSk.galleryColumns ?? null,
        category: predSk.category?.id ?? null,
        tags: (predSk.tags || []).map((t) => t.id),
        authorName: predSk.authorName ?? null,
        featured: !!predSk.featured,
        readingTime: predSk.readingTime ?? null,
        originalPublishedDate: predSk.originalPublishedDate ?? null,
        location: predSk.location ? (({ id, ...z }) => z)(predSk.location) : null,
      };

      try {
        await app.documents(UID).update({ documentId, locale: 'en', data: { ...zdielane, ...data, blocks: bloky } });
        await app.documents(UID).publish({ documentId, locale: 'en' });

        /* Vrátenie slovenského konceptu — zakladanie jazykovej verzie ho
           v Strapi 5 prepíše. */
        const naZapis = (k) => ({
          title: k.title, slug: k.slug, excerpt: k.excerpt, metaTitle: k.metaTitle, metaDescription: k.metaDescription,
          blocks: (k.blocks || []).map((b) => {
            const von = { __component: b.__component };
            for (const [kk, vv] of Object.entries(b)) {
              if (['__component', 'id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt', 'locale'].includes(kk)) continue;
              if (['image', 'images', 'secondImage'].includes(kk)) {
                von[kk] = Array.isArray(vv) ? vv.map((m) => m?.id ?? m) : (vv && typeof vv === 'object' ? vv.id : vv ?? null);
              } else if (kk === 'items') von[kk] = (vv || []).map(({ id, ...z }) => z);
              else von[kk] = vv;
            }
            return von;
          }),
          keyFacts: (k.keyFacts || []).map(({ id, ...z }) => z),
          timeline: (k.timeline || []).map(({ id, ...z }) => z),
          quotes: (k.quotes || []).map(({ id, ...z }) => z),
          mediaTexts: (k.mediaTexts || []).map(({ id, ...z }) => z),
        });
        if (skKoncept) await app.documents(UID).update({ documentId, locale: 'sk', data: naZapis(skKoncept) });

        const en = await app.documents(UID).findOne({ documentId, locale: 'en', status: 'published', populate: POPULATE });
        const poSk = await app.documents(UID).findOne({ documentId, locale: 'sk', status: 'published', populate: POPULATE });
        const obrSk = skBloky.filter((b) => b.image).length;
        const obrEn = (en.blocks || []).filter((b) => b.image).length;
        const zdrojeSk = skBloky.filter((b) => b.__component === 'content.sources').reduce((n, b) => n + (b.items || []).length, 0);
        const zdrojeEn = (en.blocks || []).filter((b) => b.__component === 'content.sources').reduce((n, b) => n + (b.items || []).length, 0);
        const skSedi = odtlacok(poSk) === predOdtlacok;
        const enSedi = en.title === data.title && en.slug === data.slug
          && (en.blocks || []).length === skBloky.length && obrEn === obrSk && zdrojeEn === zdrojeSk
          && (en.gallery || []).length === (predSk.gallery || []).length
          && (en.mediaTexts || []).length === (data.mediaTexts || []).length;

        obsadene.set(data.slug, documentId);
        if (skSedi && enSedi) {
          ok++;
          hlasenia.push(`✓ ${slug} → ${data.slug} · ${skBloky.length} blokov · obr ${obrEn}/${obrSk} · zdroje ${zdrojeEn}/${zdrojeSk} · popisov ${(en.mediaTexts || []).length}`);
        } else {
          chyb++;
          hlasenia.push(`!! ${slug}: ${!skSedi ? 'SLOVENČINA ZMENENÁ' : ''} ${!enSedi ? `EN nesedí (obr ${obrEn}/${obrSk}, zdroje ${zdrojeEn}/${zdrojeSk}, popisov ${(en.mediaTexts || []).length}/${(data.mediaTexts || []).length})` : ''}`);
        }
      } catch (e) {
        chyb++;
        hlasenia.push(`!! ${slug}: ${e.message.slice(0, 160)}`);
      }
    }
  } finally {
    await app.destroy();
  }

  console.log(hlasenia.join('\n'));
  console.log(`\nzapísaných ${ok} · chýb ${chyb} · preskočených (už majú angličtinu) ${preskocenych}`);
  if (!ZAPIS) console.log('(nasucho — nič sa nezapísalo)');
  process.exit(chyb ? 1 : 0);
}

main().catch((e) => { console.error('\nCHYBA:', e.message); process.exit(1); });
