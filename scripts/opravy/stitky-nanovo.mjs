#!/usr/bin/env node
/**
 * stitky-nanovo.mjs — nasadí nový slovník štítkov na celý blog.
 *
 * Starých štítkov bolo 228 na 364 článkov, pričom 212 z nich existovalo pre
 * jediný článok: boli to bloggerové nálepky s názvom článku alebo obce.
 * Nový slovník má 22 tém a stojí na osi, ktorú kategórie nepokrývajú —
 * z akej doby článok je a o čom je.
 *
 * Priradenie (slug → štítky) je v `stitky-priradenie.json`; robilo sa
 * čítaním názvu, perexu a kategórie článku, nie hľadaním slov v texte.
 *
 * BEZPEČNOSŤ: mení LEN reláciu `tags`. Ostatné polia sa v požiadavke vôbec
 * nespomínajú, takže ich Strapi nechá tak; po zápise sa to overí.
 *
 *   node scripts/opravy/stitky-nanovo.mjs            # nasucho
 *   node scripts/opravy/stitky-nanovo.mjs --zapis
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });

const BASE = 'https://webdesignforhradiskask.vercel.app/strapi';
const TOKEN = process.env.STRAPI_TOKEN;
const ZAPIS = process.argv.includes('--zapis');
const PRIRADENIE = JSON.parse(readFileSync(resolve(__dirname, 'stitky-priradenie.json'), 'utf8'));
const hlavicky = { Authorization: `Bearer ${TOKEN}` };

const SLOVNIK = [...new Set(Object.values(PRIRADENIE).flat())].sort();

/** Slug zo slovenského názvu — bez diakritiky, malé písmená, spojovníky. */
const naSlug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function get(cesta) {
  const r = await fetch(BASE + cesta, { headers: hlavicky });
  if (!r.ok) throw new Error(`GET ${cesta} → ${r.status}`);
  return r.json();
}
async function posli(cesta, metoda, data) {
  const r = await fetch(BASE + cesta, {
    method: metoda,
    headers: { ...hlavicky, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  if (!r.ok) throw new Error(`${metoda} ${cesta} → ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function main() {
  console.log(`\n=== NOVÉ ŠTÍTKY — ${ZAPIS ? 'ZÁPIS' : 'NASUCHO'} ===\n`);

  // 1 · existujúce štítky
  const existuju = new Map();
  for (let page = 1; ; page++) {
    const j = await get(`/api/blog-tags?pagination[page]=${page}&pagination[pageSize]=100`);
    j.data.forEach((t) => existuju.set(t.name, t));
    if (page >= j.meta.pagination.pageCount) break;
  }
  console.log(`štítkov v databáze: ${existuju.size}`);

  // 2 · doplniť chýbajúce zo slovníka
  const idPodlaMena = new Map();
  for (const meno of SLOVNIK) {
    const je = existuju.get(meno);
    if (je) { idPodlaMena.set(meno, je.id); console.log(`  = ${meno} (existuje)`); continue; }
    if (!ZAPIS) { console.log(`  + ${meno} (vytvoril by sa)`); continue; }
    const novy = await posli('/api/blog-tags', 'POST', { name: meno, slug: naSlug(meno) });
    idPodlaMena.set(meno, novy.data.id);
    console.log(`  + ${meno} → id ${novy.data.id}`);
  }
  if (!ZAPIS) { console.log(`\nčlánkov na preradenie: ${Object.keys(PRIRADENIE).length} (nasucho — nič sa nezapísalo)`); return; }

  // 3 · preradiť články
  const clanky = new Map();
  for (let page = 1; ; page++) {
    const j = await get(`/api/blog-posts?fields[0]=slug&status=draft&pagination[page]=${page}&pagination[pageSize]=100`);
    j.data.forEach((a) => clanky.set(a.slug, a.documentId));
    if (page >= j.meta.pagination.pageCount) break;
  }

  let ok = 0, chyb = 0;
  for (const [slug, temy] of Object.entries(PRIRADENIE)) {
    const documentId = clanky.get(slug);
    if (!documentId) { console.error(`  !! ${slug}: článok sa nenašiel`); chyb++; continue; }
    const ids = temy.map((t) => idPodlaMena.get(t));
    try {
      await posli(`/api/blog-posts/${documentId}`, 'PUT', { tags: ids });
      const po = await get(`/api/blog-posts/${documentId}?status=draft&populate[tags][fields][0]=name`);
      const mena = (po.data.tags || []).map((t) => t.name).sort();
      if (JSON.stringify(mena) === JSON.stringify([...temy].sort())) ok++;
      else { console.error(`  !! ${slug}: po zápise ${mena.join(', ')}`); chyb++; }
    } catch (e) { console.error(`  !! ${slug}: ${e.message}`); chyb++; }
    if ((ok + chyb) % 50 === 0) process.stdout.write(`\r  hotovo ${ok + chyb}/${Object.keys(PRIRADENIE).length}`);
  }
  console.log(`\n\npreradených ${ok}, chýb ${chyb}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
