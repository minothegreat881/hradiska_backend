#!/usr/bin/env node
/**
 * zahod-zmazane-bloky.mjs — vypustí zo vstupného súboru bloky, ktoré autor
 * medzitým zmazal v slovenskej verzii.
 *
 * Preklad vznikol z vtedajšej slovenčiny. Keď autor neskôr v článku odsek či
 * obrázok zmaže, súbor prekladu o tom nevie a ďalší dávkový zápis by ho vrátil
 * späť — zapisovač to preto odmietne („blokov X, slovenská verzia má Y").
 *
 * Priradenie hľadá najlacnejšie zarovnanie: anglické bloky idú v poradí na
 * slovenské, typy musia sedieť a cena matchu je rozdiel dĺžok (anglický text
 * býva o pätinu dlhší). Čo sa neuplatní, je kandidát na vypustenie — vypíše sa
 * aj s textom, nech sa to dá prečítať pred zápisom.
 *
 *   node scripts/opravy/zahod-zmazane-bloky.mjs <slug> [<slug>…] [--zapis]
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
const NAFUK = 1.15;          // anglický text býva dlhší než slovenský

const text = (b) => {
  const von = [];
  const prejdi = (n) => {
    if (Array.isArray(n)) return n.forEach(prejdi);
    if (!n || typeof n !== 'object') return;
    if (typeof n.text === 'string') von.push(n.text);
    for (const v of Object.values(n)) prejdi(v);
  };
  prejdi(b);
  return von.join(' ').replace(/\s+/g, ' ').trim();
};

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

/** Pre jeden typ bloku vyberie z anglických tie, ktoré zodpovedajú slovenským.
    Poradie sa zachováva, prebytočné vypadnú; vyberá sa podľa dĺžky textu. */
function vyberPodlaDlzky(enT, skT) {
  const N = enT.length, M = skT.length;
  if (M > N) return null;
  const NEKONECNO = 1e9;
  const cena = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(NEKONECNO));
  const krok = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(''));
  for (let i = 0; i <= N; i++) cena[i][M] = 0;
  for (let i = N - 1; i >= 0; i--) {
    for (let j = M - 1; j >= 0; j--) {
      const a = text(enT[i]).length, b = text(skT[j]).length * NAFUK;
      const par = Math.abs(a - b) / Math.max(40, b) + cena[i + 1][j + 1];
      const von = N - i > M - j ? cena[i + 1][j] + 0.01 : NEKONECNO;
      if (par <= von) { cena[i][j] = par; krok[i][j] = 'par'; }
      else { cena[i][j] = von; krok[i][j] = 'von'; }
    }
  }
  const vybrane = [], von = [];
  let i = 0, j = 0;
  while (i < N) {
    if (j < M && krok[i][j] === 'par') { vybrane.push(enT[i]); i++; j++; }
    else { von.push(enT[i]); i++; }
  }
  return vybrane.length === M ? { vybrane, von } : null;
}

/** Poskladá anglické bloky na slovenskú kostru: typ po type, poradie podľa
    slovenčiny, prebytočné anglické bloky von. */
function zarovnaj(en, sk) {
  const podlaTypu = new Map();
  for (const b of en) {
    if (!podlaTypu.has(b.__component)) podlaTypu.set(b.__component, []);
    podlaTypu.get(b.__component).push(b);
  }
  const skPodlaTypu = new Map();
  for (const b of sk) {
    if (!skPodlaTypu.has(b.__component)) skPodlaTypu.set(b.__component, []);
    skPodlaTypu.get(b.__component).push(b);
  }
  const vybrane = new Map();
  const von = [];
  for (const [typ, enT] of podlaTypu) {
    const skT = skPodlaTypu.get(typ) || [];
    const v = vyberPodlaDlzky(enT, skT);
    if (!v) return null;
    vybrane.set(typ, v.vybrane);
    von.push(...v.von);
  }
  for (const [typ, skT] of skPodlaTypu) if (!vybrane.has(typ) && skT.length) return null;

  const zasoby = new Map([...vybrane].map(([t, z]) => [t, [...z]]));
  const ostanu = [];
  for (const b of sk) {
    const z = zasoby.get(b.__component);
    if (!z || !z.length) return null;
    ostanu.push(z.shift());
  }
  return { ostanu, von };
}

for (const slug of slugy) {
  const cesta = resolve(PREKLADY, `${slug}.json`);
  const d = JSON.parse(readFileSync(cesta, 'utf8'));
  let sk;
  try { sk = await skBloky(slug); } catch (e) { console.log(`!! ${slug}: ${e.message}`); continue; }

  const en = d.data.blocks || [];
  if (en.length === sk.length) { console.log(`· ${slug}: počty už sedia`); continue; }
  const v = zarovnaj(en, sk);
  if (!v) { console.log(`!! ${slug}: zarovnanie sa nenašlo — treba človeka`); continue; }

  console.log(`• ${slug}: en ${en.length} → sk ${sk.length}, vypúšťam ${v.von.length}`);
  for (const b of v.von) console.log(`    − ${b.__component.replace('content.', '')}: ${(text(b) || b.caption || '(bez textu)').slice(0, 90)}`);
  if (!ZAPIS) continue;
  d.data.blocks = v.ostanu;
  writeFileSync(cesta, JSON.stringify(d, null, 1), 'utf8');
  console.log('    zapísané');
}

if (!ZAPIS) console.log('\n(nasucho — nič sa nezapísalo)');
