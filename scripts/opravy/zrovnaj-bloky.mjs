#!/usr/bin/env node
/**
 * zrovnaj-bloky.mjs — zrovná poradie blokov vo vstupnom súbore prekladu
 * s poradím v slovenskej verzii.
 *
 * Dávkový zapisovač páruje bloky POZIČNE, takže keď prekladateľ obrázok
 * a odsek vymenil, zápis článok odmietne. Oprava je mechanická: ide o tie isté
 * bloky v inom poradí, takže sa preusporiadajú podľa slovenskej predlohy —
 * z anglických blokov sa pre každú pozíciu vezme prvý nepoužitý blok toho
 * istého typu (relatívne poradie v rámci typu sa zachová).
 *
 * Keď sa nezhoduje POČET blokov niektorého typu, súbor sa nechá na pokoji
 * a vypíše sa — tam treba človeka.
 *
 * Spúšťa sa lokálne, slovenčinu číta z produkčného API.
 *
 *   node scripts/opravy/zrovnaj-bloky.mjs <slug> [<slug>…]
 *   node scripts/opravy/zrovnaj-bloky.mjs --vsetky          # nasucho, nájde rozídené
 *   node scripts/opravy/zrovnaj-bloky.mjs <slug> --zapis
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const TU = dirname(fileURLToPath(import.meta.url));
const PREKLADY = resolve(TU, '..', 'preklad', 'preklady');
const API = 'http://188.245.47.29';
const ZAPIS = process.argv.includes('--zapis');
const VSETKY = process.argv.includes('--vsetky');
const slugy = process.argv.slice(2).filter((a) => !a.startsWith('--'));

async function skBloky(slug) {
  const q = new URLSearchParams();
  q.set('filters[slug][$eq]', slug);
  q.set('populate[blocks][populate]', '*');
  const r = await fetch(`${API}/api/blog-posts?${q}`);
  if (!r.ok) throw new Error(`API ${r.status}`);
  const j = await r.json();
  if (!j.data?.length) throw new Error('slovenský článok sa nenašiel');
  return (j.data[0].blocks || []).map((b) => b.__component);
}

/** Preusporiada `bloky` tak, aby ich typy šli v poradí `poradie`. */
function zrovnaj(bloky, poradie) {
  const podlaTypu = new Map();
  for (const b of bloky) {
    if (!podlaTypu.has(b.__component)) podlaTypu.set(b.__component, []);
    podlaTypu.get(b.__component).push(b);
  }
  const von = [];
  for (const typ of poradie) {
    const zasoba = podlaTypu.get(typ);
    if (!zasoba || !zasoba.length) return null;   // chýba blok toho typu
    von.push(zasoba.shift());
  }
  for (const zvysok of podlaTypu.values()) if (zvysok.length) return null;  // prebytok
  return von;
}

const fronta = slugy.length
  ? slugy
  : readdirSync(PREKLADY).filter((f) => f.endsWith('.json') && !f.startsWith('_')).map((f) => basename(f, '.json'));

let rozidenych = 0, zrovnanych = 0, naRuku = 0;
for (const slug of fronta) {
  const cesta = resolve(PREKLADY, `${slug}.json`);
  let d;
  try { d = JSON.parse(readFileSync(cesta, 'utf8')); } catch { continue; }
  const bloky = d.data?.blocks;
  if (!Array.isArray(bloky)) continue;

  let poradie;
  try { poradie = await skBloky(slug); } catch (e) { console.log(`!! ${slug}: ${e.message}`); continue; }

  const teraz = bloky.map((b) => b.__component);
  if (teraz.length === poradie.length && teraz.every((t, i) => t === poradie[i])) continue;

  rozidenych++;
  const nove = zrovnaj(bloky, poradie);
  if (!nove) {
    naRuku++;
    console.log(`!! ${slug}: typy sa nedajú spárovať (en ${teraz.length}, sk ${poradie.length}) — treba človeka`);
    continue;
  }
  console.log(`• ${slug}: preusporiadaných ${poradie.length} blokov`);
  if (!ZAPIS) continue;
  d.data.blocks = nove;
  writeFileSync(cesta, JSON.stringify(d, null, 1), 'utf8');
  zrovnanych++;
}

console.log(`\nrozídených ${rozidenych} · zrovnaných ${zrovnanych} · na ruku ${naRuku}`);
if (!ZAPIS && rozidenych) console.log('(nasucho — nič sa nezapísalo)');
