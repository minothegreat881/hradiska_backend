#!/usr/bin/env node
/**
 * rozvrh-suborov.mjs — rozvrh obrázkov vo VSTUPNÝCH SÚBOROCH prekladu proti slovenčine.
 *
 * `kontrola/rozvrh-obrazkov.cjs` porovnáva, čo je v databáze. Toto porovnáva, čo
 * sa do nej nabudúce zapíše: šírka, poloha a ostatné polia rozvrhu majú byť v
 * oboch jazykoch rovnaké, a prekladateľ ani terminológ ich nemá dôvod meniť.
 * Jeden takýto rozpad (width 40 proti 60) sa našiel až pri ručnej kontrole.
 *
 * Číta verejné API, nič nemení. Pri 429 čaká a skúša znova a na konci vypíše,
 * koľko článkov naozaj overil.
 *
 *   node scripts/kontrola/rozvrh-suborov.mjs
 *   node scripts/kontrola/rozvrh-suborov.mjs --oprav      # prepíše rozvrh na slovenský
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const TU = dirname(fileURLToPath(import.meta.url));
const PREKLADY = resolve(TU, '..', 'preklad', 'preklady');
const API = 'http://188.245.47.29';
const OPRAV = process.argv.includes('--oprav');
const slugy = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const POLIA = ['width', 'position', 'aspectRatio', 'objectPosition', 'showCaption', 'rounded', 'shadow', 'pairWithNext'];
const pockaj = (ms) => new Promise((r) => setTimeout(r, ms));

async function skBloky(slug) {
  const q = new URLSearchParams({ 'filters[slug][$eq]': slug, 'populate[blocks][populate]': '*' });
  for (let pokus = 1; ; pokus++) {
    const r = await fetch(`${API}/api/blog-posts?${q}`);
    if (r.status === 429 && pokus <= 8) { await pockaj(2000 * pokus); continue; }
    if (!r.ok) throw new Error(`API ${r.status}`);
    const j = await r.json();
    if (!j.data?.length) throw new Error('slovenský článok sa nenašiel');
    return j.data[0].blocks || [];
  }
}

const fronta = slugy.length
  ? slugy
  : readdirSync(PREKLADY).filter((f) => f.endsWith('.json') && !f.startsWith('_')).map((f) => basename(f, '.json'));

let overenych = 0, rozdielov = 0, opravenych = 0, nedostupnych = 0;
for (const slug of fronta) {
  const cesta = resolve(PREKLADY, `${slug}.json`);
  let d;
  try { d = JSON.parse(readFileSync(cesta, 'utf8')); } catch { continue; }

  let sk;
  try { sk = await skBloky(slug); overenych++; } catch (e) { console.log(`!! ${slug}: ${e.message}`); nedostupnych++; continue; }

  const skObr = sk.filter((b) => b.__component === 'content.image-block');
  const enObr = (d.data.blocks || []).filter((b) => b.__component === 'content.image-block');
  if (skObr.length !== enObr.length) {
    console.log(`!! ${slug}: obrázkových blokov sk ${skObr.length} ≠ en ${enObr.length}`);
    rozdielov++;
    continue;
  }
  let zmien = 0;
  for (const [i, a] of skObr.entries()) {
    for (const p of POLIA) {
      if (String(a[p]) === String(enObr[i][p])) continue;
      console.log(`• ${slug}: obrázok ${i + 1}.${p} sk=${a[p]} en=${enObr[i][p]}`);
      rozdielov++;
      if (OPRAV) { enObr[i][p] = a[p]; zmien++; }
    }
  }
  if (zmien) { writeFileSync(cesta, JSON.stringify(d, null, 1), 'utf8'); opravenych++; }
}

console.log(`\noverených ${overenych} · rozdielov ${rozdielov} · opravených súborov ${opravenych} · nedostupných ${nedostupnych}`);
if (!OPRAV && rozdielov) console.log('(bez --oprav sa nič nezapísalo)');
