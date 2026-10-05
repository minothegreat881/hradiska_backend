#!/usr/bin/env node
/**
 * zrkadli-strukturu.cjs — anglická verzia sa drží slovenskej.
 *
 * Slovenská verzia je ZÁVÄZNÁ pre štruktúru: poradie blokov, obrázky, galérie,
 * vložené videá, bibliografiu, titulnú fotku, kategóriu, štítky a polohu.
 * Anglická verzia je záväzná pre TEXT. Keď v slovenskom článku presuniete,
 * pridáte alebo zmažete fotku, tento skript prestavia anglickú verziu tak, aby
 * mala tú istú stavbu — a preložený text ponechá tam, kam patrí.
 *
 * Párovanie blokov nie je podľa poradia (to by sa po vložení odseku rozsypalo),
 * ale podľa odtlačku: obrázky, galérie a vložené videá sú kotvy (majú id médií),
 * textové bloky sa medzi kotvami priraďujú v poradí. Blok, ktorý v angličtine
 * náprotivok nemá, dostane slovenský text a vypíše sa ako „na preklad".
 *
 *   node scripts/preklad/zrkadli-strukturu.cjs                 # nasucho
 *   node scripts/preklad/zrkadli-strukturu.cjs --zapis
 *   node scripts/preklad/zrkadli-strukturu.cjs --zapis --len=molpir
 */

const { resolve } = require('node:path');
const { createStrapi } = require('@strapi/strapi');

const KOREN = resolve(__dirname, '..', '..');
const UID = 'api::blog-post.blog-post';
const arg = (m, d = null) => (process.argv.find((a) => a.startsWith(m))?.slice(m.length)) ?? d;
const ZAPIS = process.argv.includes('--zapis');
const LEN = arg('--len=');

const POPULATE = {
  coverImage: true, gallery: true, tags: true, category: true,
  keyFacts: true, timeline: true, quotes: true, location: true,
  blocks: { populate: '*' },
};

/** Textové polia, ktoré sa preberajú z anglickej verzie. */
const TEXTOVE = {
  'content.rich-text': ['body'],
  'content.quote-block': ['text', 'author', 'source'],
  'content.poem': ['text', 'title', 'author', 'source'],
  'content.sources': ['title', 'intro'],
  'content.image-block': ['alt', 'caption'],
  'content.embed': ['caption'],
  'content.image-gallery': [],
};

const naId = (v) => (Array.isArray(v) ? v.map((m) => m?.id ?? m) : (v && typeof v === 'object' ? (v.id ?? null) : (v ?? null)));

/** Odtlačok bloku — podľa neho sa bloky párujú a zisťuje sa zmena štruktúry. */
function odtlacok(b) {
  switch (b.__component) {
    case 'content.image-block': return `obr:${naId(b.image) ?? '—'}`;
    case 'content.image-gallery': return `gal:${(naId(b.images) || []).join(',')}`;
    case 'content.embed': return `vid:${b.embedId || b.url || ''}`;
    case 'content.sources': return 'zdroje';
    default: return b.__component;
  }
}
const kotva = (b) => ['content.image-block', 'content.image-gallery', 'content.embed'].includes(b.__component);
const stavba = (bloky) => (bloky || []).map(odtlacok).join(' | ');

/** Blok do zápisu: štruktúra zo slovenskej verzie, text z priradenej anglickej. */
function zloz(skBlok, enBlok) {
  const von = { __component: skBlok.__component };
  for (const [k, v] of Object.entries(skBlok)) {
    if (['__component', 'id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt', 'locale'].includes(k)) continue;
    if (['image', 'images', 'secondImage'].includes(k)) { von[k] = naId(v); continue; }
    if (k === 'items') { von[k] = (v || []).map(({ id, ...z }) => z); continue; }
    von[k] = v;
  }
  if (enBlok) for (const pole of TEXTOVE[skBlok.__component] || []) {
    if (enBlok[pole] !== undefined && enBlok[pole] !== null) von[pole] = enBlok[pole];
  }
  return von;
}

/**
 * Priradí anglické bloky k slovenským. Kotvy (obrázky, galérie, videá) sa
 * párujú podľa odtlačku, textové bloky podľa poradia medzi kotvami.
 */
function priraď(skBloky, enBloky) {
  const volne = enBloky.map((b, i) => ({ b, i, pouzity: false }));
  const vysledok = [];
  let naPreklad = 0;

  for (const sk of skBloky) {
    const fp = odtlacok(sk);
    let kandidat = null;
    if (kotva(sk)) {
      kandidat = volne.find((x) => !x.pouzity && odtlacok(x.b) === fp) || null;
    } else {
      kandidat = volne.find((x) => !x.pouzity && x.b.__component === sk.__component) || null;
    }
    if (kandidat) kandidat.pouzity = true; else if ((TEXTOVE[sk.__component] || []).length) naPreklad++;
    vysledok.push(zloz(sk, kandidat?.b || null));
  }
  return { bloky: vysledok, naPreklad, nepouzite: volne.filter((x) => !x.pouzity).length };
}

