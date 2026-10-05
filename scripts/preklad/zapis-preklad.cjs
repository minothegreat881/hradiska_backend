#!/usr/bin/env node
/**
 * zapis-preklad.mjs — zapíše anglickú verziu článku.
 *
 * NEPOUŽÍVA REST. Obyčajné `PUT /api/blog-posts/:id?locale=en` pri tomto
 * projekte prepísalo názov SLOVENSKEJ publikovanej verzie — overené na kópii
 * produkčnej databázy. Jazykové verzie preto zapisuje Document Service zvnútra
 * Strapi, kde je význam `locale` jednoznačný.
 *
 * Skript sa spúšťa TAM, KDE JE DATABÁZA (lokálne proti kópii, na serveri proti
 * produkcii), nie cez sieť:
 *
 *   node scripts/preklad/zapis-preklad.cjs --subor=preklady/bojna.json
 *   node scripts/preklad/zapis-preklad.cjs --subor=preklady/bojna.json --zapis
 *
 * Vstupný súbor je JSON:
 *   { "slug": "<slovenský slug>", "data": { "title": "...", "slug": "...", ... } }
 *
 * `data` obsahuje LEN prekladané polia (title, slug, excerpt, metaTitle,
 * metaDescription, blocks, keyFacts, timeline, quotes). Médiá, kategória,
 * štítky a poloha sú medzi jazykmi zdieľané a do zápisu nepatria.
 */

/* CommonJS zámerne: `import` z @strapi/strapi padá na adresárovom importe
   `lodash/fp` vnútri balíka (ERR_UNSUPPORTED_DIR_IMPORT). */
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createStrapi } = require('@strapi/strapi');

const KOREN = resolve(__dirname, '..', '..');
const arg = (m, d = null) => (process.argv.find((a) => a.startsWith(m))?.slice(m.length)) ?? d;
const ZAPIS = process.argv.includes('--zapis');
const SUBOR = arg('--subor=');
if (!SUBOR) { console.error('chýba --subor=<cesta k JSON s prekladom>'); process.exit(1); }

const POLIA = ['title', 'slug', 'excerpt', 'metaTitle', 'metaDescription', 'blocks', 'keyFacts', 'timeline', 'quotes',
  /* popisy fotiek v galérii pre tento jazyk — knižnica médií má popis jeden
     pre celý web, takže anglická galéria by inak stála po slovensky */
  'mediaTexts'];

/** Čo sa nesmie dostať do zápisu — zdieľané polia a technické kľúče. */
const ZAKAZANE = ['coverImage', 'gallery', 'galleryColumns', 'coverPosition', 'category', 'tags',
  'location', 'comments', 'authorName', 'featured', 'readingTime', 'originalPublishedDate',
  'id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt', 'locale', 'localizations'];

const UID = 'api::blog-post.blog-post';

