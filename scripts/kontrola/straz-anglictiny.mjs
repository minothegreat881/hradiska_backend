#!/usr/bin/env node
/**
 * straz-anglictiny.mjs — nájde anglické články, do ktorých pretiekla slovenčina.
 *
 * Strapi 5 pri úprave slovenského článku zapíše ten istý text aj do anglického
 * KONCEPTU. Keď sa potom anglická verzia z akéhokoľvek dôvodu publikuje,
 * slovenčina vyjde na web — článok má anglickú adresu a slovenský obsah. Takto
 * sa po dvoch dňoch redakčnej práce pokazilo 59 článkov z 364.
 *
 * Príznak je jednoduchý a lacný: anglický titulok sa rovná slovenskému. Skript
 * vypíše slovenské slugy, ktoré treba prepísať zo vstupných súborov prekladu:
 *
 *   node scripts/preklad/zapis-davku.cjs --zapis --znova --len=<zoznam>
 *
 * Číta verejné API, nič nemení. `--slugy` vypíše len čiarkami oddelený zoznam,
 * aby sa dal rovno dosadiť do príkazu (tak to robí hradiska-straz.sh).
 */

const API = process.env.HRADISKA_API || 'http://188.245.47.29';
const LEN_SLUGY = process.argv.includes('--slugy');
const pockaj = (ms) => new Promise((r) => setTimeout(r, ms));

async function vsetky(locale) {
  const von = [];
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({
      locale, 'pagination[page]': String(page), 'pagination[pageSize]': '100',
      'fields[0]': 'title', 'fields[1]': 'slug', 'fields[2]': 'documentId',
    });
    let j;
    for (let pokus = 1; ; pokus++) {
      const r = await fetch(`${API}/api/blog-posts?${q}`);
      if (r.status === 429 && pokus <= 8) { await pockaj(2000 * pokus); continue; }
      if (!r.ok) throw new Error(`API ${r.status}`);
      j = await r.json();
      break;
    }
    von.push(...j.data);
    if (von.length >= j.meta.pagination.total) return von;
  }
}

const sk = await vsetky('sk');
const en = await vsetky('en');
const skPodlaId = new Map(sk.map((c) => [c.documentId, c]));

const pokazene = [];
for (const e of en) {
  const s = skPodlaId.get(e.documentId);
  if (!s) continue;
  if (e.title === s.title) pokazene.push(s.slug);
}

if (LEN_SLUGY) {
  if (pokazene.length) console.log(pokazene.join(','));
  process.exit(0);
}
console.log(`anglických ${en.length} · slovenských ${sk.length} · so slovenským titulkom ${pokazene.length}`);
for (const s of pokazene) console.log(`  ${s}`);
if (pokazene.length) {
  console.log('\nOprava:');
  console.log(`  node scripts/preklad/zapis-davku.cjs --zapis --znova --len=${pokazene.join(',')}`);
}
