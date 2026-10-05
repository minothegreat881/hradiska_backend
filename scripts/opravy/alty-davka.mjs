#!/usr/bin/env node
/**
 * alty-davka.mjs — pomôcka pre dopĺňanie `alternativeText` k fotkám.
 *
 * Text nepíše skript, ale človek (alebo model) podľa toho, čo na fotke
 * naozaj je. Skript len pripraví dávku na pozretie a potom zapíše výsledok.
 *
 *   node scripts/opravy/alty-davka.mjs priprav --co=obalky --od=0 --pocet=20
 *       stiahne zmenšeniny do scripts/opravy/_davka/ a vypíše zoznam
 *
 *   node scripts/opravy/alty-davka.mjs zapis --subor=alty.json
 *       zapíše { "<id média>": "alt text" } do knižnice médií
 *
 * POZOR: zapisuje sa LEN `alternativeText`. `caption` (popis, ktorý vidí
 * čitateľ) ostáva nedotknutý — sú to dve rôzne veci a miešali sa.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });

const BASE = 'https://webdesignforhradiskask.vercel.app/strapi';
const TOKEN = process.env.STRAPI_TOKEN;
const DAVKA = resolve(__dirname, '_davka');
const arg = (m, d = null) => (process.argv.find((a) => a.startsWith(m))?.slice(m.length)) ?? d;
const prikaz = process.argv[2];

const hlavicky = { Authorization: `Bearer ${TOKEN}` };

async function get(cesta) {
  const r = await fetch(BASE + cesta, { headers: hlavicky });
  if (!r.ok) throw new Error(`GET ${cesta} → ${r.status}`);
  return r.json();
}

/** Všetky články s titulnou fotkou bez `alternativeText`. */
async function obalkyBezAltu() {
  const von = [];
  for (let page = 1; ; page++) {
    const j = await get(`/api/blog-posts?fields[0]=slug&fields[1]=title&fields[2]=excerpt` +
      `&populate[coverImage][fields][0]=url&populate[coverImage][fields][1]=formats` +
      `&populate[coverImage][fields][2]=alternativeText&populate[coverImage][fields][3]=caption` +
      `&populate[coverImage][fields][4]=name&populate[category][fields][0]=name` +
      `&populate[location][fields][0]=name&pagination[page]=${page}&pagination[pageSize]=50&sort=slug:asc`);
    for (const a of j.data) {
      const c = a.coverImage;
      if (c && !String(c.alternativeText || '').trim()) {
        von.push({
          id: c.id, slug: a.slug, title: a.title,
          kategoria: a.category?.name || null, lokalita: a.location?.name || null,
          perex: (a.excerpt || '').slice(0, 180),
          subor: c.name,
          url: (c.formats?.medium || c.formats?.small || c.formats?.thumbnail || c).url,
        });
      }
    }
    if (page >= j.meta.pagination.pageCount) break;
  }
  return von;
}

async function priprav() {
  const co = arg('--co=', 'obalky');
  const od = Number(arg('--od=', '0'));
  const pocet = Number(arg('--pocet=', '20'));
  if (co !== 'obalky') throw new Error('zatiaľ len --co=obalky');

  const vsetky = await obalkyBezAltu();
  const davka = vsetky.slice(od, od + pocet);
  mkdirSync(DAVKA, { recursive: true });

  for (const p of davka) {
    const pripona = p.url.split('.').pop();
    p.obrazok = resolve(DAVKA, `${p.id}.${pripona}`);
    if (!existsSync(p.obrazok)) {
      const r = await fetch(BASE + p.url);
      writeFileSync(p.obrazok, Buffer.from(await r.arrayBuffer()));
    }
  }
  writeFileSync(resolve(DAVKA, 'davka.json'), JSON.stringify(davka, null, 1));
  console.log(`bez altu spolu: ${vsetky.length} · v dávke: ${davka.length} (od ${od})`);
  for (const p of davka) console.log(`${p.id}\t${p.slug}\t${p.subor}`);
}

async function zapis() {
  const subor = arg('--subor=', resolve(DAVKA, 'alty.json'));
  const mapa = JSON.parse(readFileSync(subor, 'utf8'));
  let ok = 0, chyb = 0;
  for (const [id, alt] of Object.entries(mapa)) {
    const pred = await get(`/api/upload/files/${id}`);
    const fd = new FormData();
    /* `caption` sa posiela späť taký, aký je — bez neho ho Strapi vynuluje. */
    fd.append('fileInfo', JSON.stringify({ alternativeText: alt, caption: pred.caption ?? null, name: pred.name }));
    const r = await fetch(`${BASE}/api/upload?id=${id}`, { method: 'POST', headers: hlavicky, body: fd });
    if (!r.ok) { console.error(`  !! ${id}: ${r.status} ${(await r.text()).slice(0, 200)}`); chyb++; continue; }
    const po = await get(`/api/upload/files/${id}`);
    const sedi = po.alternativeText === alt && (po.caption ?? null) === (pred.caption ?? null);
    console.log(`  ${sedi ? '✓' : '!!'} ${id} — ${alt.slice(0, 70)}${sedi ? '' : ` (caption ${pred.caption} → ${po.caption})`}`);
    sedi ? ok++ : chyb++;
  }
  console.log(`\nzapísaných ${ok}, chýb ${chyb}`);
}

const prikazy = { priprav, zapis };
if (!prikazy[prikaz]) { console.error('použitie: alty-davka.mjs priprav|zapis …'); process.exit(1); }
prikazy[prikaz]().catch((e) => { console.error(e); process.exit(1); });