async function main() {
  console.log(`\n=== ZRKADLENIE ŠTRUKTÚRY — ${ZAPIS ? 'ZÁPIS' : 'NASUCHO'} ===\n`);
  const app = await createStrapi({ appDir: KOREN, distDir: resolve(KOREN, 'dist') }).load();

  try {
    const anglicke = await app.documents(UID).findMany({ locale: 'en', status: 'published', fields: ['slug'], limit: 1000 });
    let kontrolovanych = 0, zmenenych = 0, chyb = 0, textovNaPreklad = 0;

    for (const en0 of anglicke) {
      const documentId = en0.documentId;
      const sk = await app.documents(UID).findOne({ documentId, locale: 'sk', status: 'published', populate: POPULATE });
      const en = await app.documents(UID).findOne({ documentId, locale: 'en', status: 'published', populate: POPULATE });
      if (!sk || !en) continue;
      if (LEN && sk.slug !== LEN && en.slug !== LEN) continue;
      kontrolovanych++;

      const rovnake = stavba(sk.blocks) === stavba(en.blocks)
        && (sk.coverImage?.id ?? null) === (en.coverImage?.id ?? null)
        && (sk.gallery || []).map((g) => g.id).join() === (en.gallery || []).map((g) => g.id).join()
        && (sk.category?.id ?? null) === (en.category?.id ?? null)
        && (sk.tags || []).map((t) => t.id).sort().join() === (en.tags || []).map((t) => t.id).sort().join();
      if (rovnake) continue;

      const { bloky, naPreklad, nepouzite } = priraď(sk.blocks || [], en.blocks || []);
      zmenenych++; textovNaPreklad += naPreklad;
      console.log(`• ${sk.slug} → ${en.slug}`);
      console.log(`    sk: ${stavba(sk.blocks)}`);
      console.log(`    en: ${stavba(en.blocks)}`);
      if (naPreklad) console.log(`    ${naPreklad} nových textových blokov → ostávajú po slovensky, treba preložiť`);
      if (nepouzite) console.log(`    ${nepouzite} anglických blokov zaniklo (zmazané v slovenčine)`);
      if (!ZAPIS) continue;

      /* Zápis tou istou bezpečnou cestou ako preklad: snímka slovenského
         konceptu, update + publish anglickej verzie, vrátenie konceptu. */
      const skKoncept = await app.documents(UID).findOne({ documentId, locale: 'sk', status: 'draft', populate: POPULATE });
      const data = {
        /* Anglické textové polia sa posielajú znova z publikovanej anglickej
           verzie. Bez toho by ich prepísala slovenčina: úprava slovenského
           článku preteká do anglického KONCEPTU (správanie Strapi 5) a následné
           publikovanie by tú slovenčinu vytiahlo na web. */
        title: en.title, slug: en.slug, excerpt: en.excerpt,
        metaTitle: en.metaTitle, metaDescription: en.metaDescription,
        blocks: bloky,
        coverImage: sk.coverImage?.id ?? null,
        coverPosition: sk.coverPosition ?? null,
        gallery: (sk.gallery || []).map((g) => g.id),
        galleryColumns: sk.galleryColumns ?? null,
        category: sk.category?.id ?? null,
        tags: (sk.tags || []).map((t) => t.id),
        location: sk.location ? (({ id, ...z }) => z)(sk.location) : null,
        readingTime: sk.readingTime ?? null,
        originalPublishedDate: sk.originalPublishedDate ?? null,
      };
      try {
        await app.documents(UID).update({ documentId, locale: 'en', data });
        await app.documents(UID).publish({ documentId, locale: 'en' });
        const naZapis = (k) => ({
          title: k.title, slug: k.slug, excerpt: k.excerpt, metaTitle: k.metaTitle, metaDescription: k.metaDescription,
          blocks: (k.blocks || []).map((b) => zloz(b, null)),
          keyFacts: (k.keyFacts || []).map(({ id, ...z }) => z),
          timeline: (k.timeline || []).map(({ id, ...z }) => z),
          quotes: (k.quotes || []).map(({ id, ...z }) => z),
        });
        await app.documents(UID).update({ documentId, locale: 'sk', data: naZapis(skKoncept) });

        const po = await app.documents(UID).findOne({ documentId, locale: 'en', status: 'published', populate: POPULATE });
        const poSk = await app.documents(UID).findOne({ documentId, locale: 'sk', status: 'published', populate: POPULATE });
        const sedi = stavba(po.blocks) === stavba(sk.blocks) && po.title === en.title && po.slug === en.slug;
        const skOk = poSk.title === sk.title && stavba(poSk.blocks) === stavba(sk.blocks);
        console.log(`    ${sedi ? '✓ zrkadlené' : '!! štruktúra stále nesedí'} · slovenčina ${skOk ? 'nedotknutá' : 'POZOR, ZMENENÁ'}`);
        if (!sedi || !skOk) chyb++;
      } catch (e) {
        console.error(`    !! ${sk.slug}: ${e.message}`);
        chyb++;
      }
    }

    console.log(`\nkontrolovaných ${kontrolovanych} · rozídených ${zmenenych} · chýb ${chyb}`
      + (textovNaPreklad ? ` · nových textov na preklad ${textovNaPreklad}` : ''));
    if (!ZAPIS && zmenenych) console.log('(nasucho — nič sa nezapísalo)');
  } finally {
    await app.destroy();
  }
}

main().catch((e) => { console.error('\nCHYBA:', e.message); process.exit(1); });