async function main() {
  const vstup = JSON.parse(readFileSync(resolve(KOREN, SUBOR), 'utf8'));
  const { slug, data } = vstup;
  if (!slug || !data) throw new Error('vstup musí mať `slug` (slovenský) a `data`');

  const zle = Object.keys(data).filter((k) => ZAKAZANE.includes(k));
  if (zle.length) throw new Error(`do prekladu nepatria zdieľané polia: ${zle.join(', ')}`);
  const neznáme = Object.keys(data).filter((k) => !POLIA.includes(k));
  if (neznáme.length) throw new Error(`neznáme polia: ${neznáme.join(', ')}`);
  if (!data.slug || /[^a-z0-9-]/.test(data.slug)) throw new Error('anglický slug musí byť a-z, 0-9 a spojovníky');
  if (data.slug === slug) throw new Error('anglický slug sa nesmie rovnať slovenskému');

  const app = await createStrapi({ appDir: KOREN, distDir: resolve(KOREN, 'dist') }).load();

  try {
    const [sk] = await app.documents(UID).findMany({ filters: { slug }, locale: 'sk', status: 'published', limit: 1 });
    if (!sk) throw new Error(`slovenský článok so slugom ${slug} sa nenašiel`);
    const documentId = sk.documentId;

    const POPULATE = { coverImage: true, gallery: true, tags: true, category: true, keyFacts: true, timeline: true, quotes: true, location: true,
      mediaTexts: true, blocks: { populate: '*' } };

    /* SNÍMKA SLOVENSKÉHO KONCEPTU. Strapi 5 pri zakladaní novej jazykovej
       verzie prepíše koncept pôvodného jazyka — overené na kópii, aj bez
       zdieľaných polí. Koncept sa preto odfotí a po zápise sa vráti späť. */
    const skKoncept = await app.documents(UID).findOne({ documentId, locale: 'sk', status: 'draft', populate: POPULATE });

    /* Odtlačok slovenskej verzie PRED zápisom — po zápise sa porovná. */
    const predSk = await app.documents(UID).findOne({ documentId, locale: 'sk', status: 'published',
      populate: POPULATE });
    const odtlacok = (d) => JSON.stringify({
      title: d.title, slug: d.slug, excerpt: d.excerpt, metaTitle: d.metaTitle,
      blokov: (d.blocks || []).length, cover: d.coverImage?.id ?? null,
      galeria: (d.gallery || []).length, stitky: (d.tags || []).map((t) => t.id).sort(),
      kategoria: d.category?.id ?? null,
    });
    const predOdtlacok = odtlacok(predSk);

    console.log(`\nslovenský článok: ${predSk.title}`);
    console.log(`  documentId: ${documentId} · blokov: ${(predSk.blocks || []).length} · galéria: ${(predSk.gallery || []).length}`);
    console.log(`anglický preklad: ${data.title}`);
    console.log(`  slug: ${data.slug} · blokov: ${(data.blocks || []).length}`);

    if (!ZAPIS) { console.log('\n(nasucho — nič sa nezapísalo)'); return; }

    /* Zdieľané polia sa medzi jazykmi NEPRENESÚ samy — anglická verzia by
       ostala bez titulnej fotky, galérie, kategórie a štítkov. Kopírujú sa
       preto zo slovenskej verzie; prekladateľ sa ich nedotýka. */
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

    /* Obrázky v blokoch a bibliografia v Zdrojoch sa neprekladajú — prekladateľ
       ich ani nepozná (sú to id médií). Dopĺňajú sa pozične zo slovenskej
       verzie; bez toho je anglický článok bez fotiek a bez zoznamu literatúry.
       Overené agentom `terminolog-hradiska` na prvej vzorke. */
    const skBloky = predSk.blocks || [];
    data.blocks = (data.blocks || []).map((b, i) => {
      const zo = skBloky[i];
      if (!zo || zo.__component !== b.__component) return b;
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

    /* DVA KROKY, NIE JEDEN. `update({ status: 'published' })` zapísal anglický
       text do PUBLIKOVANEJ SLOVENSKEJ verzie — overené na kópii. Najprv sa teda
       upraví anglický koncept a až potom sa publikuje výslovne pre jazyk `en`. */
    await app.documents(UID).update({ documentId, locale: 'en', data: { ...zdielane, ...data } });
    await app.documents(UID).publish({ documentId, locale: 'en' });

    /* Vrátenie slovenského konceptu do pôvodného stavu. */
    const naZapis = (k) => ({
      title: k.title, slug: k.slug, excerpt: k.excerpt,
      metaTitle: k.metaTitle, metaDescription: k.metaDescription,
      blocks: (k.blocks || []).map((b) => {
        const von = { __component: b.__component };
        for (const [kk, vv] of Object.entries(b)) {
          if (['__component', 'id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt', 'locale'].includes(kk)) continue;
          if (kk === 'image' || kk === 'images' || kk === 'secondImage') {
            von[kk] = Array.isArray(vv) ? vv.map((m) => m?.id ?? m) : (vv && typeof vv === 'object' ? vv.id : vv ?? null);
          } else von[kk] = vv;
        }
        return von;
      }),
      keyFacts: (k.keyFacts || []).map(({ id, ...z }) => z),
      timeline: (k.timeline || []).map(({ id, ...z }) => z),
      quotes: (k.quotes || []).map(({ id, ...z }) => z),
      mediaTexts: (k.mediaTexts || []).map(({ id, ...z }) => z),
    });
    await app.documents(UID).update({ documentId, locale: 'sk', data: naZapis(skKoncept) });

    /* 1 · anglická verzia existuje a sedí */
    const en = await app.documents(UID).findOne({ documentId, locale: 'en', status: 'published',
      populate: POPULATE });
    const spocitaj = (bloky) => (bloky || []).reduce((a, b) => {
      a.medii += (b.image ? 1 : 0) + (b.images || []).length + (b.secondImage ? 1 : 0);
      a.zdroje += (b.items || []).length;
      return a;
    }, { medii: 0, zdroje: 0 });
    const vSk = spocitaj(predSk.blocks), vEn = spocitaj(en?.blocks);
    const enOk = en && en.title === data.title && en.slug === data.slug
      && (en.blocks || []).length === (data.blocks || []).length
      && vEn.medii === vSk.medii && vEn.zdroje === vSk.zdroje
      && !!en.location === !!predSk.location;

    /* 2 · slovenská verzia sa NEPOHLA — to je tu to podstatné */
    const poSk = await app.documents(UID).findOne({ documentId, locale: 'sk', status: 'published',
      populate: POPULATE });
    const skOk = odtlacok(poSk) === predOdtlacok;

    console.log(`\nanglická verzia zapísaná: ${enOk ? 'áno' : 'NIE'}`);
    console.log(`  médiá zdieľané: cover ${en?.coverImage?.id ?? '—'} · galéria ${(en?.gallery || []).length} · štítky ${(en?.tags || []).length} · kategória ${en?.category?.id ?? '—'}`);
    console.log(`  v blokoch: obrázkov ${vEn.medii}/${vSk.medii} · položiek zdrojov ${vEn.zdroje}/${vSk.zdroje} · poloha ${en?.location ? 'áno' : 'NIE'}`);
    const poSkKoncept = await app.documents(UID).findOne({ documentId, locale: 'sk', status: 'draft', populate: POPULATE });
    const kOdtlacok = (d) => JSON.stringify({ t: d.title, s: d.slug, e: d.excerpt, mt: d.metaTitle,
      b: (d.blocks || []).length, f: (d.keyFacts || []).length, o: (d.timeline || []).length });
    const konceptOk = kOdtlacok(poSkKoncept) === kOdtlacok(skKoncept);

    console.log(`slovenská publikovaná nedotknutá: ${skOk ? 'áno' : 'NIE — POZOR'}`);
    console.log(`slovenský koncept nedotknutý: ${konceptOk ? 'áno' : 'NIE — POZOR'}`);
    if (!konceptOk) {
      console.error('  pred:', kOdtlacok(skKoncept));
      console.error('  po  :', kOdtlacok(poSkKoncept));
      process.exitCode = 1;
    }
    if (!skOk) {
      console.error('  pred:', predOdtlacok);
      console.error('  po  :', odtlacok(poSk));
      process.exitCode = 1;
    }
    if (!enOk) process.exitCode = 1;
  } finally {
    await app.destroy();
  }
}

main().catch((e) => { console.error('\nCHYBA:', e.message); process.exit(1); });
