#!/usr/bin/env node
/**
 * uvodzovky-en.cjs — slovenské úvodzovky v anglickom texte.
 *
 * Slovenčina používa „dole-hore“, angličtina “hore-hore”. Pri preklade sa
 * dolná úvodzovka miestami prenesla do anglického textu a päť rôznych dávok
 * terminológa to nahlásilo ako typografiu, ktorej sa nechcú dotýkať.
 *
 * Pozor na pascu: slovenská ZATVÁRACIA úvodzovka (“) je ten istý znak ako
 * anglická OTVÁRACIA. Nedá sa teda nahradzovať po znakoch — treba prejsť
 * reťazec a prepísať len pár, ktorý začína dolnou úvodzovkou.
 *
 * Mení LEN anglické verzie a len text; slovenčiny sa nedotýka.
 *
 *   node scripts/opravy/uvodzovky-en.cjs            # nasucho
 *   node scripts/opravy/uvodzovky-en.cjs --zapis
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

/** `„text“` → `“text”`; nepárovú dolnú úvodzovku nechá na pokoji. */
function oprav(s) {
  let out = '';
  let i = 0;
  let zmien = 0;
  while (i < s.length) {
    const z = s[i];
    if (z === '„') { // „
      const koniec = s.indexOf('“', i + 1); // “
      if (koniec === -1) { out += z; i++; continue; }
      out += '“' + s.slice(i + 1, koniec) + '”';
      zmien += 2;
      i = koniec + 1;
      continue;
    }
    out += z;
    i++;
  }
  return { text: out, zmien };
}

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
  console.log(`\n=== SLOVENSKÉ ÚVODZOVKY V ANGLIČTINE — ${ZAPIS ? 'ZÁPIS' : 'NASUCHO'} ===\n`);
  const app = await createStrapi({ appDir: KOREN, distDir: resolve(KOREN, 'dist') }).load();
  try {
    const en = await app.documents(UID).findMany({ locale: 'en', status: 'published', fields: ['slug'], limit: 1000 });
    let clankov = 0, zmien = 0, chyb = 0;

    for (const e0 of en) {
      const documentId = e0.documentId;
      const clanok = await app.documents(UID).findOne({ documentId, locale: 'en', status: 'published', populate: POPULATE });
      if (!clanok) continue;

      let pocet = 0;
      const prejdi = (n) => {
        if (Array.isArray(n)) return n.forEach(prejdi);
        if (!n || typeof n !== 'object') return;
        if (typeof n.text === 'string') { const r = oprav(n.text); n.text = r.text; pocet += r.zmien; }
        if (typeof n.caption === 'string') { const r = oprav(n.caption); n.caption = r.text; pocet += r.zmien; }
        if (typeof n.alt === 'string') { const r = oprav(n.alt); n.alt = r.text; pocet += r.zmien; }
        for (const v of Object.values(n)) prejdi(v);
      };

      const bloky = (clanok.blocks || []).map((b) => zloz(b));
      const keyFacts = (clanok.keyFacts || []).map(({ id, ...z }) => z);
      const timeline = (clanok.timeline || []).map(({ id, ...z }) => z);
      const quotes = (clanok.quotes || []).map(({ id, ...z }) => z);
      const mediaTexts = (clanok.mediaTexts || []).map(({ id, ...z }) => z);
      prejdi(bloky); prejdi(keyFacts); prejdi(timeline); prejdi(quotes); prejdi(mediaTexts);
      const title = oprav(clanok.title || '');
      const excerpt = oprav(clanok.excerpt || '');
      const metaTitle = oprav(clanok.metaTitle || '');
      const metaDescription = oprav(clanok.metaDescription || '');
      pocet += title.zmien + excerpt.zmien + metaTitle.zmien + metaDescription.zmien;
      if (!pocet) continue;

      clankov++; zmien += pocet;
      console.log(`• ${clanok.slug}: ${pocet} úvodzoviek`);
      if (!ZAPIS) continue;

      const skKoncept = await app.documents(UID).findOne({ documentId, locale: 'sk', status: 'draft', populate: POPULATE });
      const predSk = await app.documents(UID).findOne({ documentId, locale: 'sk', status: 'published', fields: ['title', 'slug'] });
      try {
        await app.documents(UID).update({
          documentId, locale: 'en',
          data: { title: title.text, slug: clanok.slug, excerpt: excerpt.text,
            metaTitle: metaTitle.text, metaDescription: metaDescription.text,
            blocks: bloky, keyFacts, timeline, quotes, mediaTexts },
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

    console.log(`\nčlánkov ${clankov} · opravených úvodzoviek ${zmien} · chýb ${chyb}`);
    if (!ZAPIS) console.log('(nasucho — nič sa nezapísalo)');
  } finally {
    await app.destroy();
  }
}

main().catch((e) => { console.error('\nCHYBA:', e.message); process.exit(1); });
