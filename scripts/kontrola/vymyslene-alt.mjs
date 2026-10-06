#!/usr/bin/env node
/**
 * vymyslene-alt.mjs — anglické popisy fotiek, ktoré v slovenčine podklad nemajú.
 *
 * Pravidlo projektu: fotke, ktorej autor popis nedal, sa popis ani `alt`
 * nedopĺňa. Prekladatelia však v `mediaTexts` miestami vymysleli opisný
 * anglický `alt` („A wooded hill with a rocky crag, seen from the meadow
 * below") k fotke, ktorá v slovenčine nemá ani popis, ani alt.
 *
 * Hľadá sa teda media id, pre ktoré:
 *   • slovenský obrázkový blok nemá `caption` (a `alt` má prázdny alebo „."),
 *   • v knižnici médií nemá ani `caption`, ani `alternativeText`,
 *   • a vstupný súbor prekladu mu v `mediaTexts` dáva text.
 *
 * Číta verejné API, nič nemení. Pri 429 čaká a skúša znova.
 *
 *   node scripts/kontrola/vymyslene-alt.mjs
 *   node scripts/kontrola/vymyslene-alt.mjs --oprav     # vypustí tie položky
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const TU = dirname(fileURLToPath(import.meta.url));
const PREKLADY = resolve(TU, '..', 'preklad', 'preklady');
const API = 'http://188.245.47.29';
const OPRAV = process.argv.includes('--oprav');
const slugy = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const pockaj = (ms) => new Promise((r) => setTimeout(r, ms));

/** Popis, ktorý nenesie informáciu — zástupný znak z migrácie. */
const prazdne = (t) => !t || !String(t).trim() || String(t).trim() === '.' || String(t).trim() === '-';

async function skClanok(slug) {
  const q = new URLSearchParams({
    'filters[slug][$eq]': slug,
    'populate[blocks][populate]': '*',
    'populate[gallery]': 'true',
    'populate[coverImage]': 'true',
  });
  for (let pokus = 1; ; pokus++) {
    const r = await fetch(`${API}/api/blog-posts?${q}`);
    if (r.status === 429 && pokus <= 8) { await pockaj(2000 * pokus); continue; }
    if (!r.ok) throw new Error(`API ${r.status}`);
    const j = await r.json();
    if (!j.data?.length) throw new Error('slovenský článok sa nenašiel');
    return j.data[0];
  }
}

const fronta = slugy.length
  ? slugy
  : readdirSync(PREKLADY).filter((f) => f.endsWith('.json') && !f.startsWith('_')).map((f) => basename(f, '.json'));

let overenych = 0, najdenych = 0, suborov = 0, nedostupnych = 0;
for (const slug of fronta) {
  const cesta = resolve(PREKLADY, `${slug}.json`);
  let d;
  try { d = JSON.parse(readFileSync(cesta, 'utf8')); } catch { continue; }
  const popisy = d.data?.mediaTexts;
  if (!Array.isArray(popisy) || !popisy.length) continue;

  let sk;
  try { sk = await skClanok(slug); overenych++; } catch (e) { console.log(`!! ${slug}: ${e.message}`); nedostupnych++; continue; }

  /* čo o obrázku hovorí slovenčina */
  const skPopis = new Map();
  const zapis = (id, caption, alt) => {
    if (typeof id !== 'number') return;
    const p = skPopis.get(id) || { caption: '', alt: '' };
    if (!prazdne(caption)) p.caption = caption;
    if (!prazdne(alt)) p.alt = alt;
    skPopis.set(id, p);
  };
  for (const b of sk.blocks || []) {
    if (b.image) zapis(b.image.id, b.caption, b.alt);
    for (const m of b.images || []) zapis(m.id, m.caption, m.alternativeText);
  }
  for (const m of [...(sk.gallery || []), sk.coverImage].filter(Boolean)) zapis(m.id, m.caption, m.alternativeText);

  const zle = popisy.filter((m) => {
    const p = skPopis.get(m.mediaId);
    const maSlovensky = p && (!prazdne(p.caption) || !prazdne(p.alt));
    return !maSlovensky && (!prazdne(m.caption) || !prazdne(m.alt));
  });
  if (!zle.length) continue;

  najdenych += zle.length;
  console.log(`• ${slug}: ${zle.length}`);
  for (const m of zle) console.log(`    ${m.mediaId}: ${(m.caption || m.alt || '').slice(0, 80)}`);
  if (!OPRAV) continue;
  d.data.mediaTexts = popisy.filter((m) => !zle.includes(m));
  writeFileSync(cesta, JSON.stringify(d, null, 1), 'utf8');
  suborov++;
}

console.log(`\noverených ${overenych} · vymyslených popisov ${najdenych} · upravených súborov ${suborov} · nedostupných ${nedostupnych}`);
if (!OPRAV && najdenych) console.log('(bez --oprav sa nič nezapísalo)');
