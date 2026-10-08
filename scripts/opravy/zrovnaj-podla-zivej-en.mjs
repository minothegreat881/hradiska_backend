#!/usr/bin/env node
/**
 * zrovnaj-podla-zivej-en.mjs — zahodí zo vstupného súboru bloky, ktoré už
 * v slovenčine nie sú.
 *
 * Keď autor po preklade zmaže v slovenskom článku odsek alebo obrázok,
 * zrkadlenie to v databáze premietne aj do angličtiny — ale vstupný súbor
 * prekladu o tom nevie. Pri ďalšom dávkovom zápise by sa zmazaný blok vrátil.
 *
 * Porovnáva sa anglicky s anglickým: bloky súboru proti ŽIVEJ anglickej verzii
 * (tá je po zrkadlení správna). Blok, ktorý v živej verzii nemá náprotivok,
 * sa vypíše a s `--zapis` vypustí. Páruje sa podľa typu a začiatku textu,
 * takže drobné terminologické opravy v súbore prekladu nevadia.
 *
 *   node scripts/opravy/zrovnaj-podla-zivej-en.mjs <slug> [<slug>…] [--zapis]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TU = dirname(fileURLToPath(import.meta.url));
const PREKLADY = resolve(TU, '..', 'preklad', 'preklady');
const API = 'http://188.245.47.29';
const ZAPIS = process.argv.includes('--zapis');
const slugy = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const pockaj = (ms) => new Promise((r) => setTimeout(r, ms));

async function ziskaj(url) {
  for (let pokus = 1; ; pokus++) {
    const r = await fetch(url);
    if (r.status === 429 && pokus <= 8) { await pockaj(2000 * pokus); continue; }
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
  }
}

/** Text bloku v jednom reťazci — na porovnanie stačí začiatok. */
const text = (b) => {
  const von = [];
  const prejdi = (n) => {
    if (Array.isArray(n)) return n.forEach(prejdi);
    if (!n || typeof n !== 'object') return;
    if (typeof n.text === 'string') von.push(n.text);
    for (const v of Object.values(n)) prejdi(v);
  };
  prejdi(b);
  return von.join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
};
const kluc = (b) => `${b.__component}|${text(b).slice(0, 60)}`;

for (const slug of slugy) {
  const cesta = resolve(PREKLADY, `${slug}.json`);
  const d = JSON.parse(readFileSync(cesta, 'utf8'));

  const q = new URLSearchParams({ 'filters[slug][$eq]': slug, 'fields[0]': 'documentId' });
  const sk = (await ziskaj(`${API}/api/blog-posts?${q}`)).data?.[0];
  if (!sk) { console.log(`!! ${slug}: slovenský článok sa nenašiel`); continue; }
  const qe = new URLSearchParams({ locale: 'en', 'populate[blocks][populate]': '*' });
  const en = (await ziskaj(`${API}/api/blog-posts/${sk.documentId}?${qe}`)).data;
  if (!en) { console.log(`!! ${slug}: anglická verzia sa nenašla`); continue; }

  const zive = (en.blocks || []).map(kluc);
  const zostava = new Set(zive);
  const ostanu = [];
  const von = [];
  for (const b of d.data.blocks || []) {
    const k = kluc(b);
    if (zostava.has(k)) { zostava.delete(k); ostanu.push(b); continue; }
    /* bez presnej zhody skúsime ten istý typ s podobným začiatkom */
    const podobny = [...zostava].find((z) => z.startsWith(b.__component + '|') && z.slice(-40) && text(b).slice(0, 25) && z.includes(text(b).slice(0, 25)));
    if (podobny) { zostava.delete(podobny); ostanu.push(b); continue; }
    von.push(b);
  }

  console.log(`• ${slug}: súbor ${(d.data.blocks || []).length} · živá angličtina ${zive.length} · bez náprotivka ${von.length}`);
  for (const b of von) console.log(`    − ${b.__component.replace('content.', '')}: ${text(b).slice(0, 80) || '(bez textu)'}`);
  if (zostava.size) console.log(`    !! v živej verzii je ${zostava.size} blokov, ktoré súbor nemá — nič nezapisujem`);
  if (!ZAPIS || !von.length || zostava.size) continue;
  d.data.blocks = ostanu;
  writeFileSync(cesta, JSON.stringify(d, null, 1), 'utf8');
  console.log('    zapísané');
}

if (!ZAPIS) console.log('\n(nasucho — nič sa nezapísalo)');
