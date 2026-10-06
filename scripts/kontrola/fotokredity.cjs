#!/usr/bin/env node
/**
 * fotokredity.cjs — položky v bloku Zdrojov, ktoré nie sú bibliografia.
 *
 * `zapis-davku.cjs` kopíruje `items` bloku `content.sources` zo slovenskej
 * verzie zámerne: bibliografia sa neprekláda. V niektorých článkoch sú však
 * medzi nimi aj fotokredity a vysvetlivky („Foto: …", „Zdroj produktov LLS…"),
 * ktoré by preložené byť mali — a cez tú konvenciu nikdy nebudú.
 *
 * Toto ich nájde, aby sa dali preložiť ručne (rovnako ako poznámky pod čiarou).
 *
 *   node scripts/kontrola/fotokredity.cjs
 */

const { resolve } = require('node:path');
const { createStrapi } = require('@strapi/strapi');

const KOREN = resolve(__dirname, '..', '..');
const UID = 'api::blog-post.blog-post';

/* Čo je fotokredit alebo vysvetlivka, nie bibliografický záznam. */
const KREDIT = /^\s*(foto|fotografie|fotky|snímky|kresba|kresby|zdroj produktov|zdroj|mapa|mapy|autor fotografi|vizualizácia|grafika|preklad|pozn\.)/i;
/* Typický bibliografický záznam má autora s iniciálou a rok alebo URL. */
const BIBLIO = /[A-ZÁČĎÉÍĽŇÓŠŤÚÝŽ]\.\s|https?:\/\/|\b(19|20)\d\d\b/;

async function main() {
  const app = await createStrapi({ appDir: KOREN, distDir: resolve(KOREN, 'dist') }).load();
  try {
    const sk = await app.documents(UID).findMany({
      locale: 'sk', status: 'published', fields: ['slug'],
      populate: { blocks: { populate: '*' } }, limit: 1000,
    });
    let clankov = 0, poloziek = 0;
    for (const p of sk) {
      const najdene = [];
      for (const b of p.blocks || []) {
        if (b.__component !== 'content.sources') continue;
        for (const [i, it] of (b.items || []).entries()) {
          const t = (it.text || '').trim();
          if (!t) continue;
          if (KREDIT.test(t) && !BIBLIO.test(t)) najdene.push(`[${i}] ${t.slice(0, 90)}`);
        }
      }
      if (najdene.length) {
        clankov++; poloziek += najdene.length;
        console.log(`• ${p.slug}`);
        for (const n of najdene) console.log(`    ${n}`);
      }
    }
    console.log(`\nčlánkov ${clankov} · položiek na preklad ${poloziek}`);
  } finally {
    await app.destroy();
  }
}

main().catch((e) => { console.error('\nCHYBA:', e.message); process.exit(1); });
