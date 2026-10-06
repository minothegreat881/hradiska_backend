#!/usr/bin/env node
/**
 * terminologia-en.cjs — strojová kontrola terminológie v anglických článkoch.
 *
 * Záväzný slovník (`docs/TERMINOLOGIA-EN.md`) je zväčša mapovanie slov, a to
 * sa dá zmerať. Tento skript prejde všetky anglické články a vypíše miesta,
 * ktoré slovník zakazuje alebo pri ktorých sa preklady rozišli. Výsledok je
 * VSTUP PRE AGENTA `terminolog-hradiska`, nie oprava: o tom, či je výskyt
 * naozaj chybný, rozhoduje kontext (napríklad `castle` je pri stredovekom
 * hrade správne a pri hradisku nie).
 *
 * Prečo takto: pustiť terminológa naslepo na 364 článkov je drahé a väčšinu
 * času by čítal bezchybné odseky. Takto dostane zoznam miest.
 *
 *   node scripts/kontrola/terminologia-en.cjs            # prehľad
 *   node scripts/kontrola/terminologia-en.cjs --podrobne # aj ukážky viet
 *   node scripts/kontrola/terminologia-en.cjs --json=<cesta>
 */

const { resolve } = require('node:path');
const { writeFileSync } = require('node:fs');
const { createStrapi } = require('@strapi/strapi');

const KOREN = resolve(__dirname, '..', '..');
const UID = 'api::blog-post.blog-post';
const PODROBNE = process.argv.includes('--podrobne');
const JSON_VYSTUP = (process.argv.find((a) => a.startsWith('--json=')) || '').slice(7);

/**
 * Pravidlá. `vzor` sa hľadá bez ohľadu na veľkosť písmen, ak nie je uvedené
 * inak; `tvrde` = slovník to zakazuje bez výnimky, ostatné sú „na posúdenie".
 */
const PRAVIDLA = [
  /* §12 — falošní priatelia, ktoré sú zakázané vždy */
  { id: 'shard', vzor: /\bshards?\b/gi, tvrde: true, spravne: 'sherd' },
  /* Len ANGLICKÉ tvary. Slovenské a české „Archeologický ústav" či
     „Archeologické rozhledy" v bibliografii sú správne tak, ako sú. */
  { id: 'archeologist', vzor: /archeolog(y|ist|ists|ical|ically)/gi, tvrde: true, spravne: 'archaeolog…' },
  { id: 'our-territory', vzor: /\bour (territory|land|country)\b/gi, tvrde: true, spravne: 'the territory of present-day Slovakia' },
  { id: 'slovenes', vzor: /\bSlovenes?\b/g, tvrde: true, spravne: 'the Slavs / the Moravians' },
  { id: 'tatar', vzor: /\bTatar invasion\b/gi, tvrde: true, spravne: 'the Mongol invasion' },
  { id: 'findings', vzor: /\bfindings?\b/gi, tvrde: true, spravne: 'find / finds / insights' },
  { id: 'settling', vzor: /\bsettling\b/gi, tvrde: true, spravne: 'occupation' },
  { id: 'mother-of-pearl', vzor: /\bmother-of-pearl\b/gi, tvrde: true, spravne: 'beaded' },
  { id: 'blockade', vzor: /\bblockade\b/gi, tvrde: true, spravne: 'blocking work' },
  { id: 'axe-with-wings', vzor: /\baxe with wings\b/gi, tvrde: true, spravne: 'winged axe' },
  { id: 'housing-estate', vzor: /\bhousing estate\b/gi, tvrde: true, spravne: 'settlement' },

  /* Veľké písmená a ustálené tvary */
  { id: 'Early-Medieval-adj', vzor: /\bEarly Medieval\b/g, tvrde: true, spravne: 'early medieval (malým)' },
  { id: 'Great-Moravian-Empire', vzor: /\bGreat Moravian Empire\b/gi, tvrde: true, spravne: 'Great Moravia' },
  { id: 'middle-danube', vzor: /\bmiddle Danube\b/g, tvrde: true, spravne: 'the Middle Danube region' },
  { id: 'la-tene', vzor: /\bLatene\b|\bLa Tene\b/g, tvrde: true, spravne: 'La Tène' },
  { id: 'puchov', vzor: /\bPuchov culture\b/g, tvrde: true, spravne: 'Púchov culture' },

  /* Na posúdenie — kontext rozhoduje */
  { id: 'castle', vzor: /\bcastles?\b/gi, tvrde: false, spravne: 'pri hradisku hillfort; pri murovanom hrade castle je správne' },
  { id: 'stronghold', vzor: /\bstrongholds?\b/gi, tvrde: false, spravne: 'hradisko = hillfort; slovanský Burg = stronghold je prijaté' },
  { id: 'fort', vzor: /\bforts?\b|\bfortress(es)?\b/gi, tvrde: false, spravne: 'hradisko = hillfort; hrádok = fortlet; rímsky = fort' },
  { id: 'ingot', vzor: /\bingots?\b/gi, tvrde: false, spravne: 'hrivna = axe-shaped currency bar; zliatok = casting lump' },
  { id: 'dugout', vzor: /\bdugout\b/gi, tvrde: false, spravne: 'zemnica = sunken-featured building; monoxyl = dugout canoe je OK' },
  { id: 'courtyard', vzor: /\bcourtyard\b/gi, tvrde: false, spravne: 'nádvorie hradiska = enclosure; stredoveký hrad = courtyard je OK' },
  { id: 'citadel', vzor: /\bcitadel\b/gi, tvrde: false, spravne: 'akropola = acropolis' },
  { id: 'button', vzor: /\bbuttons?\b/gi, tvrde: false, spravne: 'veľkomoravský gombík = gombík; doba bronzová = button je OK' },
  { id: 'slovak-9st', vzor: /Slovaks|Slovak (nobleman|prince|tribes?|population|ancestors)/g, tvrde: false, spravne: 'pre 9. stor. the Slavs/the Moravians' },
  { id: 'locality', vzor: /\blocality\b/gi, tvrde: false, spravne: 'site' },
  { id: 'oven', vzor: /\bovens?\b/gi, tvrde: false, spravne: 'železiarska pec = smelting furnace; kopulová pec = domed oven je OK' },

  /* Rozídené preklady tej istej inštitúcie alebo pojmu */
  { id: 'nejed-povazie', vzor: /Pova[žz]sk[ée] Museum|Pova[žz]ie Museum/g, tvrde: false, spravne: 'zjednotiť: the Považie Museum in Žilina' },
  { id: 'nejed-hillfort-period', vzor: /hillfort period|Hillfort period|Hillfort-period/g, tvrde: false, spravne: 'zjednotiť veľké písmená' },
  { id: 'nejed-nitra-kniez', vzor: /Nitra Principality/g, tvrde: false, spravne: 'zjednotiť: the Principality of Nitra' },
  { id: 'nejed-velkomor', vzor: /Great Moravia period/g, tvrde: false, spravne: 'zjednotiť: the Great Moravian period' },
];

