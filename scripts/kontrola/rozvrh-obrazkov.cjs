#!/usr/bin/env node
/**
 * rozvrh-obrazkov.cjs — má anglická verzia tie isté fotky NA TOM ISTOM mieste
 * a v tej istej veľkosti ako slovenská?
 *
 * `zrkadli-strukturu.cjs` porovnáva odtlačok štruktúry (ktoré médiá a v akom
 * poradí), ale NIE polia rozvrhu: `width`, `position`, `aspectRatio`,
 * `objectPosition`, `showCaption`, `rounded`, `shadow`, `pairWithNext`.
 * Keby sa rozišli, anglický článok má fotku inak veľkú alebo inak obtekanú
 * než slovenský — a to je presne to, čo má byť rovnaké.
 *
 *   node scripts/kontrola/rozvrh-obrazkov.cjs
 *   node scripts/kontrola/rozvrh-obrazkov.cjs --json=<cesta>
 */

const { resolve } = require('node:path');
const { writeFileSync } = require('node:fs');
const { createStrapi } = require('@strapi/strapi');

const KOREN = resolve(__dirname, '..', '..');
const UID = 'api::blog-post.blog-post';
const JSON_VYSTUP = (process.argv.find((a) => a.startsWith('--json=')) || '').slice(7);

/** Polia rozvrhu — tie musia byť v oboch jazykoch rovnaké. */
const POLIA = ['width', 'position', 'aspectRatio', 'objectPosition', 'showCaption', 'rounded', 'shadow', 'pairWithNext'];
const POPULATE = { blocks: { populate: '*' }, coverImage: true, gallery: true };

async function main() {
  const app = await createStrapi({ appDir: KOREN, distDir: resolve(KOREN, 'dist') }).load();
  try {
    const en = await app.documents(UID).findMany({ locale: 'en', status: 'published', fields: ['slug'], limit: 1000 });
    const rozdiely = [];
    let obrazkov = 0, sedi = 0;

    for (const e0 of en) {
      const documentId = e0.documentId;
      const [sk, enf] = await Promise.all([
        app.documents(UID).findOne({ documentId, locale: 'sk', status: 'published', fields: ['slug'], populate: POPULATE }),
        app.documents(UID).findOne({ documentId, locale: 'en', status: 'published', fields: ['slug'], populate: POPULATE }),
      ]);
      if (!sk || !enf) continue;

      const skObr = (sk.blocks || []).filter((b) => b.__component === 'content.image-block');
      const enObr = (enf.blocks || []).filter((b) => b.__component === 'content.image-block');
      const nalezy = [];
      if (skObr.length !== enObr.length) {
        nalezy.push({ kde: 'počet', sk: skObr.length, en: enObr.length });
      } else {
        for (let i = 0; i < skObr.length; i++) {
          obrazkov++;
          let zhoda = true;
          for (const p of POLIA) {
            const a = skObr[i][p] ?? null;
            const b = enObr[i][p] ?? null;
            if (String(a) !== String(b)) { nalezy.push({ kde: `obrázok ${i + 1}.${p}`, sk: a, en: b }); zhoda = false; }
          }
          /* Aj to isté médium — keby sa fotky posunuli, rozvrh nič nepovie. */
          const idSk = skObr[i].image?.id ?? null;
          const idEn = enObr[i].image?.id ?? null;
          if (idSk !== idEn) { nalezy.push({ kde: `obrázok ${i + 1}.médium`, sk: idSk, en: idEn }); zhoda = false; }
          if (zhoda) sedi++;
        }
      }
      if (nalezy.length) rozdiely.push({ slug: sk.slug, en: enf.slug, nalezy });
    }

    console.log(`\n=== ROZVRH OBRÁZKOV SK vs EN — ${en.length} článkov ===\n`);
    console.log(`obrázkových blokov porovnaných: ${obrazkov} · zhodných: ${sedi} · rozdielnych: ${obrazkov - sedi}`);
    console.log(`článkov s rozdielom: ${rozdiely.length}\n`);
    const podlaPola = {};
    for (const r of rozdiely) for (const n of r.nalezy) {
      const pole = n.kde.split('.').pop();
      podlaPola[pole] = (podlaPola[pole] || 0) + 1;
    }
    for (const [p, n] of Object.entries(podlaPola).sort((a, b) => b[1] - a[1])) console.log(`  ${p.padEnd(16)} ${n}`);
    for (const r of rozdiely.slice(0, 15)) {
      console.log(`\n• ${r.slug}`);
      for (const n of r.nalezy.slice(0, 6)) console.log(`    ${n.kde}: sk=${n.sk} en=${n.en}`);
      if (r.nalezy.length > 6) console.log(`    … ďalších ${r.nalezy.length - 6}`);
    }
    if (JSON_VYSTUP) {
      writeFileSync(JSON_VYSTUP, JSON.stringify({ obrazkov, sedi, rozdiely }, null, 1), 'utf8');
      console.log(`\nzapísané do ${JSON_VYSTUP}`);
    }
  } finally {
    await app.destroy();
  }
}

main().catch((e) => { console.error('\nCHYBA:', e.message); process.exit(1); });
