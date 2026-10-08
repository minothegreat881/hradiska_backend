#!/usr/bin/env node
/**
 * slovenske-alty.mjs — slovenské popisy fotiek v anglických vstupných súboroch.
 *
 * Pri migrácii dostalo veľa fotiek `alt` rovný názvu článku. Preklad ho
 * miestami prebral tak, ako bol, takže v anglickom článku čítačka aj
 * vyhľadávač dostanú slovenskú vetu. Hľadá sa dvoje:
 *
 *   • `alt`, ktorý sa rovná slovenskému názvu článku → nahradí sa anglickým
 *     názvom (`--oprav`), lebo to nie je popis, ale výplň z migrácie;
 *   • ostatné slovenské vety → len sa vypíšu, tie treba preložiť.
 *
 * Slovenčina sa pozná podľa funkčných slov, nie podľa diakritiky: „A bearded
 * axe from Diviacka Nová Ves" je správny anglický popis.
 *
 *   node scripts/kontrola/slovenske-alty.mjs
 *   node scripts/kontrola/slovenske-alty.mjs --oprav
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const TU = dirname(fileURLToPath(import.meta.url));
const PREKLADY = resolve(TU, '..', 'preklad', 'preklady');
const API = 'http://188.245.47.29';
const OPRAV = process.argv.includes('--oprav');
const pockaj = (ms) => new Promise((r) => setTimeout(r, ms));

const SLOVA = ['sa', 'je', 'na', 'ktoré', 'ktorý', 'bol', 'bola', 'boli', 'pre', 'ako', 'alebo',
  'podľa', 'medzi', 'hradisko', 'hradiska', 'hradiská', 'pohľad', 'zobrazenie', 'replika',
  'v', 'z', 'zo', 'so', 's', 'od', 'do', 'pri', 'nad', 'pod', 'časoch', 'doby', 'kultúry'];
const VZORY = SLOVA.map((w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu'));
const poSlovensky = (t) => {
  if (!t || t.length < 8) return false;
  const n = VZORY.filter((v) => v.test(t)).length;
  return n >= 2;
};

async function skClanok(slug) {
  const q = new URLSearchParams({ 'filters[slug][$eq]': slug, 'fields[0]': 'title' });
  for (let pokus = 1; ; pokus++) {
    const r = await fetch(`${API}/api/blog-posts?${q}`);
    if (r.status === 429 && pokus <= 8) { await pockaj(2000 * pokus); continue; }
    if (!r.ok) throw new Error(`API ${r.status}`);
    const j = await r.json();
    return j.data?.[0] || null;
  }
}

const fronta = readdirSync(PREKLADY)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .map((f) => basename(f, '.json'));

let suborov = 0, nahradenych = 0, naPreklad = 0;
for (const slug of fronta) {
  const cesta = resolve(PREKLADY, `${slug}.json`);
  let d;
  try { d = JSON.parse(readFileSync(cesta, 'utf8')); } catch { continue; }

  const kandidati = [];
  for (const b of d.data.blocks || []) {
    if (b.__component !== 'content.image-block') continue;
    for (const pole of ['alt', 'caption']) if (poSlovensky(b[pole])) kandidati.push([b, pole]);
  }
  for (const m of d.data.mediaTexts || []) {
    for (const pole of ['alt', 'caption']) if (poSlovensky(m[pole])) kandidati.push([m, pole]);
  }
  if (!kandidati.length) continue;

  const sk = await skClanok(slug);
  const skNazov = sk?.title || '';
  const enNazov = d.data.title || '';

  let zmien = 0;
  const zostava = [];
  for (const [objekt, pole] of kandidati) {
    if (skNazov && objekt[pole].trim() === skNazov.trim()) {
      if (OPRAV) objekt[pole] = enNazov;
      zmien++;
    } else {
      zostava.push(`${pole}: ${objekt[pole].slice(0, 80)}`);
    }
  }

  suborov++;
  nahradenych += zmien;
  naPreklad += zostava.length;
  console.log(`• ${slug}: názov článku ${zmien}× · na preklad ${zostava.length}`);
  for (const z of zostava.slice(0, 3)) console.log(`    ${z}`);
  if (OPRAV && zmien) writeFileSync(cesta, JSON.stringify(d, null, 1), 'utf8');
}

console.log(`\nsúborov ${suborov} · nahradených názvom článku ${nahradenych} · ostáva preložiť ${naPreklad}`);
if (!OPRAV) console.log('(bez --oprav sa nič nezapísalo)');
