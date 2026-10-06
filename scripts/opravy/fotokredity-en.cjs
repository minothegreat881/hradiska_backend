#!/usr/bin/env node
/**
 * fotokredity-en.cjs — preloží fotokredity v bloku Zdrojov anglickej verzie.
 *
 * `items` bloku `content.sources` sa kopírujú zo slovenčiny zámerne (bibliografia
 * sa neprekláda). V 24 článkoch sú však medzi nimi fotokredity a vysvetlivky
 * („Foto: Orgoň", „Zdroj produktov LLS: ÚGKK SR, Vizualizácia: …"), ktoré by
 * preložené byť mali — a cez tú konvenciu sa k nim nikto nedostane.
 *
 * Prekláda sa LEN uvádzacie slovo; mená, inštitúcie a skratky ostávajú.
 * Bibliografický záznam (autor s iniciálou, rok, URL) sa nedotýka.
 *
 *   node scripts/opravy/fotokredity-en.cjs            # nasucho, s ukážkou
 *   node scripts/opravy/fotokredity-en.cjs --zapis
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

/** Náhrady uvádzacích slov. Poradie je dôležité — dlhšie vzory najprv. */
const NAHRADY = [
  [/^Foto,\s*text:/i, 'Photo and text:'],
  [/^Foto\s*\(/i, 'Photo ('],
  [/^Fotogaléria:/i, 'Photo gallery:'],
  [/^Fotografie:/i, 'Photographs:'],
  [/^Fotky:/i, 'Photos:'],
  [/^Foto:/i, 'Photo:'],
  [/^Kresby:/i, 'Drawings:'],
  [/^Kresba:/i, 'Drawing:'],
  [/^Zdroj produktov LLS:/i, 'Source of the ALS data:'],
  [/^Zdroj:/i, 'Source:'],
  [/^Mapa:/i, 'Map:'],
  [/^Mapy:/i, 'Maps:'],
  [/^Vizualizácia:/i, 'Visualisation:'],
  [/^Grafika:/i, 'Graphics:'],
  [/^preklad:/i, 'Translation:'],
  [/^Autor fotografií:/i, 'Photographs by:'],
  [/^Pozn\./i, 'Note.'],
];
/** Náhrady vnútri textu (nie na začiatku). */
const VNUTRI = [
  [/,\s*Vizualizácia:/g, ', visualisation:'],
  [/krátené pre potreby/gi, 'abridged for'],
  [/autor myšlienky skanzenu a vedúci výskumného týmu/gi,
    'originator of the open-air museum and head of the research team'],
  [/vedúci výskumu/gi, 'head of the excavation'],
];

function prelozKredit(t) {
  let out = t;
  for (const [vzor, na] of NAHRADY) {
    if (vzor.test(out)) { out = out.replace(vzor, na); break; }
  }
  for (const [vzor, na] of VNUTRI) out = out.replace(vzor, na);
  return out;
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
  console.log(`\n=== FOTOKREDITY V ANGLIČTINE — ${ZAPIS ? 'ZÁPIS' : 'NASUCHO'} ===\n`);
  const app = await createStrapi({ appDir: KOREN, distDir: resolve(KOREN, 'dist') }).load();
  try {
    const en = await app.documents(UID).findMany({ locale: 'en', status: 'published', fields: ['slug'], limit: 1000 });
    let clankov = 0, zmien = 0, chyb = 0;

    for (const e0 of en) {
      const documentId = e0.documentId;
      const clanok = await app.documents(UID).findOne({ documentId, locale: 'en', status: 'published', populate: POPULATE });
      if (!clanok) continue;

      const bloky = (clanok.blocks || []).map((b) => zloz(b));
      let pocet = 0;
      for (const b of bloky) {
        if (b.__component !== 'content.sources') continue;
        for (const it of b.items || []) {
          const pred = (it.text || '');
          const po = prelozKredit(pred);
          if (po !== pred) {
            if (!pocet) console.log(`• ${clanok.slug}`);
            console.log(`    − ${pred.slice(0, 85)}`);
            console.log(`    + ${po.slice(0, 85)}`);
            it.text = po;
            pocet++;
          }
        }
      }
      if (!pocet) continue;
      clankov++; zmien += pocet;
      if (!ZAPIS) continue;

      const skKoncept = await app.documents(UID).findOne({ documentId, locale: 'sk', status: 'draft', populate: POPULATE });
      const predSk = await app.documents(UID).findOne({ documentId, locale: 'sk', status: 'published', fields: ['title', 'slug'] });
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
        if (poSk.title !== predSk.title || poSk.slug !== predSk.slug) { console.log('    !! slovenčina sa zmenila'); chyb++; }
      } catch (err) {
        console.error(`    !! ${clanok.slug}: ${err.message.slice(0, 160)}`);
        chyb++;
      }
    }

    console.log(`\nčlánkov ${clankov} · preložených kreditov ${zmien} · chýb ${chyb}`);
    if (!ZAPIS) console.log('(nasucho — nič sa nezapísalo)');
  } finally {
    await app.destroy();
  }
}

main().catch((e) => { console.error('\nCHYBA:', e.message); process.exit(1); });