const zbierajText = (n, out) => {
  if (Array.isArray(n)) return n.forEach((x) => zbierajText(x, out));
  if (n && typeof n === 'object') {
    if (typeof n.text === 'string') out.push(n.text);
    Object.values(n).forEach((x) => zbierajText(x, out));
  }
};

async function main() {
  const app = await createStrapi({ appDir: KOREN, distDir: resolve(KOREN, 'dist') }).load();
  try {
    const en = await app.documents(UID).findMany({
      locale: 'en', status: 'published', fields: ['slug', 'title', 'excerpt', 'metaTitle', 'metaDescription'],
      populate: { blocks: { populate: '*' }, keyFacts: true, timeline: true, quotes: true, mediaTexts: true },
      limit: 1000,
    });

    const podlaClanku = [];
    const sucty = {};

    for (const p of en) {
      const casti = [p.title, p.excerpt, p.metaTitle, p.metaDescription];
      zbierajText(p.blocks, casti);
      zbierajText(p.keyFacts, casti);
      zbierajText(p.timeline, casti);
      zbierajText(p.quotes, casti);
      zbierajText(p.mediaTexts, casti);
      const text = casti.filter(Boolean).join('\n');

      const nalezy = [];
      for (const pr of PRAVIDLA) {
        const m = text.match(pr.vzor);
        if (!m) continue;
        nalezy.push({ id: pr.id, pocet: m.length, tvrde: pr.tvrde, spravne: pr.spravne });
        sucty[pr.id] = (sucty[pr.id] || 0) + m.length;
      }
      if (nalezy.length) {
        const tvrdych = nalezy.filter((x) => x.tvrde).reduce((a, b) => a + b.pocet, 0);
        podlaClanku.push({ slug: p.slug, tvrdych, celkom: nalezy.reduce((a, b) => a + b.pocet, 0), nalezy });
      }
    }

    podlaClanku.sort((a, b) => (b.tvrdych - a.tvrdych) || (b.celkom - a.celkom));

    console.log(`\n=== TERMINOLÓGIA V ANGLIČTINE — ${en.length} článkov ===\n`);
    console.log('SÚČTY PODĽA PRAVIDLA (tvrdé = slovník zakazuje bez výnimky):');
    for (const pr of PRAVIDLA) {
      if (!sucty[pr.id]) continue;
      console.log(`  ${pr.tvrde ? '!!' : '· '} ${pr.id.padEnd(22)} ${String(sucty[pr.id]).padStart(5)}   → ${pr.spravne}`);
    }
    const sTvrdym = podlaClanku.filter((x) => x.tvrdych);
    console.log(`\nčlánkov s nálezom: ${podlaClanku.length} · z toho s TVRDÝM nálezom: ${sTvrdym.length}`);

    if (PODROBNE) {
      console.log('\nČLÁNKY (zoradené podľa tvrdých nálezov):');
      for (const c of podlaClanku.slice(0, 60)) {
        console.log(`  ${c.slug} · tvrdé ${c.tvrdych} · celkom ${c.celkom} · ${c.nalezy.map((n) => `${n.id}×${n.pocet}`).join(', ')}`);
      }
    }
    if (JSON_VYSTUP) {
      writeFileSync(JSON_VYSTUP, JSON.stringify({ clankov: en.length, sucty, podlaClanku }, null, 1), 'utf8');
      console.log(`\nzapísané do ${JSON_VYSTUP}`);
    }
  } finally {
    await app.destroy();
  }
}

main().catch((e) => { console.error('\nCHYBA:', e.message); process.exit(1); });
