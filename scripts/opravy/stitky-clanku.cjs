#!/usr/bin/env node
/**
 * stitky-clanku.cjs — prepíše štítky JEDNÉHO článku.
 *
 * Štítky sú medzi jazykmi zdieľané (jedna relácia pre slovenskú aj anglickú
 * verziu), ale Strapi ich pri i18n drží pri každej jazykovej verzii zvlášť.
 * Preto sa zapisujú do slovenskej verzie a anglickú dorovná zrkadlenie
 * (`zrkadli-strukturu.cjs`, cron), rovnako ako obrázky a kategóriu.
 *
 * NEPOUŽÍVA REST: `PUT /api/blog-posts/:id` pri zapnutom i18n prepísal
 * v tomto projekte cudziu jazykovú verziu. Zapisuje Document Service zvnútra
 * Strapi, teda sa spúšťa TAM, KDE JE DATABÁZA (na serveri).
 *
 *   node scripts/opravy/stitky-clanku.cjs --slug=rekomberek-horne-oresany \
 *     --stitky="Avari a starí Maďari,Veľká Morava,Opevnenie a jeho stavba"
 *   … a s `--zapis` sa to naozaj zapíše.
 */

const { resolve } = require('node:path');
const { createStrapi } = require('@strapi/strapi');

const KOREN = resolve(__dirname, '..', '..');
const UID = 'api::blog-post.blog-post';
const TAG = 'api::blog-tag.blog-tag';
const arg = (m, d = null) => (process.argv.find((a) => a.startsWith(m))?.slice(m.length)) ?? d;
const ZAPIS = process.argv.includes('--zapis');
const SLUG = arg('--slug=');
const STITKY = (arg('--stitky=') || '').split(',').map((s) => s.trim()).filter(Boolean);

if (!SLUG || !STITKY.length) {
  console.error('použitie: --slug=<slovenský slug> --stitky="Meno 1,Meno 2" [--zapis]');
  process.exit(1);
}

async function main() {
  const app = await createStrapi({ appDir: KOREN, distDir: resolve(KOREN, 'dist') }).load();
  try {
    const [sk] = await app.documents(UID).findMany({
      filters: { slug: SLUG }, locale: 'sk', status: 'published', limit: 1,
      populate: { tags: true },
    });
    if (!sk) throw new Error(`článok ${SLUG} sa nenašiel`);

    /* Mená štítkov sa hľadajú presne. Pozor na NFD/NFC: reťazec z príkazového
       riadka môže mať inak zloženú diakritiku než databáza, preto sa porovnáva
       normalizovane. */
    const n = (s) => s.normalize('NFC');
    const vsetky = await app.documents(TAG).findMany({ fields: ['name'], limit: 500 });
    const podlaMena = new Map(vsetky.map((t) => [n(t.name), t]));
    const ciel = STITKY.map((meno) => {
      const t = podlaMena.get(n(meno));
      if (!t) throw new Error(`štítok „${meno}" v databáze nie je`);
      return t;
    });

    console.log(`\n${sk.title}`);
    console.log(`  teraz: ${(sk.tags || []).map((t) => t.name).join(' · ') || '—'}`);
    console.log(`  bude:  ${ciel.map((t) => t.name).join(' · ')}`);
    if (!ZAPIS) { console.log('\n(nasucho — nič sa nezapísalo)'); return; }

    const documentId = sk.documentId;
    await app.documents(UID).update({ documentId, locale: 'sk', data: { tags: ciel.map((t) => t.id) } });
    await app.documents(UID).publish({ documentId, locale: 'sk' });

    const po = await app.documents(UID).findOne({ documentId, locale: 'sk', status: 'published', populate: { tags: true } });
    const sedi = (po.tags || []).map((t) => n(t.name)).sort().join('|') === ciel.map((t) => n(t.name)).sort().join('|');
    console.log(`\n${sedi ? '✓ zapísané' : '!! nesedí'}: ${(po.tags || []).map((t) => t.name).join(' · ')}`);
    console.log(`  názov a slug nedotknuté: ${po.title === sk.title && po.slug === sk.slug ? 'áno' : 'POZOR, ZMENENÉ'}`);
    console.log('  anglickú verziu dorovná zrkadlenie (cron, do 10 minút)');
  } finally {
    await app.destroy();
  }
}

main().catch((e) => { console.error('\nCHYBA:', e.message); process.exit(1); });
